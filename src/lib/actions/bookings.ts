"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getAvailableSlots } from "@/lib/availability";
import { paymentsUseStripe } from "@/lib/paymentMode";
import { canInitiatePaidBooking, canPayForStudent } from "@/services/studentAuthorization";
import { createBookingSchema, cancelBookingSchema } from "@/schemas/booking";
import {
  reserveBookingPendingPayment,
  SlotTakenError,
  NotAuthorizedForLearnerError,
  QuoteLearnerMismatchError,
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
import { cancelBookingWithRefund } from "@/services/cancellationPolicy";

export type BookingActionState = { error?: string; success?: boolean } | undefined;

const SESSION_DURATION_MINUTES = 60;

export async function createBookingAction(
  _prevState: BookingActionState,
  formData: FormData
): Promise<BookingActionState> {
  const t = await getTranslations("booking.errors");

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
    await db.$transaction(
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
    include: { studentProfile: true, tutorProfile: true },
  });
  if (!booking) return { error: t("notFound") };

  const isTutorOwner = booking.tutorProfile.userId === session.user.id;
  const isAdmin = session.user.role === "SUPER_ADMIN";
  // Phase H.5 security correction: cancellation triggers a real refund
  // (cancelBookingWithRefund) — the student side of ownership must go
  // through H.2's canPayForStudent, not a raw userId match, so a
  // GUARDIAN_MANAGED student's own restricted login can't cancel/refund a
  // booking on their own authority. Unchanged for every existing
  // SELF_MANAGED student.
  const isStudentOwner =
    booking.studentProfile.userId === session.user.id &&
    (await canPayForStudent(db, session.user.id, booking.studentProfileId));
  if (!isStudentOwner && !isTutorOwner && !isAdmin) return { error: t("notYours") };

  try {
    await cancelBookingWithRefund(booking.id, session.user.id);
  } catch {
    return { error: t("generic") };
  }

  revalidatePath("/dashboard/bookings");
  revalidatePath("/tutor/bookings");
  return { success: true };
}
