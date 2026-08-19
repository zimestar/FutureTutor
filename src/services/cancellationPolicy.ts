import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { resolveCancellationAuthority, type CancellationActorRole } from "@/services/cancellationAuthorization";
import { convergeCancelledBookingPayment } from "@/services/payments";
import { writeAuditLog } from "@/lib/audit";
import { notifyUser } from "@/lib/notify";
import { withSerializableRetry } from "@/lib/serializableRetry";

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export type CancellationTier = "FULL_REFUND" | "PARTIAL_REFUND" | "NO_REFUND";

/**
 * Exact boundary math, integer milliseconds — >= on both thresholds so no
 * instant falls into two branches: exactly 48h -> 100%, exactly 24h -> 50%.
 * This tier table is a given product specification, unchanged from before
 * Phase H.8 — confirmed correct by the H.8 audit and re-verified here.
 */
export function calculateCancellationRefund(
  sessionStartAt: Date,
  now: Date,
  amountCents: number
): { tier: CancellationTier; refundPercent: number; refundCents: number } {
  const msUntilSession = sessionStartAt.getTime() - now.getTime();

  let tier: CancellationTier;
  let refundPercent: number;
  if (msUntilSession >= FORTY_EIGHT_HOURS_MS) {
    tier = "FULL_REFUND";
    refundPercent = 1;
  } else if (msUntilSession >= TWENTY_FOUR_HOURS_MS) {
    tier = "PARTIAL_REFUND";
    refundPercent = 0.5;
  } else {
    tier = "NO_REFUND";
    refundPercent = 0;
  }

  return { tier, refundPercent, refundCents: Math.round(amountCents * refundPercent) };
}

/**
 * Phase H.8 (§W) — server-computed, pre-cancellation refund-consequence
 * preview text. Purely informational for the UI; the server calculation
 * (calculateCancellationRefund) remains the sole source of truth. Never
 * says "refund issued" for the NO_REFUND tier (§15).
 */
export function describeCancellationConsequence(input: {
  isTutorViewer: boolean;
  paymentStatus: "PENDING" | "REQUIRES_ACTION" | "AUTHORIZED" | "CAPTURED" | null;
  sessionStartAt: Date;
  now: Date;
  amountCents: number;
  currency: string;
}): string {
  if (input.isTutorViewer) {
    return "Cancelling this session issues the customer a full refund.";
  }
  if (input.paymentStatus === "PENDING" || input.paymentStatus === "REQUIRES_ACTION" || input.paymentStatus === "AUTHORIZED") {
    return "Cancel now — no charge was ever completed; any pending hold will be released.";
  }
  const { tier, refundCents } = calculateCancellationRefund(input.sessionStartAt, input.now, input.amountCents);
  const amount = `${(refundCents / 100).toFixed(2)} ${input.currency}`;
  if (tier === "FULL_REFUND") return `Cancel now — Full refund: ${amount}`;
  if (tier === "PARTIAL_REFUND") return `Cancel now — 50% refund: ${amount}`;
  return "Cancel now — No refund under the cancellation policy";
}

const CANCELLABLE_STATUSES = ["DRAFT", "PENDING_PAYMENT", "CONFIRMED"] as const;

export class BookingNotCancellableError extends Error {}
/** resolveCancellationAuthority returned "DENIED" (either layer). */
export class NotAuthorizedToCancelError extends Error {}
/** now >= booking.startAt, re-evaluated inside the authoritative transaction. */
export class SessionAlreadyStartedError extends Error {}
/** A specific subtype of "denied," raised only when the authoritative
 * (Layer 2) re-check specifically detects a REVOKED guardian relationship
 * (not merely "never had authority") — distinguished for a clearer
 * support-facing message; the Server Action still maps it to the same
 * generic user-facing denial copy as any other authorization failure. */
export class GuardianAuthorityRevokedError extends NotAuthorizedToCancelError {}
/**
 * Pre-Phase-4 H.8 hardening — raised when a Session_ row EXISTS for this
 * booking but was NOT in SCHEDULED status at the instant this transaction's
 * guarded Session_ write ran (see step 9 below). A MISSING Session_ row
 * (every DRAFT/PENDING_PAYMENT booking — Session_ is only ever created once
 * a Booking reaches CONFIRMED, see payments.ts's tx.session_.create gated
 * on that transition) is NOT this error and never was — that remains the
 * existing, benign, common case, and cancellation proceeds exactly as
 * before. This error is reserved for the genuinely inconsistent case: a
 * Session_ row exists and has already moved off SCHEDULED (e.g.
 * recordSessionCheckIn's own SCHEDULED -> IN_PROGRESS transition, which has
 * no upper time bound tied to Booking.startAt and can fire from an early
 * dual check-in inside the pre-start check-in window — see the H.8 Session
 * Writer Hardening report §2/§4 for the concrete, currently-reachable
 * scenario this closes — or a concurrent no-show/cancellation writer having
 * already resolved it). Thrown INSIDE the same Serializable transaction as
 * every other write in cancelBookingWithRefund, so raising it rolls back
 * the WHOLE attempt: the Booking status change, BookingStatusHistory row,
 * AuditLog rows, and TutorEarning void from steps 4-8 above never commit.
 */
