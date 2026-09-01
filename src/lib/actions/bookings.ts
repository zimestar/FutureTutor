"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getAvailableSlots } from "@/lib/availability";
import { paymentsUseStripe } from "@/lib/paymentMode";
import { closedBetaFinancialGateActive } from "@/lib/closedBetaConfig";
import { withSerializableRetry } from "@/lib/serializableRetry";
import { canInitiatePaidBooking } from "@/services/studentAuthorization";
import { resolveCancellationAuthority } from "@/services/cancellationAuthorization";
import { createBookingSchema, cancelBookingSchema } from "@/schemas/booking";
import {
  reserveBookingPendingPayment,
  SlotTakenError,
  NotAuthorizedForLearnerError,
  QuoteLearnerMismatchError,
  PaymentReservationMismatchError,
  PaymentAlreadyAttachedError,
} from "@/services/bookingCreation";
import {
  preparePaymentForQuote,
  getOrCreatePaymentForQuote,
  verifyAndAuthorizePaymentIntent,
  captureAuthorizedPayment,
  convergeToCaptured,
  PaymentIntentVerificationError,
} from "@/services/payments";
import {
  QuoteNotFoundError,
  QuoteNotOwnedError,
  QuoteExpiredError,
  QuoteAlreadyConsumedError,
  QuoteNotActiveError,
  QuoteContextMismatchError,
} from "@/services/customerPricing";
import {
  TutorPayoutQuoteNotFoundError,
  TutorPayoutQuoteExpiredError,
  TutorPayoutQuoteNotActiveError,
} from "@/services/tutorPayout";
import {
  cancelBookingWithRefund,
  BookingNotCancellableError,
  NotAuthorizedToCancelError,
  SessionAlreadyStartedError,
  SessionNotCancellableError,
} from "@/services/cancellationPolicy";

export type BookingActionState = { error?: string; success?: boolean } | undefined;

const SESSION_DURATION_MINUTES = 60;

