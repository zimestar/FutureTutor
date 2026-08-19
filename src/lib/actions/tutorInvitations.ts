"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { notifyUser } from "@/lib/notify";
import { paymentsUseStripe } from "@/lib/paymentMode";
import { withSerializableRetry } from "@/lib/serializableRetry";
import { respondTutorInvitationSchema, declineTutorInvitationSchema } from "@/schemas/tutoringRequest";
import { isTutorEligibleForRequest } from "@/services/tutorEligibility";
import {
  reserveBookingPendingPayment,
  SlotTakenError,
  NotAuthorizedForLearnerError,
  QuoteLearnerMismatchError,
} from "@/services/bookingCreation";
import { captureAuthorizedPayment, convergeToCaptured } from "@/services/payments";
import {
  acceptTutorPayoutQuote,
  cancelTutorPayoutQuote,
  TutorPayoutQuoteNotFoundError,
  TutorPayoutQuoteExpiredError,
  TutorPayoutQuoteNotActiveError,
  TutorPayoutQuoteAlreadyAcceptedError,
} from "@/services/tutorPayout";
import { advanceDispatch } from "@/services/quickMatchDispatch";

export type InvitationActionState = { error?: string; success?: boolean } | undefined;

class InvitationNotPendingError extends Error {}
class InvitationExpiredError extends Error {}
class TutorNotEligibleError extends Error {}
class PaymentNotReadyError extends Error {}

/**
 * Step A (Serializable, no Stripe call) — full revalidation, then an
 * atomic claim (MATCHING -> PAYMENT_PENDING) that prevents a second tutor
 * from winning the same request during a parallel round, then a
 * PENDING_PAYMENT reservation (see reserveBookingPendingPayment). Step B
 * (Stripe capture) and Step C (convergence) run afterward, outside this
 * transaction — see the Payment model's schema domain comment for the
 * full Step A/B/C rationale and why an external call must never be inside
 * a database transaction.
 *
 * A SlotTakenError/eligibility failure here is a candidate-level failure:
 * the transaction rolls back (undoing the claim too), and dispatch
 * continues to the next candidate/round for the *request* — it does not
 * become FAILED. A payment failure discovered afterward, in contrast, is a
 * request-level outcome (PAYMENT_FAILED) — the blocker is the customer's
 * card, not this tutor's availability, so dispatch does not continue.
 */