export class SessionNotCancellableError extends Error {}

const AUDIT_ACTION_BY_ROLE: Record<Exclude<CancellationActorRole, "DENIED">, string> = {
  SELF_MANAGED_STUDENT: "booking.cancelled_by_customer",
  GUARDIAN: "booking.cancelled_by_customer",
  TUTOR_OWNER: "booking.cancelled_by_tutor",
  ADMIN: "booking.cancelled_by_admin",
  SUPER_ADMIN: "booking.cancelled_by_admin",
};

export const CANCELLATION_INTENT_AUDIT_ACTIONS = [
  "booking.cancelled_by_customer",
  "booking.cancelled_by_tutor",
  "booking.cancelled_by_admin",
] as const;

export interface CancelBookingWithRefundOptions {
  /** Fresh-read from the DB by the caller, never trusted from a stale
   * session object at the authoritative layer (§I of the H.8 plan). */
  actorRole: Role;
  /** Injectable clock — real time by default. Both Layer 1 (fast
   * pre-check, may use a slightly-stale `now`) and the authoritative
   * transaction call this fresh, immediately before each comparison. */
  clock?: () => Date;
}

/**
 * Phase H.8 — full rewrite. A cancellation is one atomic authorization +
 * Booking/TutorEarning/Session_/TutoringRequest mutation (inside a
 * Serializable transaction, Phase 1) followed by one idempotent payment
 * convergence step (outside any transaction, Phase 2) — mirroring the G.1
 * Step A/B/C shape at the level of the whole cancellation operation.
 */
