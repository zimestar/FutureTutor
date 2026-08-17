import "server-only";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getStripeClient } from "@/lib/stripe";
import { paymentsUseStripe } from "@/lib/paymentMode";
import { writeAuditLog } from "@/lib/audit";
import { notifyUser } from "@/lib/notify";
import {
  resolveCaptureOutcomeAndConverge,
  cancelAuthorizedPayment,
  reconcileStripeFinancialDetails,
  resolveRefundOutcomeAndConverge,
  convergeCancelledBookingPayment,
  isRefundObligationSatisfied,
} from "@/services/payments";

const STUCK_PAYMENT_THRESHOLD_MS = 30 * 60 * 1000; // [YOUR IDEA — INITIAL DEFAULT], §7/§19 of the Phase G plan

/**
 * TutorEarning eligibility depends only on eligibleAt and the booking not
 * having been voided — never on Stripe Connect readiness (Correction 6 of
 * the Phase G plan). Payout-readiness is a separate, later check, in
 * createTransferForEarning below.
 */
export async function markEligibleEarnings(): Promise<number> {
  const now = new Date();
  const result = await db.tutorEarning.updateMany({
    where: { status: "PENDING_ELIGIBLE", eligibleAt: { lte: now } },
    data: { status: "ELIGIBLE" },
  });
  return result.count;
}

async function finalizeTransfer(transferId: string, stripeTransferId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const transfer = await tx.tutorTransfer.findUniqueOrThrow({ where: { id: transferId } });
    if (transfer.status === "COMPLETED") return; // already converged

    await tx.tutorTransfer.updateMany({
      where: { id: transferId, status: "PENDING" },
      data: { status: "COMPLETED", stripeTransferId, completedAt: new Date() },
    });
    await tx.tutorEarning.updateMany({
      where: { id: transfer.tutorEarningId, status: "ELIGIBLE" },
      data: { status: "TRANSFERRED", transferredAt: new Date() },
    });

    await writeAuditLog(
      { actorUserId: null, action: "tutor_transfer.completed", entityType: "TutorTransfer", entityId: transferId },
      tx
    );

    const earning = await tx.tutorEarning.findUnique({
      where: { id: transfer.tutorEarningId },
      include: { tutorProfile: { select: { userId: true } } },
    });
    if (earning) {
      await notifyUser(tx, {
        userId: earning.tutorProfile.userId,
        type: "tutor_transfer.completed",
        title: "Payout sent",
        body: `${(transfer.amountCents / 100).toFixed(2)} ${transfer.currency} has been sent to your account.`,
        metadata: { tutorEarningId: transfer.tutorEarningId },
      });
    }
  });
}

/**
 * Step A (durable local row) / Step B (Stripe transfer, outside any
 * transaction) / Step C (finalizeTransfer) — same uniform pattern as every
 * other external Stripe call in this codebase. Only attempts the transfer
 * if the tutor's Connect account is actually ACTIVE; otherwise the earning
 * simply stays ELIGIBLE and this function no-ops (tried again next sweep).
 */
