"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getAvailableSlots } from "@/lib/availability";
import { paymentsAreLive } from "@/lib/paymentMode";
import { createBookingSchema, cancelBookingSchema } from "@/schemas/booking";
import { reserveBookingPendingPayment, SlotTakenError } from "@/services/bookingCreation";
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
  if (!session?.user || session.user.role !== "STUDENT") {
    return { error: t("notAStudent") };
  }

  const academicLevelId = formData.get("academicLevelId");
  const parsed = createBookingSchema.safeParse({
    tutorProfileId: formData.get("tutorProfileId"),
    subjectId: formData.get("subjectId"),
    academicLevelId: academicLevelId ? String(academicLevelId) : undefined,
    startAt: formData.get("startAt"),
  });
  if (!parsed.success) return { error: t("invalidInput") };
  const { tutorProfileId, subjectId, academicLevelId: levelId, startAt } = parsed.data;

  const customerPriceQuoteId = String(formData.get("customerPriceQuoteId") ?? "");
  const tutorPayoutQuoteId = String(formData.get("tutorPayoutQuoteId") ?? "");
  if (!customerPriceQuoteId || !tutorPayoutQuoteId) return { error: t("pricingUnavailable") };
  const stripePaymentIntentId = formData.get("stripePaymentIntentId")
    ? String(formData.get("stripePaymentIntentId"))
    : null;

  const [studentProfile, tutorProfile] = await Promise.all([
    db.studentProfile.findUnique({ where: { userId: session.user.id } }),
    db.tutorProfile.findUnique({ where: { id: tutorProfileId } }),
  ]);
  if (!studentProfile || !tutorProfile) return { error: t("invalidInput") };

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
    if (paymentsAreLive()) {
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
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { error: t("slotTaken") };
    }
    return { error: t("generic") };
  }

  // Step B/C — capture (live) or converge directly (dev bypass, already
  // CAPTURED — see preparePaymentForQuote).
  try {
    if (paymentsAreLive()) {
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

  const isOwner =
    booking.studentProfile.userId === session.user.id || booking.tutorProfile.userId === session.user.id;
  const isAdmin = session.user.role === "SUPER_ADMIN";
  if (!isOwner && !isAdmin) return { error: t("notYours") };

  try {
    await cancelBookingWithRefund(booking.id, session.user.id);
  } catch {
    return { error: t("generic") };
  }

  revalidatePath("/dashboard/bookings");
  revalidatePath("/tutor/bookings");
  return { success: true };
}