export async function cancelBookingWithRefund(
  bookingId: string,
  actorUserId: string,
  options: CancelBookingWithRefundOptions
): Promise<void> {
  const clock = options.clock ?? (() => new Date());

  // Phase H.8.3 — bounded retry on a genuine Postgres Serializable
  // write-conflict (P2034), reusing the same withSerializableRetry
  // primitive payments.ts already applies around convergeToCaptured /
  // applyStripeRefundStatusConvergence for exactly this class of conflict
  // (src/lib/serializableRetry.ts). Reproduced directly (H.8.2 final
  // recovery gate, cancellationConcurrency.integration.test.ts test #7):
  // genuine same-instant contention between this transaction's own
  // tx.tutorEarning.updateMany (step 8 below) and markEligibleEarnings'
  // plain updateMany against the SAME TutorEarning row can abort this
  // Serializable transaction with P2034 — classic write-skew detection,
  // not a bug in either query, and never a partial/corrupting write (the
  // whole transaction rolls back atomically on abort).
  //
  // The retry boundary is this $transaction call ONLY:
  //  - Every retry attempt opens a brand-new transaction via the callback
  //    below, so it always re-fetches the Booking and re-evaluates
  //    authorization (resolveCancellationAuthority, step 2) against fresh
  //    state — never a stale, reused authorization decision.
  //  - Every write inside this transaction (Booking, BookingStatusHistory,
  //    AuditLog, TutorEarning, Session_, TutoringRequest, Notification) is
  //    transactional, so an aborted attempt commits nothing at all — zero
  //    partial writes, zero duplicate audit rows. No Stripe call happens
  //    inside this transaction; Phase 2 below (convergeCancelledBookingPayment,
  //    the only step that talks to Stripe) runs entirely outside this retry
  //    boundary, exactly once, after the transaction has already committed
  //    — unchanged by this hardening.
  //  - withSerializableRetry only retries P2034; every other error
  //    (NotAuthorizedToCancelError, SessionAlreadyStartedError,
  //    BookingNotCancellableError, or anything unexpected) is rethrown
  //    immediately on first occurrence, never retried or swallowed.
  const result = await withSerializableRetry(() =>
    db.$transaction(
    async (tx) => {
      // 1. Re-fetch booking fresh via tx — never trust a pre-transaction read.
      const booking = await tx.booking.findUniqueOrThrow({
        where: { id: bookingId },
        include: { tutorProfile: { select: { userId: true } }, payment: true },
      });

      // 2. Authoritative re-check (Layer 2) — the exact same function as
      // Layer 1, re-invoked with tx, immediately before the guarded write.
      const authority = await resolveCancellationAuthority(tx, actorUserId, options.actorRole, {
        studentProfileId: booking.studentProfileId,
        tutorProfileUserId: booking.tutorProfile.userId,
      });
      if (authority === "DENIED") throw new NotAuthorizedToCancelError();

      // 3. Time floor, re-evaluated inside the authoritative transaction —
      // never only at Layer 1's pre-check.
      const now = clock();
      if (now.getTime() >= booking.startAt.getTime()) throw new SessionAlreadyStartedError();

      if (!(CANCELLABLE_STATUSES as readonly string[]).includes(booking.status)) {
        throw new BookingNotCancellableError();
      }

      const isTutorCancelling = authority === "TUTOR_OWNER";
      const fromStatus = booking.status;

      // 4. Guarded updateMany — the concurrency guard (unchanged property
      // from before H.8: a single atomic UPDATE, safe under any isolation
      // level for the STATUS transition itself; Serializable protects the
      // AUTHORIZATION decision above, which spans multiple reads).
      const updated = await tx.booking.updateMany({
        where: { id: booking.id, status: { in: [...CANCELLABLE_STATUSES] } },
        data: {
          status: "CANCELLED",
          cancelledByUserId: actorUserId,
          cancelledAt: now,
          cancellationReason: isTutorCancelling ? "Cancelled by tutor" : "Cancelled by customer",
        },
      });
      if (updated.count === 0) throw new BookingNotCancellableError();

      // 5. BookingStatusHistory, with reason populated.
      const reasonText = isTutorCancelling ? "Cancelled by tutor" : `Cancelled by ${authority.toLowerCase()}`;
      await tx.bookingStatusHistory.create({
        data: { bookingId: booking.id, fromStatus, toStatus: "CANCELLED", changedByUserId: actorUserId, reason: reasonText },
      });

      // 6. Tier — computed and recorded regardless of payment.status, so a
      // later out-of-band convergence (capture-wins race) can recover the
      // exact tier the customer/tutor was entitled to at cancellation time.
      const amountCents = booking.payment?.amountCents ?? 0;
      const remainingCents = amountCents - (booking.payment?.refundedAmountCents ?? 0);
      const tierResult = calculateCancellationRefund(booking.startAt, now, amountCents);
      const computedRefundCents = isTutorCancelling
        ? Math.max(0, remainingCents)
        : Math.max(0, Math.min(tierResult.refundCents, remainingCents));
      const tier: CancellationTier = isTutorCancelling ? "FULL_REFUND" : tierResult.tier;

      // 7. One enriched AuditLog row — the durable "cancellation intent"
      // record consulted by every later convergence trigger. Provably
      // unique per booking: this write is only reached after step 4's
      // guarded updateMany already succeeded, and CANCELLABLE_STATUSES
      // excludes CANCELLED, so this transaction (and this specific write)
      // cannot run to completion a second time for the same booking.
      await writeAuditLog(
        {
          actorUserId,
          action: AUDIT_ACTION_BY_ROLE[authority],
          entityType: "Booking",
          entityId: booking.id,
          metadata: {
            actorRole: authority,
            learnerStudentProfileId: booking.studentProfileId,
            payerUserId: booking.payment?.payerUserId ?? null,
            tier,
            refundPercent: isTutorCancelling ? 1 : tierResult.refundPercent,
            computedRefundCents,
            isTutorCancelling,
            quickMatchOrigin: booking.tutoringRequestId != null,
          },
        },
        tx
      );

      // 8. TutorEarning void — ONLY if no TutorTransfer row exists yet at
      // all (PENDING or COMPLETED). Read-then-conditionally-act inside the
      // same Serializable transaction — race-safe against a concurrent
      // tutorTransfer.create (§R of the H.8 plan).
      const earning = await tx.tutorEarning.findUnique({ where: { bookingId: booking.id }, include: { transfer: true } });
      if (earning && earning.transfer == null) {
        await tx.tutorEarning.updateMany({
          where: { id: earning.id, status: { in: ["PENDING_ELIGIBLE", "ELIGIBLE"] } },
          data: { status: "CANCELLED", cancelledAt: now },
        });
        await writeAuditLog(
          { actorUserId: null, action: "tutor_earning.cancelled", entityType: "TutorEarning", entityId: earning.id, metadata: { bookingId: booking.id } },
          tx
        );
      } else if (earning && earning.transfer != null) {
        // A TutorTransfer has already been claimed (PENDING) or completed
        // — do not void; FutureTutor absorbs this exposure, never an
        // automatic clawback (§S of the H.8 plan).
        await writeAuditLog(
          {
            actorUserId,
            action: "tutor_earning.transferred_exposure_at_cancellation",
            entityType: "TutorEarning",
            entityId: earning.id,
            metadata: {
              bookingId: booking.id,
              tutorTransferId: earning.transfer.id,
              transferAmountCents: earning.transfer.amountCents,
              transferStatus: earning.transfer.status,
              refundAmountCents: computedRefundCents,
            },
          },
          tx
        );
      }

      // 9. Session_ — SCHEDULED -> CANCELLED only, contained (§T). Pre-Phase-4
      // hardening: the returned match count is now checked, mirroring
      // sessionLifecycle.ts's own guarded-updateMany + count-check
      // convention (applyNoShowConvergenceIfDue / recordSessionCheckIn's
      // SCHEDULED -> IN_PROGRESS write) and this SAME function's own step 4
      // (Booking updateMany, guard + throw on count===0) — the established
      // local precedent for a write with real financial consequences, not
      // sessionLifecycle.ts's silent-branch precedent (appropriate there
      // because no-show convergence is a deliberately idempotent
      // re-evaluation; cancellation is a one-shot action with a refund
      // attached, so a zero-row match must never be silently treated as
      // "cancellation succeeded").
      //
      // A zero-row match has exactly two possible causes, and they are NOT
      // equivalent:
      //  (a) No Session_ row exists at all for this booking. This is the
      //      common, entirely benign case: Session_ rows are only ever
      //      created once a Booking reaches CONFIRMED (payments.ts's
      //      tx.session_.create, gated on that exact transition) — a
      //      DRAFT/PENDING_PAYMENT booking (both CANCELLABLE_STATUSES
      //      members) legitimately has no Session_ row yet. Cancellation
      //      must proceed normally here, exactly as before this hardening.
      //  (b) A Session_ row EXISTS but is no longer SCHEDULED. This is a
      //      genuine domain-consistency violation — most concretely,
      //      recordSessionCheckIn's own SCHEDULED -> IN_PROGRESS transition
      //      has no upper time bound tied to Booking.startAt (only a lower
      //      bound, startAt - 15min): an early dual check-in can legitimately
      //      move Session_ to IN_PROGRESS while Booking.status is still
      //      CONFIRMED and `now` is still < startAt — i.e. still inside
      //      THIS function's own cancellable window (step 3). Proceeding
      //      here would cancel the Booking and compute/issue a refund for a
      //      session that has already started with both parties present —
      //      never a benign no-op. This must abort the whole transaction.
      const sessionCancellation = await tx.session_.updateMany({
        where: { bookingId: booking.id, status: "SCHEDULED" },
        data: { status: "CANCELLED" },
      });
      if (sessionCancellation.count === 0) {
        const existingSession = await tx.session_.findUnique({ where: { bookingId: booking.id }, select: { id: true } });
        if (existingSession) {
          throw new SessionNotCancellableError();
        }
        // else: no Session_ row exists yet (DRAFT/PENDING_PAYMENT) — the
        // benign case (a) above; fall through, cancellation proceeds.
      }

      // 10. TutoringRequest — make a Quick-Match-originated booking's
      // request terminal, never automatically rematched (§U).
      if (booking.tutoringRequestId) {
        await tx.tutoringRequest.updateMany({
          where: { id: booking.tutoringRequestId, status: "BOOKED" },
          data: { status: "CANCELLED", cancelledAt: now },
        });
      }

      // Tutor notification — always fires on any cancellation (unless the
      // tutor is the one who cancelled, they already know), independent of
      // payment outcome (§X).
      if (!isTutorCancelling) {
        await notifyUser(tx, {
          userId: booking.tutorProfile.userId,
          type: "booking.cancelled_notify_tutor",
          title: "Session cancelled",
          body: "One of your upcoming sessions was cancelled.",
          metadata: { bookingId: booking.id },
        });
      }

      return { bookingId: booking.id };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  );

  // Phase 2 — payment convergence, outside the transaction, idempotent,
  // callable repeatedly. Never surfaced as a cancellation failure to the
  // user — the booking genuinely is cancelled at this point (Phase 1
  // already committed) regardless of how the payment mechanics resolve; a
  // failure here is logged and left for the reconciliation sweep to retry,
  // never rethrown to the caller (master prompt §27 — distinguish business
  // rejection from temporary financial convergence uncertainty).
  try {
    await convergeCancelledBookingPayment(result.bookingId);
  } catch (error) {
    console.error("convergeCancelledBookingPayment failed after a successful cancellation (non-fatal, retried by the reconciliation sweep)", result.bookingId, error);
  }
}