export async function createTransferForEarning(earningId: string): Promise<void> {
  const earning = await db.tutorEarning.findUniqueOrThrow({
    where: { id: earningId },
    include: { tutorProfile: true },
  });
  if (earning.status !== "ELIGIBLE") return;
  if (earning.tutorProfile.stripeConnectStatus !== "ACTIVE" || !earning.tutorProfile.stripeConnectAccountId) return;

  if (paymentsUseStripe()) {
    // Separate charges and transfers attributes the transfer back to its
    // originating charge via source_transaction — resolve/backfill
    // Payment.stripeChargeId first (Phase G.1) rather than silently create
    // a transfer without that linkage. If it still can't be resolved,
    // defer entirely (no TutorTransfer row created/advanced this sweep) —
    // the earning stays ELIGIBLE, nothing is lost, and the next sweep
    // retries. Applies uniformly whether a TutorTransfer row already
    // exists (PENDING from a prior sweep) or not.
    const bookingForCharge = await db.booking.findUnique({
      where: { id: earning.bookingId },
      select: { payment: { select: { id: true, stripeChargeId: true } } },
    });
    if (bookingForCharge?.payment && !bookingForCharge.payment.stripeChargeId) {
      await reconcileStripeFinancialDetails(bookingForCharge.payment.id).catch(() => {});
      const refreshed = await db.booking.findUnique({
        where: { id: earning.bookingId },
        select: { payment: { select: { stripeChargeId: true } } },
      });
      if (!refreshed?.payment?.stripeChargeId) return; // still unresolved — defer, retried next sweep
    }
  }

  let transfer = await db.tutorTransfer.findUnique({ where: { tutorEarningId: earningId } });
  if (!transfer) {
    try {
      transfer = await db.tutorTransfer.create({
        data: {
          id: randomUUID(),
          tutorEarningId: earningId,
          tutorProfileId: earning.tutorProfileId,
          amountCents: earning.amountCents,
          currency: earning.currency,
          status: "PENDING",
          initiatedAt: new Date(),
        },
      });
    } catch (error) {
      // Lost a concurrent race to another caller creating the same
      // TutorTransfer (unique on tutorEarningId) — same pattern as
      // getOrCreatePaymentForQuote/recordPaymentAttempt: the DB constraint
      // is the authoritative guard, not this catch. The winning caller (or,
      // if it crashes before reaching Stripe, the next processEligibleTransfers
      // sweep re-invoking this same function once earning.status is still
      // ELIGIBLE) owns driving this transfer to Stripe — deferring here
      // avoids a second concurrent stripe.transfers.create attempt and the
      // duplicate audit-log/notification risk that would come with also
      // racing into finalizeTransfer.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return;
      }
      throw error;
    }
  }
  if (transfer.status === "COMPLETED") return;

  // Phase H.8 (§R fix #1) — narrow the cancellation-race window: one
  // additional fresh status check immediately before the Stripe call, not
  // just at function entry. Shrinks the exposure window from "the entire
  // function body" down to "the gap between this read and the Stripe
  // call" — the same residual-window shape every other Step A/B/C
  // primitive in this codebase already accepts as unavoidable.
  const freshEarning = await db.tutorEarning.findUnique({ where: { id: earningId }, select: { status: true } });
  if (freshEarning?.status !== "ELIGIBLE") return; // lost the race to a concurrent cancellation — bail before calling Stripe

  if (!paymentsUseStripe()) {
    // Dev/test bypass — no Stripe call, mirrors preparePaymentForQuote's
    // own dev-bypass shape.
    await finalizeTransfer(transfer.id, `dev-bypass-${transfer.id}`);
    return;
  }

  const booking = await db.booking.findUnique({
    where: { id: earning.bookingId },
    select: { payment: { select: { stripeChargeId: true } } },
  });

  const stripe = getStripeClient();
  try {
    const stripeTransfer = await stripe.transfers.create(
      {
        amount: transfer.amountCents,
        currency: transfer.currency.toLowerCase(),
        destination: earning.tutorProfile.stripeConnectAccountId,
        source_transaction: booking?.payment?.stripeChargeId ?? undefined,
        metadata: { tutorEarningId: earning.id, tutorTransferId: transfer.id },
      },
      { idempotencyKey: `transfer:${earningId}` }
    );
    await finalizeTransfer(transfer.id, stripeTransfer.id);
  } catch (error) {
    await db.tutorTransfer.updateMany({
      where: { id: transfer.id, status: "PENDING" },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        failureReason: error instanceof Error ? error.message : "Unknown error",
      },
    });
    await writeAuditLog({
      actorUserId: null,
      action: "tutor_transfer.failed",
      entityType: "TutorTransfer",
      entityId: transfer.id,
    });
  }
}

/** The cron sweep's entry point for the earning/transfer half of
 * reconciliation — see reconcileStuckPayments below for the payment half. */