export async function acceptTutorInvitationAction(
  _prevState: InvitationActionState,
  formData: FormData
): Promise<InvitationActionState> {
  const t = await getTranslations("quickMatch.errors");
  const session = await auth();
  if (!session?.user || session.user.role !== "TUTOR") return { error: t("notATutor") };

  const parsed = respondTutorInvitationSchema.safeParse({ tutorInvitationId: formData.get("tutorInvitationId") });
  if (!parsed.success) return { error: t("invalidInput") };

  const tutorProfile = await db.tutorProfile.findUnique({ where: { userId: session.user.id } });
  if (!tutorProfile) return { error: t("invalidInput") };

  // Best-effort lookup only, for the catch block's dispatch-advance call —
  // not used for any authorization/state decision (those are all re-derived
  // inside the transaction below).
  const preflight = await db.tutorInvitation.findUnique({
    where: { id: parsed.data.tutorInvitationId },
    select: { tutoringRequestId: true },
  });

  let claimed: { bookingId: string; paymentId: string } | null = null;

  try {
    // P0 booking hardening — bounded retry on a genuine Postgres
    // Serializable write-conflict, reusing the same withSerializableRetry
    // primitive already applied around cancelBookingWithRefund (H.8.3) and
    // convergeTutorEarningFromSession (Phase 5B) for exactly this class of
    // conflict (src/lib/serializableRetry.ts). Safe because every read/write
    // in this closure goes through the `tx` passed to it — the invitation
    // read, the atomic MATCHING -> PAYMENT_PENDING claim,
    // acceptTutorPayoutQuote, reserveBookingPendingPayment,
    // notifyUser(tx, ...), and writeAuditLog(..., tx) all write only via
    // `tx`, with no ambient `db` writes and no network call anywhere in this
    // closure. An aborted attempt therefore rolls back atomically — the
    // claim, the payout-quote transition, the booking row, the
    // superseded-invitation updates, and the audit/notification rows all
    // undo together — so a from-scratch retry re-reads fresh state (a fresh
    // invitation/request status, a fresh eligibility check, a fresh
    // overlap check) rather than replaying anything stale. Step B/C
    // (Stripe capture/convergence) still run exactly once, outside this
    // retry boundary, unchanged.
    claimed = await withSerializableRetry(() =>
      db.$transaction(
      async (tx) => {
        const invitation = await tx.tutorInvitation.findUnique({ where: { id: parsed.data.tutorInvitationId } });
        if (!invitation || invitation.tutorProfileId !== tutorProfile.id || invitation.status !== "PENDING") {
          throw new InvitationNotPendingError();
        }
        if (invitation.expiresAt < new Date()) throw new InvitationExpiredError();
        if (!invitation.tutorPayoutQuoteId) throw new InvitationNotPendingError();

        const request = await tx.tutoringRequest.findUnique({ where: { id: invitation.tutoringRequestId } });
        if (!request || request.status !== "MATCHING" || !request.customerPriceQuoteId) {
          throw new InvitationNotPendingError();
        }

        const stillEligible = await isTutorEligibleForRequest(tx, tutorProfile.id, {
          subjectId: request.subjectId,
          academicLevelId: request.academicLevelId,
          tutoringMode: request.tutoringMode,
          requestedStartAt: request.requestedStartAt,
          durationMinutes: request.durationMinutes,
          city: request.city,
        });
        if (!stillEligible) throw new TutorNotEligibleError();

        const payment = await tx.payment.findUnique({ where: { customerPriceQuoteId: request.customerPriceQuoteId } });
        if (!payment) throw new PaymentNotReadyError();

        // Atomic claim — prevents a second tutor from winning the same
        // request during a parallel round (§7 scenario 1 of the Phase F
        // plan, unchanged mechanism, now guarding the payment-aware flow).
        const claimResult = await tx.tutoringRequest.updateMany({
          where: { id: request.id, status: "MATCHING" },
          data: { status: "PAYMENT_PENDING" },
        });
        if (claimResult.count === 0) throw new InvitationNotPendingError();

        await acceptTutorPayoutQuote(tx, invitation.tutorPayoutQuoteId, tutorProfile.id);

        const endAt = new Date(request.requestedStartAt.getTime() + request.durationMinutes * 60 * 1000);
        const availabilityRow = await tx.tutorAvailability.findFirst({ where: { tutorProfileId: tutorProfile.id } });
        const timezone = availabilityRow?.timezone ?? "UTC";

        const booking = await reserveBookingPendingPayment(tx, {
          // Phase H.7 — the actor re-checked here is the ORIGINAL requester
          // (Student or Parent) who initiated matching, resolved from the
          // TutoringRequest itself, never the tutor accepting this
          // invitation (session.user.id here is the tutor, who has no
          // learner/actor/payer role at all — see §23 of the H.7 prompt).
          actorUserId: request.createdByUserId,
          studentProfileId: request.studentProfileId,
          tutorProfileId: tutorProfile.id,
          subjectId: request.subjectId,
          academicLevelId: request.academicLevelId,
          startAt: request.requestedStartAt,
          endAt,
          timezone,
          mode: request.tutoringMode,
          paymentId: payment.id,
          customerPriceQuoteId: request.customerPriceQuoteId,
          tutorPayoutQuoteId: invitation.tutorPayoutQuoteId,
          tutoringRequestId: request.id,
          location:
            request.tutoringMode !== "ONLINE"
              ? {
                  addressLine1: request.addressLine1,
                  addressLine2: request.addressLine2,
                  city: request.city,
                  province: request.province,
                  postalCode: request.postalCode,
                }
              : null,
        });

        await tx.tutorInvitation.update({
          where: { id: invitation.id },
          data: { status: "ACCEPTED", respondedAt: new Date(), bookingId: booking.id },
        });

        const otherPending = await tx.tutorInvitation.findMany({
          where: { tutoringRequestId: request.id, status: "PENDING", id: { not: invitation.id } },
          select: { id: true, tutorPayoutQuoteId: true, tutorProfile: { select: { userId: true } } },
        });
        if (otherPending.length > 0) {
          await tx.tutorInvitation.updateMany({
            where: { id: { in: otherPending.map((other) => other.id) } },
            data: { status: "SUPERSEDED", respondedAt: new Date() },
          });
          for (const other of otherPending) {
            if (other.tutorPayoutQuoteId) await cancelTutorPayoutQuote(tx, other.tutorPayoutQuoteId);
            await notifyUser(tx, {
              userId: other.tutorProfile.userId,
              type: "quickmatch.invitation.superseded",
              title: "Request no longer available",
              body: "Another tutor accepted this request first.",
              metadata: { tutoringRequestId: request.id },
            });
          }
        }

        await writeAuditLog(
          {
            actorUserId: session.user.id,
            action: "quickmatch.invitation.accepted",
            entityType: "TutorInvitation",
            entityId: invitation.id,
            metadata: { tutoringRequestId: request.id, bookingId: booking.id },
          },
          tx
        );

        return { bookingId: booking.id, paymentId: payment.id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      )
    );
  } catch (error) {
    if (
      error instanceof SlotTakenError ||
      error instanceof InvitationNotPendingError ||
      error instanceof InvitationExpiredError ||
      error instanceof TutorNotEligibleError ||
      error instanceof PaymentNotReadyError ||
      error instanceof TutorPayoutQuoteNotFoundError ||
      error instanceof TutorPayoutQuoteExpiredError ||
      error instanceof TutorPayoutQuoteNotActiveError ||
      error instanceof TutorPayoutQuoteAlreadyAcceptedError ||
      // Phase H.7 (§28): the original requester's authority over the
      // learner was revoked (or the quote/learner pairing was somehow
      // inconsistent) between an earlier check and this transaction.
      // Treated the same as any other candidate-level failure — this
      // dispatch attempt with this tutor did not produce a booking, so
      // dispatch continues; if the cause is genuinely the requester's lost
      // authority (not tutor-specific), every subsequent candidate will
      // fail the same re-check for the same reason, and existing dispatch-
      // exhaustion logic (unmodified by H.7) naturally reaches
      // NO_TUTOR_FOUND rather than ever producing an unauthorized booking.
      error instanceof NotAuthorizedForLearnerError ||
      error instanceof QuoteLearnerMismatchError
    ) {
      // Candidate-level failure — the request itself is not FAILED;
      // dispatch simply continues to the next candidate/round (the
      // transaction rollback already undid the PAYMENT_PENDING claim).
      // Safe to call even if another path already advanced this request.
      if (preflight?.tutoringRequestId) await advanceDispatch(preflight.tutoringRequestId);
      return { error: t("invitationNoLongerAvailable") };
    }
    // Defense-in-depth only, matching the same post-hardening shape used in
    // createBookingAction (src/lib/actions/bookings.ts): withSerializableRetry
    // now absorbs both known-retryable Serializable-conflict error shapes
    // (P2034-coded PrismaClientKnownRequestError and the raw
    // DriverAdapterError/"TransactionWriteConflict" shape) internally, so a
    // P2034 reaching this catch should be rare. Genuine retry-budget
    // exhaustion after sustained contention instead throws
    // withSerializableRetry's own plain Error (not P2034-coded), which is
    // deliberately NOT special-cased here — it falls through to the generic
    // branch below, kept consistent with createBookingAction's equivalent
    // choice rather than inventing new, one-off "retry exhausted" copy or
    // messaging.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { error: t("invitationNoLongerAvailable") };
    }
    return { error: t("generic") };
  }

  // Step B/C — outside the claim transaction. Never a candidate-level
  // failure from here on: a capture failure is a request-level outcome
  // (PAYMENT_FAILED), handled entirely inside convergeToCaptureFailed —
  // dispatch does not continue to another tutor (Phase G plan §12).
  try {
    if (paymentsUseStripe()) {
      await captureAuthorizedPayment(claimed.paymentId);
    } else {
      await convergeToCaptured(claimed.paymentId);
    }
  } catch {
    return { error: t("generic") };
  }

  const finalBooking = await db.booking.findUnique({ where: { id: claimed.bookingId }, select: { status: true } });
  if (finalBooking?.status !== "CONFIRMED") {
    return { error: t("paymentFailed") };
  }

  revalidatePath("/tutor/quick-match");
  revalidatePath("/dashboard/quick-match");
  revalidatePath("/tutor/bookings");
  revalidatePath("/dashboard/bookings");
  return { success: true };
}

export async function declineTutorInvitationAction(
  _prevState: InvitationActionState,
  formData: FormData
): Promise<InvitationActionState> {
  const t = await getTranslations("quickMatch.errors");
  const session = await auth();
  if (!session?.user || session.user.role !== "TUTOR") return { error: t("notATutor") };

  const parsed = declineTutorInvitationSchema.safeParse({
    tutorInvitationId: formData.get("tutorInvitationId"),
    declineReason: formData.get("declineReason") ? String(formData.get("declineReason")) : undefined,
  });
  if (!parsed.success) return { error: t("invalidInput") };

  const tutorProfile = await db.tutorProfile.findUnique({ where: { userId: session.user.id } });
  if (!tutorProfile) return { error: t("invalidInput") };

  const invitation = await db.tutorInvitation.findUnique({ where: { id: parsed.data.tutorInvitationId } });
  if (!invitation || invitation.tutorProfileId !== tutorProfile.id) return { error: t("invalidInput") };

  const updated = await db.tutorInvitation.updateMany({
    where: { id: invitation.id, status: "PENDING" },
    data: { status: "DECLINED", respondedAt: new Date(), declineReason: parsed.data.declineReason ?? null },
  });
  if (updated.count === 0) return { error: t("invitationNoLongerAvailable") };

  await writeAuditLog({
    actorUserId: session.user.id,
    action: "quickmatch.invitation.declined",
    entityType: "TutorInvitation",
    entityId: invitation.id,
    metadata: { tutoringRequestId: invitation.tutoringRequestId },
  });

  await advanceDispatch(invitation.tutoringRequestId);

  revalidatePath("/tutor/quick-match");
  revalidatePath("/dashboard/quick-match");
  return { success: true };
}