export async function createBookingAction(
  _prevState: BookingActionState,
  formData: FormData
): Promise<BookingActionState> {
  const t = await getTranslations("booking.errors");

  // BETA-HARDEN1 — defense-in-depth: preparePaymentForBookingQuoteAction
  // (src/lib/actions/payments.ts) already refuses to create a Stripe
  // PaymentIntent while the gate is active, so a well-behaved client can
  // never reach this action with a usable payment. This second check
  // closes the same door for a crafted request that skips payment prep
  // entirely and calls this action directly.
  if (closedBetaFinancialGateActive()) {
    return { error: t("betaBookingsUnavailable") };
  }

  const session = await auth();
  // Phase H.7 — the actor may now legitimately be a PARENT booking for a
  // linked child, not only the learner's own STUDENT session.
  if (!session?.user || (session.user.role !== "STUDENT" && session.user.role !== "PARENT")) {
    return { error: t("notAStudent") };
  }

  const academicLevelId = formData.get("academicLevelId");
  const parsed = createBookingSchema.safeParse({
    studentProfileId: formData.get("studentProfileId"),
    tutorProfileId: formData.get("tutorProfileId"),
    subjectId: formData.get("subjectId"),
    academicLevelId: academicLevelId ? String(academicLevelId) : undefined,
    startAt: formData.get("startAt"),
  });
  if (!parsed.success) return { error: t("invalidInput") };
  const { studentProfileId, tutorProfileId, subjectId, academicLevelId: levelId, startAt } = parsed.data;

  const customerPriceQuoteId = String(formData.get("customerPriceQuoteId") ?? "");
  const tutorPayoutQuoteId = String(formData.get("tutorPayoutQuoteId") ?? "");
  if (!customerPriceQuoteId || !tutorPayoutQuoteId) return { error: t("pricingUnavailable") };
  const stripePaymentIntentId = formData.get("stripePaymentIntentId")
    ? String(formData.get("stripePaymentIntentId"))
    : null;

  // Phase H.7 — the learner is now an explicit, client-selected
  // studentProfileId (self, or a linked child), never self-derived from
  // the actor's own userId. Untrusted on its own — re-verified via H.2
  // immediately below, and again inside the authoritative transaction
  // (§17 — see reserveBookingPendingPayment's own re-check).
  const [studentProfile, tutorProfile] = await Promise.all([
    db.studentProfile.findUnique({ where: { id: studentProfileId } }),
    db.tutorProfile.findUnique({ where: { id: tutorProfileId } }),
  ]);
  if (!studentProfile || !tutorProfile) return { error: t("invalidInput") };

  // FG-LEGAL2 — deliberately checked here (the direct-booking Server Action
  // entry point), not inside reserveBookingPendingPayment: that shared
  // service function is also called directly, bypassing this action
  // entirely, by dozens of pre-existing integration test fixtures across
  // unrelated domains (session lifecycle, cancellation, payments, video)
  // that construct an APPROVED tutor without any Tutor Agreement concept —
  // enforcing this deep in the shared function broke all of them. A tutor
  // who hasn't accepted the current Agreement should not receive new
  // opportunities through any real user-facing route; this covers direct
  // booking, and tutorEligibility.ts's getEligibleTutors/
  // isTutorEligibleForRequest gates cover Quick Match dispatch and accept.
  if (!tutorProfile.tutorAgreementAcceptedAt) return { error: t("tutorUnavailable") };

  // Phase H.5 security correction (extended in H.7 for actor != learner):
  // previously authorized solely by role===STUDENT + a raw
  // studentProfile-by-own-userId lookup, with no H.2 involvement — a
  // GUARDIAN_MANAGED student's own restricted login could reserve a slot
  // and capture a real payment. Unchanged for every existing SELF_MANAGED
  // student; now also correctly allows an ACTIVE guardian acting for their
  // linked child. This is only the fast pre-check (§16) — the authoritative
  // check is the one re-run inside the transaction below.
  const authorized = await canInitiatePaidBooking(db, session.user.id, studentProfile.id);
  if (!authorized) return { error: t("notAStudent") };

  const { timezone, days } = await getAvailableSlots(tutorProfileId, {
    durationMinutes: SESSION_DURATION_MINUTES,
  });
  if (!timezone) return { error: t("slotTaken") };

  const isValidSlot = days.some((day) => day.slots.some((slot) => slot.startAt.getTime() === startAt.getTime()));
  if (!isValidSlot) return { error: t("slotTaken") };

  const endAt = new Date(startAt.getTime() + SESSION_DURATION_MINUTES * 60 * 1000);
  const mode = tutorProfile.learningMode ?? "BOTH";

  // Payment preparation happens outside any DB transaction — see the
  // Payment model's schema domain comment for why an external call must
  // never be wrapped in a transaction. In live mode the client already
  // authorized this PaymentIntent via the Payment Element before
  // submitting; here the server independently verifies it (never trusts
  // the client's word alone).
  let paymentId: string;
  try {
    if (paymentsUseStripe()) {
      if (!stripePaymentIntentId) return { error: t("pricingUnavailable") };
      const payment = await getOrCreatePaymentForQuote(customerPriceQuoteId, session.user.id);
      await verifyAndAuthorizePaymentIntent({
        paymentId: payment.id,
        stripePaymentIntentId,
        expectedPayerUserId: session.user.id,
      });
      paymentId = payment.id;
    } else {
      const payment = await preparePaymentForQuote(customerPriceQuoteId, session.user.id);
      paymentId = payment.id;
    }
  } catch (error) {
    if (error instanceof PaymentIntentVerificationError) return { error: t("pricingUnavailable") };
    return { error: t("generic") };
  }

  try {
    // Step A — reserve the slot, no Stripe call inside this transaction.
    //
    // P0 booking hardening — bounded retry on a genuine Postgres
    // Serializable write-conflict, reusing the same withSerializableRetry
    // primitive already applied around cancelBookingWithRefund (H.8.3) and
    // convergeTutorEarningFromSession (Phase 5B) for exactly this class of
    // conflict (src/lib/serializableRetry.ts). Safe because every write
    // reserveBookingPendingPayment performs goes through the `tx` passed to
    // it — no ambient `db` writes, no network call inside this closure — so
    // an aborted attempt commits nothing at all, and each retry opens a
    // brand-new transaction that re-reads fresh state (a fresh overlap
    // check, a fresh authority re-check, a fresh quote read) rather than
    // replaying anything stale. Payment preparation above and capture below
    // both run exactly once, outside this retry boundary, unchanged.
    await withSerializableRetry(() =>
      db.$transaction(
        async (tx) => {
          await reserveBookingPendingPayment(tx, {
            actorUserId: session.user.id,
            studentProfileId: studentProfile.id,
            tutorProfileId,
            subjectId,
            academicLevelId: levelId,
            startAt,
            endAt,
            timezone,
            mode,
            paymentId,
            customerPriceQuoteId,
            tutorPayoutQuoteId,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      )
    );
  } catch (error) {
    if (error instanceof SlotTakenError) return { error: t("slotTaken") };
    // Phase H.7 — the transaction-bound re-check denied the actor's
    // authority over the learner (revoked between pre-check and here), or
    // the quote/learner pairing was inconsistent. Same fail-closed
    // "unavailable" messaging as every other server-side denial here —
    // never distinguishing the reason for an unauthorized caller.
    if (error instanceof NotAuthorizedForLearnerError) return { error: t("notAStudent") };
    if (error instanceof QuoteLearnerMismatchError) return { error: t("invalidInput") };
    // BETA-1 / P1-02 — reserveBookingPendingPayment now authoritatively
    // validates and consumes both quotes, and validates the Payment,
    // BEFORE this transaction commits — so these errors (previously only
    // reachable from the later capture/converge step, after Stripe money
    // had already moved) are now reachable here instead, with no Stripe
    // call ever attempted. Same fail-closed "pricing unavailable" messaging
    // the later catch block below already used for the identical error
    // types, kept consistent rather than inventing new copy.
    if (
      error instanceof QuoteNotFoundError ||
      error instanceof QuoteNotOwnedError ||
      error instanceof QuoteExpiredError ||
      error instanceof QuoteAlreadyConsumedError ||
      error instanceof QuoteNotActiveError ||
      error instanceof QuoteContextMismatchError ||
      error instanceof TutorPayoutQuoteNotFoundError ||
      error instanceof TutorPayoutQuoteExpiredError ||
      error instanceof TutorPayoutQuoteNotActiveError ||
      error instanceof PaymentReservationMismatchError ||
      error instanceof PaymentAlreadyAttachedError
    ) {
      return { error: t("pricingUnavailable") };
    }
    // Defense-in-depth only, matching the same post-hardening shape already
    // established by cancelBookingAction below: withSerializableRetry now
    // absorbs both known-retryable Serializable-conflict error shapes
    // (P2034-coded PrismaClientKnownRequestError and the raw
    // DriverAdapterError/"TransactionWriteConflict" shape — see that file's
    // own doc comment) internally, so a P2034 reaching this catch should be
    // rare. Genuine retry-budget exhaustion after sustained contention
    // instead throws withSerializableRetry's own plain Error (not
    // P2034-coded), which is deliberately NOT special-cased here — it falls
    // through to the generic branch below, exactly like cancelBookingAction
    // already does for its own (internally-retried) P2034 case. This keeps
    // both call sites' error handling consistent rather than inventing new,
    // one-off "retry exhausted" copy.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { error: t("slotTaken") };
    }
    return { error: t("generic") };
  }

  // Step B/C — capture (live) or converge directly (dev bypass, already
  // CAPTURED — see preparePaymentForQuote).
  try {
    if (paymentsUseStripe()) {
      await captureAuthorizedPayment(paymentId);
    } else {
      await convergeToCaptured(paymentId);
    }
  } catch (error) {
    if (
      error instanceof QuoteNotFoundError ||
      error instanceof QuoteNotOwnedError ||
      error instanceof QuoteExpiredError ||
      error instanceof QuoteAlreadyConsumedError ||
      error instanceof QuoteNotActiveError ||
      error instanceof QuoteContextMismatchError ||
      error instanceof TutorPayoutQuoteNotFoundError ||
      error instanceof TutorPayoutQuoteExpiredError ||
      error instanceof TutorPayoutQuoteNotActiveError
    ) {
      return { error: t("pricingUnavailable") };
    }
    return { error: t("generic") };
  }

  const finalPayment = await db.payment.findUnique({ where: { id: paymentId } });
  if (finalPayment?.status !== "CAPTURED") {
    return { error: t("pricingUnavailable") };
  }

  revalidatePath("/dashboard/bookings");
  revalidatePath("/tutor/bookings");
  return { success: true };
}

export async function cancelBookingAction(
  _prevState: BookingActionState,
  formData: FormData
): Promise<BookingActionState> {
  const t = await getTranslations("booking.errors");

  const session = await auth();
  if (!session?.user) return { error: t("notYours") };

  const parsed = cancelBookingSchema.safeParse({ bookingId: formData.get("bookingId") });
  if (!parsed.success) return { error: t("invalidInput") };

  const booking = await db.booking.findUnique({
    where: { id: parsed.data.bookingId },
    include: { tutorProfile: { select: { userId: true } } },
  });
  if (!booking) return { error: t("notFound") };

  // Phase H.8 — Layer 1: fast, non-transactional pre-check (UX only, NOT
  // trusted as authoritative). The role is read fresh from the session's
  // own server-verified value; the authoritative Layer 2 re-check inside
  // cancelBookingWithRefund's own Serializable transaction re-reads the
  // role from the database again rather than trusting this session object,
  // per §I of the H.8 plan.
  const preCheckAuthority = await resolveCancellationAuthority(db, session.user.id, session.user.role, {
    studentProfileId: booking.studentProfileId,
    tutorProfileUserId: booking.tutorProfile.userId,
  });
  if (preCheckAuthority === "DENIED") return { error: t("notYours") };

  try {
    // actorRole is re-resolved fresh from the DB (never the potentially
    // stale `session.user.role`) so the authoritative Layer 2 check inside
    // the transaction reflects the actor's CURRENT role, not the role at
    // sign-in time.
    const freshUser = await db.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { role: true } });
    await cancelBookingWithRefund(booking.id, session.user.id, { actorRole: freshUser.role });
  } catch (error) {
    if (error instanceof SessionAlreadyStartedError) return { error: t("alreadyStarted") };
    if (error instanceof NotAuthorizedToCancelError) return { error: t("notYours") };
    if (error instanceof BookingNotCancellableError) return { error: t("generic") };
    // Pre-Phase-4 H.8 hardening — the booking's Session_ had already moved
    // off SCHEDULED (e.g. an early dual check-in already started the
    // session) when the guarded Session_ write ran; the whole cancellation
    // attempt was rolled back. Same generic messaging as every other
    // domain-rejection branch above — no new user-facing copy introduced.
    if (error instanceof SessionNotCancellableError) return { error: t("generic") };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      // Serializable conflict on the authorization/mutation transaction —
      // never auto-retried here (§I of the H.8 plan); a fresh Server
      // Action resubmission naturally re-runs both layers from scratch.
      return { error: t("generic") };
    }
    return { error: t("generic") };
  }

  revalidatePath("/dashboard/bookings");
  revalidatePath("/tutor/bookings");
  return { success: true };
}