export async function processEligibleTransfers(): Promise<{ markedEligible: number; transfersAttempted: number }> {
  const markedEligible = await markEligibleEarnings();

  const candidates = await db.tutorEarning.findMany({
    where: { status: "ELIGIBLE" },
    select: { id: true },
    take: 100,
  });
  for (const candidate of candidates) {
    await createTransferForEarning(candidate.id);
  }
  return { markedEligible, transfersAttempted: candidates.length };
}

/**
 * Three-tier recovery for Payments left unresolved beyond the safe window
 * (Correction 1 of the Phase G plan §7/§8): a Payment whose Stripe object
 * id is already known is safely re-resolved via a plain retrieve (tier 2);
 * one whose Stripe id was never persisted (Step A committed, the process
 * crashed before Step C) is NOT blindly re-POSTed — it's left in its
 * current, visibly-unresolved state and flagged for admin review (tier 3),
 * since no live metadata-search integration is built this phase.
 */
export async function reconcileStuckPayments(): Promise<void> {
  if (!paymentsUseStripe()) return;
  const threshold = new Date(Date.now() - STUCK_PAYMENT_THRESHOLD_MS);

  const stuckAuthorized = await db.payment.findMany({
    where: { status: "AUTHORIZED", updatedAt: { lt: threshold }, stripePaymentIntentId: { not: null } },
    select: { id: true },
    take: 50,
  });
  for (const payment of stuckAuthorized) {
    await resolveCaptureOutcomeAndConverge(payment.id);
  }

  const abandoned = await db.payment.findMany({
    where: { status: { in: ["PENDING", "REQUIRES_ACTION"] }, createdAt: { lt: threshold }, stripePaymentIntentId: { not: null } },
    select: { id: true },
    take: 50,
  });
  for (const payment of abandoned) {
    await cancelAuthorizedPayment(payment.id);
  }

  const stuckWithoutStripeId = await db.payment.findMany({
    where: { status: "PENDING", stripePaymentIntentId: null, createdAt: { lt: threshold } },
    select: { id: true, customerPriceQuoteId: true },
    take: 50,
  });
  for (const payment of stuckWithoutStripeId) {
    await writeAuditLog({
      actorUserId: null,
      action: "payment.reconciliation_stuck",
      entityType: "Payment",
      entityId: payment.id,
      metadata: { customerPriceQuoteId: payment.customerPriceQuoteId },
    });
  }

  // Phase G.1 — backfill Stripe charge/fee linkage for captured Payments
  // where it wasn't available synchronously at capture time (see
  // reconcileStripeFinancialDetails's own doc comment).
  const capturedMissingChargeDetails = await db.payment.findMany({
    where: { status: "CAPTURED", stripeChargeId: null, stripePaymentIntentId: { not: null } },
    select: { id: true },
    take: 50,
  });
  for (const payment of capturedMissingChargeDetails) {
    await reconcileStripeFinancialDetails(payment.id).catch(() => {});
  }

  // ---------------------------------------------------------------------
  // Phase H.8 (§Q) — three new refund-reconciliation tiers, added to this
  // same sweep (reused, not a second cron architecture).
  // ---------------------------------------------------------------------

  // Tier 4 — Refund rows stuck PENDING past the same threshold (network
  // ambiguity, crashed process, or a not-yet-resolved async refund
  // method). PENDING is the one Refund.status value safe to auto-retry via
  // the ordinary convergence function — it means "no attempt has yet
  // reached a terminal outcome," not "an attempt already failed."
  const stuckRefunds = await db.refund.findMany({
    where: { status: "PENDING", updatedAt: { lt: threshold } },
    select: { id: true },
    take: 50,
  });
  for (const refund of stuckRefunds) {
    await resolveRefundOutcomeAndConverge(refund.id).catch(() => {});
  }

  // Tier 5 — CANCELLED Bookings whose Payment never reached a terminal
  // disposition (covers: the synchronous cancellation's own convergence
  // call threw and was never retried; a late-capture-wins race whose
  // convergeCancelledBookingPayment call was itself interrupted).
  const unconvergedCancelledBookings = await db.booking.findMany({
    where: { status: "CANCELLED", payment: { status: { in: ["AUTHORIZED", "CAPTURED", "PENDING", "REQUIRES_ACTION"] } } },
    select: { id: true },
    take: 50,
  });
  for (const booking of unconvergedCancelledBookings) {
    await convergeCancelledBookingPayment(booking.id).catch(() => {});
  }

  // Tier 6 — CANCELLED Bookings whose latest Refund attempt is
  // definitively FAILED and whose obligation is NOT yet satisfied. This
  // tier's ONLY job is VISIBILITY — it deliberately never calls
  // resolveRefundOutcomeAndConverge (would no-op immediately on a FAILED
  // refund, by design) and never calls recoverFailedRefund (that would be
  // an automatic retry of a failed Stripe Refund object, which the minimum
  // safe recovery policy explicitly forbids) — it keeps the outstanding
  // obligation surfaced for a deliberate, future, human-triggered recovery.
  const failedRefundsWithOutstandingObligation = await db.refund.findMany({
    where: { status: "FAILED", booking: { status: "CANCELLED" } },
    select: { id: true, bookingId: true, amountCents: true, paymentId: true, payment: { select: { refundedAmountCents: true } } },
    take: 50,
  });
  for (const refund of failedRefundsWithOutstandingObligation) {
    if (isRefundObligationSatisfied(refund.amountCents, refund.payment)) continue;
    await writeAuditLog({
      actorUserId: null,
      action: "refund.obligation_outstanding",
      entityType: "Refund",
      entityId: refund.id,
      metadata: { bookingId: refund.bookingId, paymentId: refund.paymentId, owedCents: refund.amountCents, refundedCents: refund.payment.refundedAmountCents },
    });
  }

  // Tier 7 (Phase H.8.1, §0/§11) — see runTier7RecentSuccessReverify's own
  // doc comment below for the full pagination/window/isolation design.
  await runTier7RecentSuccessReverify();
}

