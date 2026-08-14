import "server-only";
import { randomUUID } from "crypto";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { TutoringMode, BookingStatus } from "@/generated/prisma/enums";
import { getStripeClient } from "@/lib/stripe";
import { paymentsUseStripe } from "@/lib/paymentMode";
import {
  validateAndConsumeCustomerPriceQuote,
  cancelLockedCustomerPriceQuote,
  QuoteAlreadyConsumedError,
} from "@/services/customerPricing";
import { validateAndConsumeTutorPayoutQuote, cancelTutorPayoutQuote } from "@/services/tutorPayout";
import { notifyUser } from "@/lib/notify";
import { writeAuditLog } from "@/lib/audit";

export class PaymentIntentVerificationError extends Error {}
export class PaymentNotAuthorizedError extends Error {}

// ---------------------------------------------------------------------------
// PaymentIntent creation — Step A (durable local row) / Step B (Stripe call,
// outside any transaction) / Step C (guarded persist). Every subsequent
// operation in this file follows the same shape — see the schema's own
// domain comment above the Payment model for the full rationale.
// ---------------------------------------------------------------------------

/** Step A — idempotent by construction: Payment.customerPriceQuoteId is
 * unique, so a retry always finds and reuses the existing row rather than
 * creating a second one. */
export async function getOrCreatePaymentForQuote(quoteId: string, payerUserId: string) {
  const existing = await db.payment.findUnique({ where: { customerPriceQuoteId: quoteId } });
  if (existing) return existing;

  const quote = await db.customerPriceQuote.findUniqueOrThrow({ where: { id: quoteId } });
  try {
    return await db.payment.create({
      data: {
        id: randomUUID(),
        customerPriceQuoteId: quoteId,
        payerUserId,
        amountCents: quote.totalCents,
        currency: quote.currency,
        status: "PENDING",
      },
    });
  } catch (error) {
    // Race: a concurrent request created it between our read and this write.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return db.payment.findUniqueOrThrow({ where: { customerPriceQuoteId: quoteId } });
    }
    throw error;
  }
}

/**
 * PAYMENT_MODE=disabled_dev only (see src/lib/paymentMode.ts) — creates a
 * Payment already CAPTURED, with no Stripe involvement at all, so the rest
 * of the pipeline (reserveBookingPendingPayment -> convergeToCaptured) runs
 * completely unmodified regardless of mode; convergeToCaptured never
 * touches Stripe itself, so a pre-CAPTURED row flows through it as a
 * same-shaped no-op on its own first guard. This function must never run
 * when paymentsUseStripe() — callers branch on that before reaching here;
 * this is not itself the fail-closed guard (see src/lib/paymentMode.ts).
 */
async function createDevBypassCapturedPayment(quoteId: string, payerUserId: string) {
  const existing = await db.payment.findUnique({ where: { customerPriceQuoteId: quoteId } });
  if (existing) return existing;

  const quote = await db.customerPriceQuote.findUniqueOrThrow({ where: { id: quoteId } });
  try {
    return await db.payment.create({
      data: {
        id: randomUUID(),
        customerPriceQuoteId: quoteId,
        payerUserId,
        amountCents: quote.totalCents,
        currency: quote.currency,
        status: "CAPTURED",
        capturedAt: new Date(),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return db.payment.findUniqueOrThrow({ where: { customerPriceQuoteId: quoteId } });
    }
    throw error;
  }
}

/** The one entry point booking flows call to get a payment ready — branches
 * on PAYMENT_MODE so callers never need their own live/dev conditional. */
export async function preparePaymentForQuote(quoteId: string, payerUserId: string) {
  return paymentsUseStripe()
    ? getOrCreatePaymentForQuote(quoteId, payerUserId)
    : createDevBypassCapturedPayment(quoteId, payerUserId);
}

function mapInitialPiStatus(status: Stripe.PaymentIntent.Status): "PENDING" | "REQUIRES_ACTION" | "AUTHORIZED" {
  if (status === "requires_capture") return "AUTHORIZED";
  if (status === "requires_action" || status === "requires_confirmation") return "REQUIRES_ACTION";
  return "PENDING";
}

/** Step B/C — creates the manual-capture PaymentIntent for an existing
 * Payment row if it doesn't have one yet; returns the client_secret either
 * way. `paymentId` genuinely exists in Stripe's metadata by the time this
 * call happens, since Step A (above) already created the row. */
export async function ensureStripePaymentIntent(paymentId: string): Promise<{ clientSecret: string | null }> {
  const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });

  if (payment.stripePaymentIntentId) {
    const stripe = getStripeClient();
    const pi = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
    return { clientSecret: pi.client_secret };
  }

  const stripe = getStripeClient();
  const pi = await stripe.paymentIntents.create(
    {
      amount: payment.amountCents,
      currency: payment.currency.toLowerCase(),
      capture_method: "manual",
      metadata: { paymentId: payment.id, customerPriceQuoteId: payment.customerPriceQuoteId },
    },
    { idempotencyKey: `payment-intent:${payment.id}` }
  );

  await db.payment.updateMany({
    where: { id: payment.id, stripePaymentIntentId: null },
    data: { stripePaymentIntentId: pi.id, status: mapInitialPiStatus(pi.status) },
  });

  return { clientSecret: pi.client_secret };
}