// ---------------------------------------------------------------------
// Phase H.8.1 (§0/§11) — Tier 7: bounded, EXHAUSTIVELY-paginated recent-
// success re-verification. Corrects the H.8.1 draft's originally-proposed
// `findMany({ take: 50 })` design, which could re-select the same 50 rows
// forever and starve later-eligible refunds (plan §0 items 1-2).
//
// RECENT_SUCCESS_REVERIFY_WINDOW_DAYS is a FutureTutor OPERATIONAL POLICY,
// NOT a Stripe guarantee (plan §0 item 4 / §3a / §3f): Stripe documents that
// failed-refund processing "can take up to 30 days from the post date," but
// never states a hard finality period after which a succeeded Refund can no
// longer fail. 30 documented days + a 5-day operational safety margin = 35.
// This window applies ONLY to this proactive polling tier — it must NEVER
// gate refund.failed/refund.updated webhook handling (stripeWebhooks.ts's
// unmodified refund.* case, via resolveRefundOutcomeAndConverge's
// observedStripeRefundId path), which remains unbounded (plan §0 item 5).
// ---------------------------------------------------------------------
const RECENT_SUCCESS_REVERIFY_WINDOW_DAYS = 35;
const RECENT_SUCCESS_REVERIFY_WINDOW_MS = RECENT_SUCCESS_REVERIFY_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Injectable so tests can prove REAL multi-page pagination with a tiny
 * batch size (plan §0 item 8) without needing 51 heavy fixtures. Every
 * production call site uses the default. */
export const TIER7_DEFAULT_BATCH_SIZE = 50;

/**
 * Exhaustive (updatedAt ASC, id ASC) cursor pagination over every
 * currently-SUCCEEDED, Stripe-linked Refund inside the reconciliation
 * window — never a single fixed-size query. Required invariant (plan §0
 * item 1): every Refund that is SUCCEEDED, has a non-null stripeRefundId,
 * and falls inside the window as of this invocation's start must be
 * reachable within this one call.
 *
 * A "still succeeded" verification is a pure financial AND row-level
 * no-op: resolveRefundOutcomeAndConverge's own guarded updateMany
 * (`where: { status: "PENDING" }`) matches zero rows for an
 * already-SUCCEEDED refund, so NOTHING is written — Refund.updatedAt is
 * never touched merely to reschedule a check (plan §0 item 3). This is
 * exactly what makes the cursor safe: a row's position in the ordering can
 * only change via a REAL state mutation (an actual reversal), never as a
 * side effect of this sweep's own reads.
 *
 * Per-candidate failures are isolated (plan §0 item 7): one throwing
 * Stripe retrieve must never abort the rest of the batch, and is recorded
 * via AuditLog (never a silent `.catch(() => {})` with zero observability).
 */
export async function runTier7RecentSuccessReverify(batchSize: number = TIER7_DEFAULT_BATCH_SIZE): Promise<void> {
  const windowStart = new Date(Date.now() - RECENT_SUCCESS_REVERIFY_WINDOW_MS);
  let cursor: { updatedAt: Date; id: string } | null = null;

  for (;;) {
    const whereClause: Prisma.RefundWhereInput = {
      status: "SUCCEEDED",
      stripeRefundId: { not: null },
      updatedAt: { gte: windowStart },
      ...(cursor
        ? {
            OR: [
              { updatedAt: { gt: cursor.updatedAt } },
              { updatedAt: cursor.updatedAt, id: { gt: cursor.id } },
            ],
          }
        : {}),
    };
    const batch: Array<{ id: string; stripeRefundId: string | null; updatedAt: Date }> = await db.refund.findMany({
      where: whereClause,
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      select: { id: true, stripeRefundId: true, updatedAt: true },
      take: batchSize,
    });
    if (batch.length === 0) break;

    for (const candidate of batch) {
      try {
        // Forces the "confirm current attempt" path (payments.ts §7.1) even
        // though no real webhook fired — a webhook-independent safety net,
        // reusing the exact same corrected convergence function; zero new
        // convergence logic lives in this tier.
        //
        // NOTE: resolveRefundOutcomeAndConverge fails SOFT on a Stripe
        // retrieve error (returns "uncertain", it does not throw) — that is
        // deliberate, existing H.8 behavior, unchanged here. So per-item
        // failure isolation must inspect the RETURN VALUE too, not only
        // catch thrown exceptions (which cover a different failure class —
        // e.g. a DB/transaction error surfacing from inside convergence).
        // Both classes are logged; neither aborts the batch.
        const outcome = await resolveRefundOutcomeAndConverge(candidate.id, { observedStripeRefundId: candidate.stripeRefundId! });
        if (outcome === "uncertain") {
          await writeAuditLog({
            actorUserId: null,
            action: "refund.tier7_reverify_error",
            entityType: "Refund",
            entityId: candidate.id,
            metadata: { reason: "resolveRefundOutcomeAndConverge returned uncertain (Stripe retrieve failure or a validation mismatch)" },
          }).catch(() => {}); // an audit-write failure itself must never abort the batch either
        }
      } catch (error) {
        await writeAuditLog({
          actorUserId: null,
          action: "refund.tier7_reverify_error",
          entityType: "Refund",
          entityId: candidate.id,
          metadata: { error: error instanceof Error ? error.message.slice(0, 500) : "Unknown error" },
        }).catch(() => {}); // an audit-write failure itself must never abort the batch either
      }
    }

    const last = batch[batch.length - 1];
    cursor = { updatedAt: last.updatedAt, id: last.id };
    if (batch.length < batchSize) break; // last (possibly partial) page — the eligible set as of this invocation's start is exhausted
  }
}