// ---------------------------------------------------------------------------
// Server-side authorization verification — never trusts a client-side
// `stripe.confirmPayment()` resolution as authoritative. Called before any
// quote-locking/dispatch-starting transaction opens; the Stripe retrieve
// happens as a plain read here, not inside a transaction.
// ---------------------------------------------------------------------------

export async function verifyAndAuthorizePaymentIntent(params: {
  paymentId: string;
  stripePaymentIntentId: string;
  expectedPayerUserId: string;
}): Promise<void> {
  const payment = await db.payment.findUniqueOrThrow({ where: { id: params.paymentId } });

  if (payment.payerUserId !== params.expectedPayerUserId) {
    throw new PaymentIntentVerificationError("Payment does not belong to the authenticated user");
  }
  if (payment.stripePaymentIntentId !== params.stripePaymentIntentId) {
    throw new PaymentIntentVerificationError("PaymentIntent id does not match this Payment");
  }

  const stripe = getStripeClient();
  const pi = await stripe.paymentIntents.retrieve(params.stripePaymentIntentId);

  if (pi.metadata?.paymentId !== payment.id || pi.metadata?.customerPriceQuoteId !== payment.customerPriceQuoteId) {
    throw new PaymentIntentVerificationError("PaymentIntent metadata does not match this Payment");
  }
  if (pi.amount !== payment.amountCents || pi.currency !== payment.currency.toLowerCase()) {
    throw new PaymentIntentVerificationError("PaymentIntent amount/currency does not match the authoritative quote");
  }
  if (pi.capture_method !== "manual") {
    throw new PaymentIntentVerificationError("PaymentIntent is not using manual capture");
  }
  if (pi.status !== "requires_capture") {
    throw new PaymentIntentVerificationError(`PaymentIntent is not authorized (status: ${pi.status})`);
  }

  await db.payment.updateMany({
    where: { id: payment.id, status: { in: ["PENDING", "REQUIRES_ACTION"] } },
    data: { status: "AUTHORIZED", authorizedAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Capture — Step B (outside any transaction) followed by an authoritative
// outcome resolution (never inferred from a thrown exception alone — a
// network error on our side can occur even though Stripe actually
// captured the payment; a capture attempt can also fail while the
// authorization itself remains valid and recapturable).
// ---------------------------------------------------------------------------

export async function captureAuthorizedPayment(paymentId: string): Promise<void> {
  const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (!payment.stripePaymentIntentId) throw new PaymentNotAuthorizedError("No PaymentIntent to capture");

  const stripe = getStripeClient();
  try {
    const result = await stripe.paymentIntents.capture(
      payment.stripePaymentIntentId,
      {},
      { idempotencyKey: `capture:${payment.id}` }
    );
    if (result.status === "succeeded") {
      await convergeToCaptured(paymentId);
      return;
    }
    await resolveCaptureOutcomeAndConverge(paymentId);
  } catch {
    await resolveCaptureOutcomeAndConverge(paymentId);
  }
}

export type CaptureOutcome = "captured" | "requires_capture" | "canceled" | "uncertain";

/** The single authoritative source of truth for "what actually happened to
 * this capture" — called from the synchronous path above, the relevant
 * webhook, and the reconciliation sweep. No business-state transition is
 * ever chosen from a thrown exception alone, only from this function's
 * positive determination of Stripe's current state. */
export async function resolveCaptureOutcomeAndConverge(paymentId: string): Promise<CaptureOutcome> {
  const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (!payment.stripePaymentIntentId) return "uncertain";
  if (payment.status === "CAPTURED") return "captured"; // already converged

  const stripe = getStripeClient();
  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
  } catch {
    return "uncertain";
  }

  switch (pi.status) {
    case "succeeded":
      await convergeToCaptured(paymentId);
      return "captured";
    case "requires_capture":
      // Not done yet — fully valid and recapturable, NOT a failure. Left
      // for the reconciliation sweep or a future retry to complete.
      return "requires_capture";
    case "canceled":
      await convergeToCaptureFailed(paymentId);
      return "canceled";
    default:
      return "uncertain";
  }
}

// ---------------------------------------------------------------------------
// State-convergent finalization — Step C. Safe to call from any partial
// completion point (see the schema's domain comment): each sub-step checks
// its own current state before acting, rather than requiring the whole
// function to start from one pristine precondition.
// ---------------------------------------------------------------------------

interface ConvergenceBookingRow {
  id: string;
  tutorProfileId: string;
  customerPriceQuoteId: string | null;
  tutorPayoutQuoteId: string | null;
  tutoringRequestId: string | null;
  subjectId: string;
  academicLevelId: string | null;
  mode: TutoringMode;
  startAt: Date;
  endAt: Date;
  currency: string;
  tutorPayoutCents: number | null;
  status: BookingStatus;
}

async function consumeCustomerQuoteForConvergence(tx: Prisma.TransactionClient, booking: ConvergenceBookingRow) {
  if (!booking.customerPriceQuoteId) return;
  const quote = await tx.customerPriceQuote.findUnique({ where: { id: booking.customerPriceQuoteId } });
  if (!quote || quote.status === "CONSUMED") return;

  const durationMinutes = Math.round((booking.endAt.getTime() - booking.startAt.getTime()) / 60000);
  try {
    await validateAndConsumeCustomerPriceQuote(tx, booking.customerPriceQuoteId, quote.createdByUserId, {
      subjectId: booking.subjectId,
      academicLevelId: booking.academicLevelId,
      tutoringMode: booking.mode,
      durationMinutes,
      requestedStartAt: booking.startAt,
    });
  } catch (error) {
    if (error instanceof QuoteAlreadyConsumedError) return; // convergence race, benign
    throw error;
  }
}

async function consumeTutorPayoutQuoteForConvergence(tx: Prisma.TransactionClient, booking: ConvergenceBookingRow) {
  if (!booking.tutorPayoutQuoteId || !booking.customerPriceQuoteId) return;
  try {
    await validateAndConsumeTutorPayoutQuote(
      tx,
      booking.tutorPayoutQuoteId,
      booking.tutorProfileId,
      booking.customerPriceQuoteId
    );
  } catch (error) {
    const quote = await tx.tutorPayoutQuote.findUnique({ where: { id: booking.tutorPayoutQuoteId } });
    if (quote?.status === "CONSUMED") return; // already converged
    throw error;
  }
}

export async function convergeToCaptured(paymentId: string): Promise<void> {
  await db.$transaction(
    async (tx) => {
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });

      if (payment.status !== "CAPTURED") {
        await tx.payment.updateMany({
          where: { id: paymentId, status: "AUTHORIZED" },
          data: { status: "CAPTURED", capturedAt: new Date() },
        });
      }

      if (!payment.bookingId) return; // booking-flow Step A hasn't run yet

      const booking = await tx.booking.findUnique({ where: { id: payment.bookingId } });
      if (!booking) return;

      if (booking.status === "PENDING_PAYMENT") {
        await tx.booking.updateMany({
          where: { id: booking.id, status: "PENDING_PAYMENT" },
          data: { status: "CONFIRMED" },
        });
        await tx.bookingStatusHistory.create({
          data: { bookingId: booking.id, fromStatus: "PENDING_PAYMENT", toStatus: "CONFIRMED" },
        });
        await consumeCustomerQuoteForConvergence(tx, booking);
        await consumeTutorPayoutQuoteForConvergence(tx, booking);
      }

      const existingSession = await tx.session_.findUnique({ where: { bookingId: booking.id } });
      if (!existingSession) {
        await tx.session_.create({ data: { bookingId: booking.id, status: "SCHEDULED" } });
      }

      const existingEarning = await tx.tutorEarning.findUnique({ where: { bookingId: booking.id } });
      if (!existingEarning) {
        await tx.tutorEarning.create({
          data: {
            bookingId: booking.id,
            tutorProfileId: booking.tutorProfileId,
            amountCents: booking.tutorPayoutCents ?? 0,
            currency: booking.currency,
            // [YOUR IDEA — RECOMMENDED PAYOUT TIMING] — a temporary rule
            // pending the future Session Completion phase; see
            // TutorEarning.eligibleAt's schema comment.
            eligibleAt: new Date(booking.endAt.getTime() + 24 * 60 * 60 * 1000),
          },
        });

        await writeAuditLog(
          { actorUserId: null, action: "payment.captured", entityType: "Payment", entityId: payment.id, metadata: { bookingId: booking.id } },
          tx
        );
        await writeAuditLog(
          { actorUserId: null, action: "tutor_earning.created", entityType: "TutorEarning", entityId: booking.id, metadata: { tutorProfileId: booking.tutorProfileId, amountCents: booking.tutorPayoutCents } },
          tx
        );

        const tutor = await tx.tutorProfile.findUnique({ where: { id: booking.tutorProfileId }, select: { userId: true } });
        await notifyUser(tx, {
          userId: payment.payerUserId,
          type: "booking.confirmed",
          title: "Booking confirmed",
          body: "Your payment was successful and your session is confirmed.",
          metadata: { bookingId: booking.id },
        });
        if (tutor) {
          await notifyUser(tx, {
            userId: tutor.userId,
            type: "booking.confirmed",
            title: "Session confirmed",
            body: "Payment was captured — your session is confirmed and an earning has been recorded.",
            metadata: { bookingId: booking.id },
          });
        }
      }

      if (booking.tutoringRequestId) {
        await tx.tutoringRequest.updateMany({
          where: { id: booking.tutoringRequestId, status: "PAYMENT_PENDING" },
          data: { status: "BOOKED", bookedAt: new Date() },
        });
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

export async function convergeToCaptureFailed(paymentId: string): Promise<void> {
  await db.$transaction(
    async (tx) => {
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });

      if (payment.status !== "CAPTURE_FAILED" && payment.status !== "CAPTURED") {
        await tx.payment.updateMany({
          where: { id: paymentId, status: { in: ["AUTHORIZED", "PENDING", "REQUIRES_ACTION"] } },
          data: { status: "CAPTURE_FAILED", failedAt: new Date() },
        });
      }

      if (!payment.bookingId) return;
      const booking = await tx.booking.findUnique({ where: { id: payment.bookingId } });
      if (!booking || booking.status !== "PENDING_PAYMENT") return;

      await tx.booking.updateMany({
        where: { id: booking.id, status: "PENDING_PAYMENT" },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: "Payment could not be captured" },
      });
      await tx.bookingStatusHistory.create({
        data: { bookingId: booking.id, fromStatus: "PENDING_PAYMENT", toStatus: "CANCELLED", reason: "Payment could not be captured" },
      });

      if (booking.customerPriceQuoteId) await cancelLockedCustomerPriceQuote(tx, booking.customerPriceQuoteId);
      if (booking.tutorPayoutQuoteId) await cancelTutorPayoutQuote(tx, booking.tutorPayoutQuoteId);
      if (booking.tutoringRequestId) {
        await tx.tutoringRequest.updateMany({
          where: { id: booking.tutoringRequestId, status: "PAYMENT_PENDING" },
          data: { status: "PAYMENT_FAILED" },
        });
      }

      await writeAuditLog(
        { actorUserId: null, action: "payment.capture_failed", entityType: "Payment", entityId: payment.id, metadata: { bookingId: booking.id } },
        tx
      );

      // §14 of the Phase G plan: TutorInvitation.status stays ACCEPTED
      // (immutable historical truth — the tutor did accept) even though
      // this Booking is now CANCELLED. The tutor needs a notification
      // specific to this cause, distinct from a generic decline/expiry —
      // otherwise their dashboard could look like a session silently
      // vanished rather than explain why.
      const tutor = await tx.tutorProfile.findUnique({ where: { id: booking.tutorProfileId }, select: { userId: true } });
      if (tutor) {
        await notifyUser(tx, {
          userId: tutor.userId,
          type: "booking.payment_failed",
          title: "Session could not be confirmed",
          body: "This session could not be confirmed because the customer's payment failed.",
          metadata: { bookingId: booking.id },
        });
      }
      await notifyUser(tx, {
        userId: payment.payerUserId,
        type: "payment.failed",
        title: "Payment could not be completed",
        body: "We couldn't complete your payment, so this session was not confirmed. Please update your payment method and try again.",
        metadata: { bookingId: booking.id },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

/** NO_TUTOR_FOUND path — nothing was ever captured, so there is nothing to
 * refund; this just releases the authorization hold. */
export async function cancelAuthorizedPayment(paymentId: string): Promise<void> {
  const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (!payment.stripePaymentIntentId) return;
  if (payment.status === "CANCELLED" || payment.status === "CAPTURED") return;

  const stripe = getStripeClient();
  try {
    await stripe.paymentIntents.cancel(payment.stripePaymentIntentId, {}, { idempotencyKey: `cancel:${payment.id}` });
  } catch {
    const outcome = await resolveCaptureOutcomeAndConverge(paymentId);
    if (outcome === "captured") return; // already captured elsewhere — not ours to cancel
  }

  await db.payment.updateMany({
    where: { id: paymentId, status: { in: ["PENDING", "REQUIRES_ACTION", "AUTHORIZED"] } },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Refunds — same Step A (durable local identity) / B (Stripe, keyed on that
// identity) / C (persist) shape. The Refund row's own id is the durable
// identity of one logical refund operation, never a timestamp.
// ---------------------------------------------------------------------------

export async function createRefund(params: {
  bookingId: string;
  paymentId: string;
  amountCents: number;
  reason: string;
  actorUserId: string | null;
}) {
  const refund = await db.refund.create({
    data: {
      id: randomUUID(),
      paymentId: params.paymentId,
      bookingId: params.bookingId,
      amountCents: params.amountCents,
      reason: params.reason,
      actorUserId: params.actorUserId,
      status: "PENDING",
    },
  });

  const payment = await db.payment.findUniqueOrThrow({ where: { id: params.paymentId } });

  // PAYMENT_MODE=disabled_dev — the Payment was never actually created at
  // Stripe (see createDevBypassCapturedPayment), so there is nothing real
  // to refund there either. Mirrors that same bypass shape: skip Step B
  // entirely, converge local state directly.
  let stripeRefundId: string;
  if (!paymentsUseStripe()) {
    stripeRefundId = `dev-bypass-${refund.id}`;
  } else {
    if (!payment.stripePaymentIntentId) {
      await db.refund.updateMany({ where: { id: refund.id, status: "PENDING" }, data: { status: "FAILED" } });
      throw new Error("Payment has no PaymentIntent to refund");
    }
    const stripe = getStripeClient();
    try {
      const stripeRefund = await stripe.refunds.create(
        { payment_intent: payment.stripePaymentIntentId, amount: params.amountCents },
        { idempotencyKey: `refund:${refund.id}` }
      );
      stripeRefundId = stripeRefund.id;
    } catch (error) {
      await db.refund.updateMany({ where: { id: refund.id, status: "PENDING" }, data: { status: "FAILED" } });
      throw error;
    }
  }

  await db.$transaction(async (tx) => {
    await tx.refund.updateMany({
      where: { id: refund.id, status: "PENDING" },
      data: { status: "SUCCEEDED", stripeRefundId },
    });
    const newRefundedTotal = payment.refundedAmountCents + params.amountCents;
    await tx.payment.update({
      where: { id: params.paymentId },
      data: {
        refundedAmountCents: newRefundedTotal,
        status: newRefundedTotal >= payment.amountCents ? "REFUNDED" : "PARTIALLY_REFUNDED",
      },
    });
  });

  return refund;
}

// ---------------------------------------------------------------------------
// Webhook/reconciliation resolution — every Stripe PaymentIntent that has
// ever represented a FutureTutor Payment stays traceable, even after the
// rare PI-replacement case (see the schema's domain comment). Never trusts
// metadata merely because it's present.
// ---------------------------------------------------------------------------

export async function resolvePaymentFromStripePaymentIntent(paymentIntent: Stripe.PaymentIntent) {
  const metadataPaymentId = paymentIntent.metadata?.paymentId;

  if (metadataPaymentId) {
    const payment = await db.payment.findUnique({ where: { id: metadataPaymentId } });
    if (payment) {
      if (payment.stripePaymentIntentId === paymentIntent.id) return payment;
      const historicalAttempt = await db.paymentAttempt.findFirst({
        where: { paymentId: payment.id, stripePaymentIntentId: paymentIntent.id },
      });
      if (historicalAttempt) return payment;
      // Metadata named a real Payment, but this exact PI isn't actually
      // related to it — do not trust it; fall through to an independent
      // lookup instead.
    }
  }

  const byCurrentPi = await db.payment.findUnique({ where: { stripePaymentIntentId: paymentIntent.id } });
  if (byCurrentPi) return byCurrentPi;

  const byHistoricalAttempt = await db.paymentAttempt.findFirst({
    where: { stripePaymentIntentId: paymentIntent.id },
    include: { payment: true },
  });
  if (byHistoricalAttempt) return byHistoricalAttempt.payment;

  return null;
}
