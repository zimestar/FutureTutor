import "server-only";
import { randomUUID, createHash } from "crypto";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { TutoringMode, BookingStatus, PaymentStatus } from "@/generated/prisma/enums";
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
// PaymentAttempt — append-only audit trail, one row per confirmation try
// (see the schema's own domain comment). Two callers: the success path
// (verifyAndAuthorizePaymentIntent, below) and the failure path
// (payment_intent.payment_failed in stripeWebhooks.ts). Never affects
// Payment.status, which remains the sole authority for payment lifecycle
// state — this is audit/history only, and a failure to record one must
// never surface as a failure of the primary operation.
// ---------------------------------------------------------------------------

interface RecordPaymentAttemptParams {
  paymentId: string;
  stripePaymentIntentId: string;
  status: string;
  failureCode?: string | null;
  failureMessage?: string | null;
  // Set only for webhook-sourced (failure) attempts — this Stripe event id
  // is what makes a redelivered payment_intent.payment_failed event a safe
  // no-op instead of a duplicate row, via the unique constraint below. Left
  // null for the synchronous, non-webhook success path.
  sourceStripeEventId?: string | null;
}

/**
 * Concurrency-safe attemptNumber assignment — same established pattern as
 * TutorExamAttempt (Phase D): compute (max existing + 1) inside a
 * Serializable transaction, with the [paymentId, attemptNumber] unique
 * constraint as the hard backstop, retried on conflict. The
 * sourceStripeEventId unique constraint is checked first and short-circuits
 * to a no-op — a genuine webhook replay of the same event must not create a
 * second row, while a genuinely new decline (its own distinct Stripe event
 * id) is not deduplicated away by this check.
 */
const RECORD_ATTEMPT_MAX_RETRIES = 12;

async function recordPaymentAttempt(params: RecordPaymentAttemptParams): Promise<void> {
  for (let attempt = 0; attempt < RECORD_ATTEMPT_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Small jittered backoff — real contention on one Payment's attempt
      // sequence is normally 1-2 concurrent writers (a webhook retry racing
      // a synchronous verify call), but this keeps a burst of many
      // concurrent writers from repeatedly colliding on the same retry tick.
      await new Promise((resolve) => setTimeout(resolve, 10 + Math.random() * 40 * attempt));
    }
    try {
      await db.$transaction(
        async (tx) => {
          if (params.sourceStripeEventId) {
            const existing = await tx.paymentAttempt.findUnique({
              where: { sourceStripeEventId: params.sourceStripeEventId },
            });
            if (existing) return; // same logical attempt already recorded — no-op
          }

          const agg = await tx.paymentAttempt.aggregate({
            where: { paymentId: params.paymentId },
            _max: { attemptNumber: true },
          });
          const attemptNumber = (agg._max.attemptNumber ?? 0) + 1;

          await tx.paymentAttempt.create({
            data: {
              paymentId: params.paymentId,
              attemptNumber,
              stripePaymentIntentId: params.stripePaymentIntentId,
              status: params.status,
              failureCode: params.failureCode ?? null,
              failureMessage: params.failureMessage ?? null,
              sourceStripeEventId: params.sourceStripeEventId ?? null,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      return;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          const target = Array.isArray(error.meta?.target) ? (error.meta.target as string[]) : [];
          if (params.sourceStripeEventId && target.includes("sourceStripeEventId")) {
            return; // lost the race to another delivery of the same event — no-op
          }
          continue; // [paymentId, attemptNumber] race — retry with a fresh max read
        }
        if (error.code === "P2034") {
          continue; // serialization conflict — retry
        }
      }
      throw error;
    }
  }
  throw new Error(
    `recordPaymentAttempt: exceeded retry budget (${RECORD_ATTEMPT_MAX_RETRIES}) for payment ${params.paymentId}`
  );
}

/** Never lets an audit-trail failure surface as a failure of the primary
 * operation that called it — logs and swallows instead. Exported for
 * stripeWebhooks.ts's payment_intent.payment_failed handler; internal
 * callers within this file use it directly too. */
export async function recordPaymentAttemptBestEffort(params: RecordPaymentAttemptParams): Promise<void> {
  try {
    await recordPaymentAttempt(params);
  } catch (error) {
    console.error("recordPaymentAttempt failed (non-fatal, audit trail only)", params.paymentId, error);
  }
}

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

  const updated = await db.payment.updateMany({
    where: { id: payment.id, status: { in: ["PENDING", "REQUIRES_ACTION"] } },
    data: { status: "AUTHORIZED", authorizedAt: new Date() },
  });

  // Only record an attempt when this call actually performed the
  // PENDING/REQUIRES_ACTION -> AUTHORIZED transition — a redundant call for
  // an already-AUTHORIZED Payment (e.g. a retried Server Action) is the same
  // logical attempt being re-verified, not a new one. The status transition
  // itself is unaffected either way; this is purely additive audit logging.
  if (updated.count === 1) {
    await recordPaymentAttemptBestEffort({
      paymentId: payment.id,
      stripePaymentIntentId: params.stripePaymentIntentId,
      status: "AUTHORIZED",
    });
  }
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

const CONVERGENCE_MAX_RETRIES = 6;

/**
 * Wraps a Serializable convergence transaction with bounded retry on a
 * genuine Postgres write conflict (P2034) — expected contention, not a
 * product failure, when two independent triggers (a webhook and a
 * synchronous caller, say) converge the same Payment/Booking concurrently.
 * Each retry opens a brand-new transaction via `fn`, so it always re-reads
 * fresh state rather than replaying stale in-memory values — if the
 * competing writer already finished, the retried attempt's own guards
 * (state re-checks already present in every convergence function) make it
 * a clean no-op rather than a duplicate mutation. Only P2034 is retried;
 * every other error is rethrown immediately. Exhausting the budget throws
 * a real error rather than silently swallowing a convergence failure —
 * the caller's own error handling (or the reconciliation sweep) is
 * expected to notice and retry later.
 */
async function withSerializableRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < CONVERGENCE_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 15 + Math.random() * 50 * attempt));
    }
    try {
      return await fn();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        continue;
      }
      throw error;
    }
  }
  throw new Error(
    `Convergence transaction exceeded retry budget (${CONVERGENCE_MAX_RETRIES}) due to repeated serialization conflicts`
  );
}

// ---------------------------------------------------------------------------
// Stripe financial linkage (Phase G.1) — Payment.stripeChargeId /
// stripeBalanceTransactionId / stripeFeeCents. Charge linkage is resolved
// opportunistically alongside capture convergence (Stripe read, outside any
// transaction — never blocks the critical CAPTURED/CONFIRMED path); the fee
// itself is genuinely asynchronous for some payment methods/settlement
// paths, so it's treated as optional at capture time and backfilled later
// via reconcileStripeFinancialDetails() (the reconciliation sweep) or the
// charge.updated webhook. Never estimated — always Stripe's own
// BalanceTransaction.fee, or left null.
// ---------------------------------------------------------------------------

interface ResolvedChargeDetails {
  stripeChargeId: string;
  stripeBalanceTransactionId: string | null;
  stripeFeeCents: number | null;
}

/** Plain Stripe read, no side effects — safe to call outside a transaction
 * and safe to fail (returns null on any error, including "not available
 * yet"), since fee/charge linkage is opportunistic. */
async function resolveChargeAndFeeDetailsForPayment(paymentId: string): Promise<ResolvedChargeDetails | null> {
  const payment = await db.payment.findUnique({ where: { id: paymentId }, select: { stripePaymentIntentId: true } });
  if (!payment?.stripePaymentIntentId) return null;

  const stripe = getStripeClient();
  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId, {
      expand: ["latest_charge.balance_transaction"],
    });
  } catch {
    return null;
  }

  const charge = pi.latest_charge;
  if (!charge || typeof charge === "string") return null; // not yet available

  const balanceTransaction = charge.balance_transaction;
  if (!balanceTransaction || typeof balanceTransaction === "string") {
    // Charge is known, but its BalanceTransaction isn't attached yet — a
    // real, documented possibility depending on payment method/settlement
    // timing. Report the charge id now; fee fields stay null for later.
    return { stripeChargeId: charge.id, stripeBalanceTransactionId: null, stripeFeeCents: null };
  }

  return {
    stripeChargeId: charge.id,
    stripeBalanceTransactionId: balanceTransaction.id,
    stripeFeeCents: balanceTransaction.fee,
  };
}

/**
 * Idempotent, concurrency-safe application of resolved charge/fee details.
 * Same identifier already stored -> no-op. A DIFFERENT, conflicting
 * identifier already stored -> never silently overwritten; flagged via
 * AuditLog for manual investigation instead. Safe to call from multiple
 * racing triggers (capture convergence, webhook, reconciliation sweep) —
 * each checks the row's current state fresh before writing.
 */
async function applyChargeDetailsIfMissing(
  tx: Prisma.TransactionClient,
  paymentId: string,
  details: ResolvedChargeDetails | null
): Promise<void> {
  if (!details) return;
  const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });

  if (!payment.stripeChargeId) {
    await tx.payment.updateMany({
      where: { id: paymentId, stripeChargeId: null },
      data: { stripeChargeId: details.stripeChargeId },
    });
  } else if (payment.stripeChargeId !== details.stripeChargeId) {
    await writeAuditLog(
      {
        actorUserId: null,
        action: "payment.charge_id_conflict",
        entityType: "Payment",
        entityId: paymentId,
        metadata: { existing: payment.stripeChargeId, incoming: details.stripeChargeId },
      },
      tx
    );
    return; // charge identity itself is in question — don't touch fee fields either
  }

  if (details.stripeBalanceTransactionId == null || details.stripeFeeCents == null) return;

  if (!payment.stripeBalanceTransactionId) {
    await tx.payment.updateMany({
      where: { id: paymentId, stripeBalanceTransactionId: null },
      data: { stripeBalanceTransactionId: details.stripeBalanceTransactionId, stripeFeeCents: details.stripeFeeCents },
    });
  } else if (payment.stripeBalanceTransactionId !== details.stripeBalanceTransactionId) {
    await writeAuditLog(
      {
        actorUserId: null,
        action: "payment.balance_transaction_conflict",
        entityType: "Payment",
        entityId: paymentId,
        metadata: { existing: payment.stripeBalanceTransactionId, incoming: details.stripeBalanceTransactionId },
      },
      tx
    );
  }
  // else: already matches -> idempotent no-op
}

/**
 * Reconciliation entry point — resolves charge/fee linkage for a CAPTURED
 * (or later-refunded) Payment, and applies it via applyChargeDetailsIfMissing's
 * own idempotent/conflict-aware guards. Deliberately does NOT short-circuit
 * on "already fully enriched": that would skip the one place drift/
 * corruption between the stored identifier and Stripe's current authoritative
 * answer could ever be caught. Callers that only want to filter for missing
 * data (the reconciliation sweep's bulk query, the charge.updated handler's
 * own pre-check) already do that filtering themselves before invoking this —
 * this function's own job is "resolve from Stripe and apply safely," full
 * stop, so a corrupted/conflicting stored value is never silently trusted
 * just because a value already exists.
 */
export async function reconcileStripeFinancialDetails(paymentId: string): Promise<void> {
  const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (!["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(payment.status)) return;

  const details = await resolveChargeAndFeeDetailsForPayment(paymentId);
  if (!details) return;

  await withSerializableRetry(() =>
    db.$transaction((tx) => applyChargeDetailsIfMissing(tx, paymentId, details), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    })
  );
}

/**
 * Phase H.8 (§L) — fulfillment creation (Session_/TutorEarning) is gated
 * EXCLUSIVELY on an authoritative, post-write, same-transaction re-read of
 * Booking.status — never on a pre-write variable, and never merely on
 * whether the guarded PENDING_PAYMENT -> CONFIRMED updateMany's own count
 * was 1. A stale-derived boolean must never gate fulfillment creation; only
 * the guarded write's own outcome, re-validated by a fresh read taken AFTER
 * attempting it, is allowed to authorize it. This closes the capture/
 * cancellation race: a booking cancelled concurrently with (or strictly
 * before) this transaction can never receive a late Session_/TutorEarning,
 * in any interleaving, because Postgres serializes the two guarded
 * single-row UPDATEs against the same Booking.status column and this
 * function's own re-read always observes whichever one actually committed.
 */
export async function convergeToCaptured(paymentId: string): Promise<void> {
  // Best-effort, outside any transaction — never blocks the critical
  // CAPTURED/CONFIRMED convergence below if this fails or the data isn't
  // available yet (see the module comment above).
  const chargeDetails = await resolveChargeAndFeeDetailsForPayment(paymentId).catch(() => null);

  const outcome = await withSerializableRetry(() =>
    db.$transaction(
      async (tx) => {
        const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });

        if (payment.status !== "CAPTURED") {
          await tx.payment.updateMany({
            where: { id: paymentId, status: "AUTHORIZED" },
            data: { status: "CAPTURED", capturedAt: new Date() },
          });
        }

        await applyChargeDetailsIfMissing(tx, paymentId, chargeDetails);

        if (!payment.bookingId) return { bookingId: null, authoritativeStatus: null as BookingStatus | null };

        const preUpdateBooking = await tx.booking.findUnique({ where: { id: payment.bookingId } });
        if (!preUpdateBooking) return { bookingId: payment.bookingId, authoritativeStatus: null };

        // (A) Guarded PENDING_PAYMENT -> CONFIRMED update — the ONLY write
        // attempt against Booking.status in this transaction.
        const transition = await tx.booking.updateMany({
          where: { id: preUpdateBooking.id, status: "PENDING_PAYMENT" },
          data: { status: "CONFIRMED" },
        });

        // (B) Authoritative re-read AFTER the guarded write — the ONLY
        // thing that authorizes what happens next. preUpdateBooking is
        // never consulted again below this line.
        const booking = await tx.booking.findUniqueOrThrow({ where: { id: preUpdateBooking.id } });

        if (transition.count === 1) {
          // This transaction itself just performed the transition — write
          // history/consume quotes exactly once.
          await tx.bookingStatusHistory.create({
            data: { bookingId: booking.id, fromStatus: "PENDING_PAYMENT", toStatus: "CONFIRMED" },
          });
          await consumeCustomerQuoteForConvergence(tx, booking);
          await consumeTutorPayoutQuoteForConvergence(tx, booking);
        }

        if (booking.status === "CONFIRMED") {
          // (C) Fulfillment creation — gated on the AUTHORITATIVE re-read.
          // An idempotent retry of an already-CONFIRMED booking still
          // reaches here so the existing !existingSession/!existingEarning
          // guards can do their own idempotent no-op — but this branch may
          // NEVER be reached for any other authoritative status.
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
                // Phase 5B: eligibility is now Session-outcome-driven, not
                // wall-clock-driven — this writer no longer pre-authorizes
                // a payout date at creation time. status defaults to
                // PENDING_ELIGIBLE (schema default) and eligibleAt starts
                // null; src/services/tutorEarningConvergence.ts's
                // convergeTutorEarningFromSession is the sole later writer
                // of eligibleAt (COMPLETED/STUDENT_NO_SHOW outcomes only)
                // or of a HELD status (TUTOR_NO_SHOW/NO_SHOW_UNRESOLVED/
                // INTERRUPTED) — see TutorEarning.eligibleAt's own schema
                // comment for the full rationale this writer now honors.
                eligibleAt: null,
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
        }
        // booking.status === "CANCELLED" (or any other authoritative
        // status, unreached today): creates NEITHER Session_ NOR
        // TutorEarning. Nothing else to do transactionally — the payment
        // side is resolved post-commit, outside this transaction, below.

        return { bookingId: booking.id, authoritativeStatus: booking.status };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  );

  // (E) After commit: hand off to cancellation payment convergence only
  // when the authoritative status observed inside the transaction was
  // CANCELLED — a late-won capture on an already-cancelled booking still
  // converges to the financially-correct refunded state.
  // convergeCancelledBookingPayment is itself fully idempotent, so calling
  // it here is always safe even if another trigger (the reconciliation
  // sweep) also calls it concurrently for the same booking.
  if (outcome.authoritativeStatus === "CANCELLED" && outcome.bookingId) {
    await convergeCancelledBookingPayment(outcome.bookingId);
  }
}

export async function convergeToCaptureFailed(paymentId: string): Promise<void> {
  await withSerializableRetry(() =>
  db.$transaction(
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
  )
  );
}

// ---------------------------------------------------------------------------
// Phase H.8 (§K) — authorized-payment cancellation. Rewritten: the original
// function could persist local Payment.status = "CANCELLED" on a genuinely
// AMBIGUOUS Stripe outcome (a thrown exception's fallback only special-cased
// "captured", letting "requires_capture"/"uncertain" fall through to the
// same unconditional write) — a direct violation of the house rule "never
// guess external financial state." Required invariant: Payment.status may
// become locally CANCELLED only after FutureTutor has reliable evidence the
// PaymentIntent is cancelled / no longer capturable.
// ---------------------------------------------------------------------------

export type AuthorizationReleaseOutcome = "cancelled" | "captured" | "still_capturable" | "uncertain";

/** Pure mapping, unit-testable with zero I/O — mirrors CaptureOutcome's own
 * precedent of never being a persisted PaymentStatus value itself. */
export function mapStripePiStatusToAuthorizationOutcome(
  status: Stripe.PaymentIntent.Status
): AuthorizationReleaseOutcome {
  switch (status) {
    case "succeeded":
      return "captured"; // Stripe truth: a late-won capture, NEVER "cancelled"
    case "canceled":
      return "cancelled";
    case "requires_capture":
    case "requires_action":
    case "requires_confirmation":
    case "requires_payment_method":
      return "still_capturable"; // still valid/capturable — nothing was cancelled
    default:
      return "uncertain";
  }
}

/**
 * Authoritative truth-resolution for an ambiguous authorization-cancel
 * attempt — deliberately separate from resolveCaptureOutcomeAndConverge
 * (never calls convergeToCaptureFailed; a deliberate cancellation-driven
 * release is not a "capture failure" — that function is correctly scoped to
 * the capture pipeline's own ambiguity, not the authorization-release
 * pipeline's). Safe to call any number of times — always re-reads Stripe's
 * current state fresh via a plain retrieve by the already-known, durable
 * stripePaymentIntentId; never re-attempts a write itself beyond the local
 * convergence below.
 */
export async function resolveAuthorizationReleaseOutcomeAndConverge(
  paymentId: string
): Promise<AuthorizationReleaseOutcome> {
  const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (payment.status === "CANCELLED") return "cancelled";
  if (payment.status === "CAPTURED") return "captured";
  if (!payment.stripePaymentIntentId) return "uncertain"; // defensive — cancelAuthorizedPayment routes this case locally, never reaching here

  const stripe = getStripeClient();
  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
  } catch {
    return "uncertain"; // never guessed — genuinely unknown, retry later
  }

  const outcome = mapStripePiStatusToAuthorizationOutcome(pi.status);
  switch (outcome) {
    case "captured":
      await convergeToCaptured(paymentId); // Stripe truth: captured — §L's fixed convergence owns fulfillment/cancel-race handling
      return "captured";
    case "cancelled":
      // Stripe truth: definitively cancelled. Local-only convergence — no
      // Booking write here (cancellationPolicy.ts's Phase 1 already owns
      // that; this function's job is Payment.status only), no
      // CAPTURE_FAILED conflation.
      await db.payment.updateMany({
        where: { id: paymentId, status: { in: ["PENDING", "REQUIRES_ACTION", "AUTHORIZED"] } },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
      return "cancelled";
    case "still_capturable":
    case "uncertain":
    default:
      // No local write. Safe to retry (cancelAuthorizedPayment itself, the
      // next reconciliation sweep pass, or a late-won capture).
      return outcome;
  }
}

/**
 * Step A/B/C for releasing a pre-capture Stripe authorization hold. Returns
 * the definitive outcome rather than void, so callers never have to
 * re-derive what happened from a subsequent read.
 */
export async function cancelAuthorizedPayment(paymentId: string): Promise<AuthorizationReleaseOutcome> {
  const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (payment.status === "CANCELLED") return "cancelled";
  if (payment.status === "CAPTURED") return "captured";

  if (!payment.stripePaymentIntentId) {
    // A locally PENDING/REQUIRES_ACTION Payment with no Stripe object at
    // all — there is nothing external to guess about, so this converges
    // LOCALLY, with no Stripe call. Safe unconditionally: no PaymentIntent
    // means no authorization hold could possibly exist to leak.
    await db.payment.updateMany({
      where: { id: paymentId, status: { in: ["PENDING", "REQUIRES_ACTION"] } },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    return "cancelled";
  }

  const stripe = getStripeClient();
  try {
    await stripe.paymentIntents.cancel(payment.stripePaymentIntentId, {}, { idempotencyKey: `cancel:${payment.id}` });
    // A non-throwing cancel() call is itself Stripe's own synchronous,
    // authoritative confirmation — Stripe only returns success once the PI
    // has actually transitioned to `canceled` (an already-`succeeded` PI
    // throws instead). Safe to persist directly; this is not a guess.
    await db.payment.updateMany({
      where: { id: paymentId, status: { in: ["PENDING", "REQUIRES_ACTION", "AUTHORIZED"] } },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    return "cancelled";
  } catch {
    // Ambiguous — never guess. Resolve from Stripe's own current,
    // authoritative state instead of assuming the cancel "mostly worked."
    return resolveAuthorizationReleaseOutcomeAndConverge(paymentId);
  }
}

// ---------------------------------------------------------------------------
// Phase H.8 (§M/§N/§O/§P/§Q, amended §AM) — refund architecture. Same Step
// A (durable local identity) / B (Stripe, keyed on that identity) / C
// (authoritative convergence, discovery-first, retrieve-preferred) shape as
// the G.1 capture pipeline. The Refund row's own id is now a DETERMINISTIC
// hash of bookingId, not a random uuid — this is what makes it a stable,
// idempotent identity: any retry (HTTP retry, process restart, webhook
// race, reconciliation sweep, repeated recovery invocation) resolves to the
// exact same row. createRefund is retired in favor of this set.
// ---------------------------------------------------------------------------

export type RefundOutcome = "succeeded" | "failed" | "pending" | "uncertain";

/** Deterministic, collision-resistant, no external dependency — same value
 * every time for the same bookingId, forever. H.8's product scope (one
 * cancellation event produces at most one refund decision) means "one
 * logical refund operation" and "one Booking's cancellation" are the same
 * thing for the lifetime of this phase — see the plan's §M for the full
 * forward-compatibility note on why this is safe without a migration. */
export function refundIdForBooking(bookingId: string): string {
  return `refund_${createHash("sha256").update(bookingId).digest("hex").slice(0, 32)}`;
}

/** Step A — idempotent by construction via the deterministic id above. */
export async function getOrCreateRefund(params: {
  bookingId: string;
  paymentId: string;
  amountCents: number;
  reason: string;
  actorUserId: string | null;
}) {
  const id = refundIdForBooking(params.bookingId);
  const existing = await db.refund.findUnique({ where: { id } });
  if (existing) return existing;

  try {
    return await db.refund.create({
      data: {
        id,
        paymentId: params.paymentId,
        bookingId: params.bookingId,
        amountCents: params.amountCents,
        reason: params.reason,
        actorUserId: params.actorUserId,
        status: "PENDING",
      },
    });
  } catch (error) {
    // Race: a concurrent trigger created it between our read and this
    // write — same pattern as getOrCreatePaymentForQuote.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return db.refund.findUniqueOrThrow({ where: { id } });
    }
    throw error;
  }
}

/** Pure mapping, unit-testable with zero I/O. */
export function mapStripeRefundStatus(status: string | null | undefined): RefundOutcome {
  switch (status) {
    case "succeeded":
      return "succeeded";
    case "pending":
      return "pending";
    case "failed":
    case "canceled":
      return "failed";
    default:
      return "uncertain";
  }
}

/** The ONLY question that matters for "is this Booking's refund obligation
 * done" — never Refund.status alone, which only ever describes one Stripe
 * ATTEMPT, not the obligation. */
export function isRefundObligationSatisfied(owedCents: number, payment: { refundedAmountCents: number }): boolean {
  return payment.refundedAmountCents >= owedCents;
}

/** Recovery idempotency key derivation — pure, deterministic. A retry of
 * the SAME logical recovery attempt derives the SAME key; a subsequent
 * recovery derived from a DIFFERENT (later) failed attempt derives a
 * DIFFERENT key. */
export function deriveRecoveryIdempotencyKey(refundId: string, previousFailedStripeRefundId: string): string {
  return `refund:${refundId}:retry-after:${previousFailedStripeRefundId}`;
}

/** Phase H.8.2 — the safe result of classifying a thrown error from a
 * recovery-attempt `stripe.refunds.create` call. `definitive: true` means
 * the installed Stripe SDK itself guarantees no new Refund object was
 * created (see classifyStripeRefundCreateFailure's own doc comment for the
 * exact reasoning); `definitive: false` means the outcome is genuinely
 * ambiguous and must never be treated as proof of anything. */
export interface StripeRefundCreateFailureClassification {
  definitive: boolean;
  /** Stripe's own documented error-type vocabulary (e.g.
   * "invalid_request_error") — the RAW API type, not the SDK's exception
   * class name (Stripe.errors.StripeInvalidRequestError.type is actually
   * set to the class name; the real API-level type lives on `.rawType`).
   * Never the human-readable `.message`. */
  type: string | null;
  code: string | null;
  requestId: string | null;
}

const AMBIGUOUS_CLASSIFICATION: StripeRefundCreateFailureClassification = {
  definitive: false,
  type: null,
  code: null,
  requestId: null,
};

/**
 * Phase H.8.2 — distinguishes a DEFINITIVE Stripe rejection of a refund
 * recovery CREATE request (a fully-completed, synchronous HTTP response
 * proving no new Stripe Refund object was created) from an AMBIGUOUS
 * outcome (a timeout, connection reset, or unknown server error, where
 * Stripe's own processing state is genuinely unknown and must NEVER be
 * assumed empty — the existing discovery-first architecture is the only
 * safe way to resolve those, unchanged by this function).
 *
 * Grounded in the installed Stripe SDK's own error taxonomy
 * (node_modules/stripe/cjs/Error.d.ts / Error.js), never in fragile
 * string-matching against the human-readable `.message`:
 *
 *   - `Stripe.errors.StripeInvalidRequestError` is generated by the SDK's
 *     own `generateV1Error` ONLY from a fully-received, fully-parsed HTTP
 *     response with `statusCode 400` or `404` (see Error.js) — i.e. the
 *     request definitely reached Stripe and Stripe definitively rejected
 *     it as invalid BEFORE performing the refund. Stripe's own
 *     documentation separately confirms a Refund object can never be
 *     created already-`failed` — failures after creation are always
 *     asynchronous — so a synchronous `invalid_request_error` on the
 *     CREATE call itself proves no Refund object was ever created for
 *     this attempt. This is what makes PENDING -> FAILED safe here.
 *   - `Stripe.errors.StripeConnectionError` (no response ever received),
 *     `Stripe.errors.StripeAPIError` (5xx — Stripe's own server may or may
 *     not have finished processing before erroring), rate limits,
 *     authentication errors, and any non-Stripe error (a local bug, a
 *     thrown non-Error value) are all classified AMBIGUOUS — the
 *     discovery-first machinery this file already uses everywhere else
 *     (`findMatchingStripeRefunds` / `getAccountedStripeRefundIds`) is the
 *     only safe way to resolve those, exactly as it already does for every
 *     other ambiguous Stripe failure in this file. Failing closed here on
 *     anything not proven definitive is deliberate (task requirement: "if
 *     Stripe semantics are uncertain: fail closed and use discovery").
 *
 * `.rawType`/`.code`/`.requestId` are Stripe's own structured, short,
 * documented enum/id values (never PII, never the raw error payload, never
 * card/bank details) — safe to persist in AuditLog metadata.
 */
export function classifyStripeRefundCreateFailure(error: unknown): StripeRefundCreateFailureClassification {
  if (
    error instanceof Stripe.errors.StripeInvalidRequestError &&
    typeof error.statusCode === "number" &&
    error.statusCode >= 400 &&
    error.statusCode < 500
  ) {
    return {
      definitive: true,
      type: error.rawType ?? error.type ?? null,
      code: error.code ?? null,
      requestId: error.requestId ?? null,
    };
  }
  return AMBIGUOUS_CLASSIFICATION;
}

/**
 * Exhaustive discovery, never a single-page guess. stripe.refunds.list(...)
 * returns an ApiListPromise<Refund> (AsyncIterableIterator<T>) — a plain
 * `for await` transparently walks every page Stripe has for this query,
 * indefinitely, until either a match is found or the list is truly
 * exhausted.
 */
async function findMatchingStripeRefunds(
  stripe: Stripe,
  paymentIntentId: string,
  logicalRefundId: string
): Promise<Stripe.Refund[]> {
  const matches: Stripe.Refund[] = [];
  for await (const candidate of stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100 })) {
    if (candidate.metadata?.refundId === logicalRefundId) matches.push(candidate);
  }
  return matches;
}

/**
 * Phase H.8 amendment (§AM) — every historical Stripe Refund id already
 * accounted for by a prior, durably-recorded FAILED attempt for this
 * logical Refund, derived entirely from AuditLog (never from an in-memory
 * value, so this survives an arbitrary process crash). See
 * FutureTutor_H8_Implementation_Plan.md §AM for the full design/proof.
 */
async function getAccountedStripeRefundIds(refundId: string): Promise<Set<string>> {
  const rows = await db.auditLog.findMany({
    where: {
      entityType: "Refund",
      entityId: refundId,
      action: { in: ["refund.failed_requires_recovery", "refund.recovery_attempt_started"] },
    },
    select: { action: true, metadata: true },
  });
  const accounted = new Set<string>();
  for (const row of rows) {
    const metadata = row.metadata as Record<string, unknown> | null;
    const key = row.action === "refund.failed_requires_recovery" ? "failedStripeRefundId" : "previousFailedStripeRefundId";
    const value = metadata?.[key];
    if (typeof value === "string") accounted.add(value);
  }
  return accounted;
}

/** Phase H.8 amendment (§AM) — durable answer to "is a recovery currently
 * in flight for this Refund, and if so, which prior failed attempt did it
 * start from," read fresh from AuditLog every time. */
async function getMostRecentRecoveryContext(
  refundId: string
): Promise<{ previousFailedStripeRefundId: string } | null> {
  const row = await db.auditLog.findFirst({
    where: { entityType: "Refund", entityId: refundId, action: "refund.recovery_attempt_started" },
    orderBy: { createdAt: "desc" },
    select: { metadata: true },
  });
  const value = (row?.metadata as Record<string, unknown> | undefined)?.previousFailedStripeRefundId;
  return typeof value === "string" ? { previousFailedStripeRefundId: value } : null;
}

/** Discovery classification, shared by every caller — the ordinary
 * resolver's discovery branch, recoverFailedRefund's discovery branch, and
 * webhook observedStripeRefundId validation all apply this identical rule
 * (§AM). */
function classifyDiscoveredStripeRefunds(
  matches: Stripe.Refund[],
  currentStripeRefundId: string | null,
  accountedIds: Set<string>
): { accounted: Stripe.Refund[]; current: Stripe.Refund | null; unaccounted: Stripe.Refund[] } {
  const accounted: Stripe.Refund[] = [];
  const unaccounted: Stripe.Refund[] = [];
  let current: Stripe.Refund | null = null;
  for (const candidate of matches) {
    if (currentStripeRefundId && candidate.id === currentStripeRefundId) {
      current = candidate;
      continue;
    }
    if (accountedIds.has(candidate.id)) {
      accounted.push(candidate);
      continue;
    }
    unaccounted.push(candidate);
  }
  return { accounted, current, unaccounted };
}

interface MinimalRefundRow {
  id: string;
  bookingId: string;
  amountCents: number;
  currency: string;
  actorUserId: string | null;
}
interface MinimalPaymentRow {
  id: string;
  payerUserId: string;
}

/**
 * Phase H.8.1 (§8, ledger terminology per §0 item 6) — recomputes
 * Payment.refundedAmountCents/status from the AUTHORITATIVE CURRENT sum of
 * SUCCEEDED Refund rows for this Payment, never incremented/decremented by
 * delta. Called from inside the SAME transaction as any Refund.status write
 * that could change this sum — both the ordinary first-success branch and
 * the SUCCEEDED->FAILED reversal branch below call this identically, so
 * refundedAmountCents and the Refund rows it derives from can never
 * silently diverge, regardless of which direction the change is moving.
 *
 * Payment.refundedAmountCents means: the total amount, in cents, that
 * Stripe's own CURRENT, authoritative record confirms has actually,
 * successfully refunded RIGHT NOW — never "finally" or "irreversibly"
 * settled (Stripe does not guarantee that), and explicitly revisable
 * downward if Stripe later authoritatively reports that a
 * previously-succeeded current Refund failed.
 *
 * Returns null (and writes a payment.refund_ledger_state_conflict audit
 * row) without touching Payment if its current status is not one of
 * CAPTURED/PARTIALLY_REFUNDED/REFUNDED — should be unreachable in practice
 * (a Refund only ever exists against a CAPTURED payment, per
 * runRefundBranch's own gating), but this function refuses to guess rather
 * than silently write into a state it was never designed to represent.
 */
const PAYMENT_STATUSES_ELIGIBLE_FOR_REFUND_LEDGER: readonly PaymentStatus[] = ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"];

/**
 * Pure mapping, zero I/O, unit-testable exactly like mapStripeRefundStatus/
 * mapStripePiStatusToAuthorizationOutcome (H.8.1 plan §19). This is the
 * ENTIRE decision logic of derivePaymentRefundState, extracted so it can be
 * tested directly against `{amountCents, currentStatus, successfulRefundAmounts}`
 * without a database. Returns null (never write) when currentStatus is not
 * one of CAPTURED/PARTIALLY_REFUNDED/REFUNDED — derivePaymentRefundState
 * uses that null to gate its audit-and-skip conflict path.
 */
export function mapRefundedAmountToPaymentState(input: {
  amountCents: number;
  currentStatus: PaymentStatus;
  successfulRefundAmounts: number[];
}): { settledRefundedCents: number; nextStatus: PaymentStatus } | null {
  if (!PAYMENT_STATUSES_ELIGIBLE_FOR_REFUND_LEDGER.includes(input.currentStatus)) return null;

  const settledRefundedCents = input.successfulRefundAmounts.reduce((sum, cents) => sum + cents, 0);
  const nextStatus: PaymentStatus =
    settledRefundedCents <= 0
      ? "CAPTURED"
      : settledRefundedCents >= input.amountCents
        ? "REFUNDED"
        : "PARTIALLY_REFUNDED";

  return { settledRefundedCents, nextStatus };
}

/**
 * Phase H.8.1 (§8, ledger terminology per §0 item 6) — recomputes
 * Payment.refundedAmountCents/status from the AUTHORITATIVE CURRENT sum of
 * SUCCEEDED Refund rows for this Payment, never incremented/decremented by
 * delta. Called from inside the SAME transaction as any Refund.status write
 * that could change this sum — both the ordinary first-success branch and
 * the SUCCEEDED->FAILED reversal branch below call this identically, so
 * refundedAmountCents and the Refund rows it derives from can never
 * silently diverge, regardless of which direction the change is moving.
 * All DECISION logic lives in the pure mapRefundedAmountToPaymentState
 * above — this function's own job is purely I/O (read, delegate, write).
 */
async function derivePaymentRefundState(
  tx: Prisma.TransactionClient,
  paymentId: string
): Promise<{ settledRefundedCents: number; nextStatus: PaymentStatus } | null> {
  const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });

  const succeededRefunds = await tx.refund.findMany({
    where: { paymentId, status: "SUCCEEDED" },
    select: { amountCents: true },
  });

  const result = mapRefundedAmountToPaymentState({
    amountCents: payment.amountCents,
    currentStatus: payment.status,
    successfulRefundAmounts: succeededRefunds.map((r) => r.amountCents),
  });

  if (!result) {
    // Should be unreachable in practice (a Refund only ever exists against
    // a CAPTURED payment, per runRefundBranch's own gating), but this
    // refuses to guess rather than silently write into a state it was
    // never designed to represent.
    await writeAuditLog(
      {
        actorUserId: null,
        action: "payment.refund_ledger_state_conflict",
        entityType: "Payment",
        entityId: paymentId,
        metadata: { currentStatus: payment.status },
      },
      tx
    );
    return null;
  }

  await tx.payment.update({
    where: { id: paymentId },
    data: { refundedAmountCents: result.settledRefundedCents, status: result.nextStatus },
  });

  return result;
}

/**
 * Phase H.8.1 (§14/§16) — re-reads the original CONTRACTUAL refund amount
 * for a booking's cancellation, the same way convergeCancelledBookingPayment
 * already does (never recomputed from "now," which could unfairly differ
 * from the moment of the original cancellation decision). tx-scoped so it
 * can be called from inside the reversal transaction. Falls back to the
 * given amount (the current Refund attempt's own amountCents) if no
 * cancellation-intent AuditLog row exists — defensively, for callers/tests
 * that exercise the refund-attempt-chain machinery directly, without ever
 * running the full cancelBookingWithRefund flow.
 */
async function resolveOriginalOwedCentsForBooking(
  tx: Prisma.TransactionClient,
  bookingId: string,
  fallbackCents: number
): Promise<number> {
  const intentRow = await tx.auditLog.findFirst({
    where: {
      entityType: "Booking",
      entityId: bookingId,
      action: { in: ["booking.cancelled_by_customer", "booking.cancelled_by_tutor", "booking.cancelled_by_admin"] },
    },
    orderBy: { createdAt: "asc" },
    select: { metadata: true },
  });
  const intentMetadata = intentRow?.metadata as Record<string, unknown> | undefined;
  return typeof intentMetadata?.computedRefundCents === "number" ? intentMetadata.computedRefundCents : fallbackCents;
}

/** Shared Stripe-status-to-local-convergence mapping — used by BOTH
 * resolveRefundOutcomeAndConverge (first/ordinary attempts) and
 * recoverFailedRefund (recovery attempts). One mapping, defined once —
 * never two independent interpretations of the same Stripe status value.
 *
 * Phase H.8.1 amendment — the "failed" branch below now reads the Refund's
 * CURRENT status fresh (never trusting the possibly-stale `refund` param)
 * and dispatches three ways: PENDING->FAILED (ordinary first-attempt
 * failure, byte-for-byte unchanged from pre-H.8.1 — Payment untouched, no
 * transaction), SUCCEEDED->FAILED (NEW — the Scenario-G reversal, §7.2/§8/
 * §14/§16 of the H.8.1 plan), and already-FAILED (duplicate observation,
 * no-op). */
async function applyStripeRefundStatusConvergence(
  refund: MinimalRefundRow,
  payment: MinimalPaymentRow,
  stripeRefund: Stripe.Refund
): Promise<RefundOutcome> {
  const mapped = mapStripeRefundStatus(stripeRefund.status);

  if (mapped === "succeeded") {
    await db.$transaction(async (tx) => {
      // The guarded updateMany's own count is the sole authority for "did
      // THIS call just perform the PENDING -> SUCCEEDED transition" — what
      // makes any number of concurrent/repeated calls apply the amount
      // exactly once.
      const transition = await tx.refund.updateMany({
        where: { id: refund.id, status: "PENDING" },
        data: { status: "SUCCEEDED", stripeRefundId: stripeRefund.id },
      });
      if (transition.count === 1) {
        // H.8.1 §8 — recomputed from authoritative current state, never
        // accumulated by unconditional addition.
        await derivePaymentRefundState(tx, payment.id);
        const currentPayment = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
        await writeAuditLog(
          {
            actorUserId: refund.actorUserId,
            action: "payment.refunded",
            entityType: "Refund",
            entityId: refund.id,
            metadata: { bookingId: refund.bookingId, amountCents: refund.amountCents, stripeRefundId: stripeRefund.id },
          },
          tx
        );
        // H.8.1 §13 — "Refund initiated," not "Refund issued": at this
        // instant FutureTutor only knows Stripe's synchronous/first-
        // discovered response, which is not guaranteed permanently final
        // (Stripe's own documentation confirms succeeded can later revert).
        await notifyUser(tx, {
          userId: currentPayment.payerUserId,
          type: "payment.refund_initiated",
          title: "Refund initiated",
          body: `Your refund of ${(refund.amountCents / 100).toFixed(2)} ${refund.currency} has been initiated. Your bank may take several business days to process it.`,
          metadata: { bookingId: refund.bookingId, refundId: refund.id },
        });
      }
      // else: lost the race to another concurrent convergence call that
      // already applied this exact SUCCEEDED transition — a clean,
      // idempotent no-op, not an error.
    });
    return "succeeded";
  }

  if (mapped === "failed") {
    // Never trust the `refund` param's status — always re-read fresh,
    // authoritative CURRENT state before dispatching (H.8.1 §7.2).
    const currentRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });

    if (currentRefund.status === "FAILED") {
      // Second/duplicate observation of an already-failed attempt —
      // webhook redelivery or a race loser. Clean no-op, no new writes.
      return "failed";
    }

    if (currentRefund.status === "SUCCEEDED") {
      // ---------------------------------------------------------------
      // H.8.1 — THE REVERSAL (Scenario G). SUCCEEDED -> FAILED. Serializable
      // + retry, single transaction for guard+ledger+audit+notification
      // (§16): a crash between these writes could otherwise leave
      // Refund.status=FAILED committed while Payment.refundedAmountCents
      // still reflects the stale SUCCEEDED amount.
      // ---------------------------------------------------------------
      return withSerializableRetry(() =>
        db.$transaction(
          async (tx) => {
            const paymentBefore = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
            const previousRefundedAmountCents = paymentBefore.refundedAmountCents;

            const transition = await tx.refund.updateMany({
              where: { id: refund.id, status: "SUCCEEDED" },
              data: { status: "FAILED", stripeRefundId: stripeRefund.id },
            });

            if (transition.count === 1) {
              const ledger = await derivePaymentRefundState(tx, payment.id);
              const newRefundedAmountCents = ledger?.settledRefundedCents ?? previousRefundedAmountCents;
              const failureReason = (stripeRefund as Stripe.Refund).failure_reason ?? null;

              // Reused, UNCHANGED shape — this is what makes
              // recoverFailedRefund/getAccountedStripeRefundIds treat the
              // reversed id as historical with zero changes to that
              // machinery (H.8.1 §9/§12).
              await writeAuditLog(
                {
                  actorUserId: null,
                  action: "refund.failed_requires_recovery",
                  entityType: "Refund",
                  entityId: refund.id,
                  metadata: {
                    bookingId: refund.bookingId,
                    paymentId: payment.id,
                    failedStripeRefundId: stripeRefund.id,
                    owedCents: refund.amountCents,
                    failureReason,
                  },
                },
                tx
              );
              // NEW — H.8.1 §14.
              await writeAuditLog(
                {
                  actorUserId: null,
                  action: "refund.succeeded_then_failed",
                  entityType: "Refund",
                  entityId: refund.id,
                  metadata: {
                    localRefundId: refund.id,
                    stripeRefundId: stripeRefund.id,
                    failureReason,
                    paymentId: payment.id,
                    bookingId: refund.bookingId,
                    amountCents: refund.amountCents,
                    previousLocalStatus: "SUCCEEDED",
                    newLocalStatus: "FAILED",
                    previousRefundedAmountCents,
                    newRefundedAmountCents,
                  },
                },
                tx
              );
              // NEW — H.8.1 §14. owedCents = the ORIGINAL contractual
              // amount, re-read the same way convergeCancelledBookingPayment
              // does — never recomputed from "now."
              const owedCents = await resolveOriginalOwedCentsForBooking(tx, refund.bookingId, refund.amountCents);
              await writeAuditLog(
                {
                  actorUserId: null,
                  action: "refund.obligation_reopened",
                  entityType: "Refund",
                  entityId: refund.id,
                  metadata: { bookingId: refund.bookingId, paymentId: payment.id, refundId: refund.id, owedCents },
                },
                tx
              );
              // H.8.1 §13 — the ONLY trigger for this notification, gated
              // on the same count === 1 guard as the audit rows above
              // (never a duplicate under redelivery/races). Deliberately
              // never exposes failureReason (an internal Stripe code) to
              // the customer.
              await notifyUser(tx, {
                userId: paymentBefore.payerUserId,
                type: "payment.refund_problem",
                title: "Refund processing problem",
                body: `We encountered a problem processing your refund of ${(refund.amountCents / 100).toFixed(2)} ${refund.currency}. We're working to resolve it.`,
                metadata: { bookingId: refund.bookingId, refundId: refund.id },
              });
            }
            // else: count === 0 — lost the race to a concurrent caller
            // that already performed this exact reversal. Clean,
            // idempotent no-op — still correctly reports "failed" (some
            // caller DID make it authoritatively FAILED by this point).
            return "failed" as RefundOutcome;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        )
      );
    }

    // currentRefund.status === "PENDING" — ordinary first-attempt failure.
    // BYTE-FOR-BYTE UNCHANGED from pre-H.8.1: guarded update + single audit
    // write, sequential, no transaction (Payment is never touched here —
    // an ordinary first-attempt failure never affects the ledger).
    const transition = await db.refund.updateMany({
      where: { id: refund.id, status: "PENDING" },
      data: { status: "FAILED", stripeRefundId: stripeRefund.id },
    });
    if (transition.count === 1) {
      await writeAuditLog({
        actorUserId: null,
        action: "refund.failed_requires_recovery",
        entityType: "Refund",
        entityId: refund.id,
        metadata: {
          bookingId: refund.bookingId,
          paymentId: payment.id,
          failedStripeRefundId: stripeRefund.id,
          owedCents: refund.amountCents,
          failureReason: (stripeRefund as Stripe.Refund).failure_reason ?? null,
        },
      });
    }
    return "failed";
  }

  return mapped; // "pending" or "uncertain"
}

/**
 * Step C — the authoritative refund convergence function. Callable from the
 * synchronous cancellation path, the direct refund.* webhook (with
 * `observedStripeRefundId`, §P/§AM), and the reconciliation sweep — any
 * number of times, in any order, always safe. Discovery-before-creation,
 * retrieve-before-create, fail-closed on ambiguity/duplicates.
 */
export async function resolveRefundOutcomeAndConverge(
  refundId: string,
  options?: { observedStripeRefundId?: string }
): Promise<RefundOutcome> {
  const refund = await db.refund.findUniqueOrThrow({ where: { id: refundId } });
  if (refund.status === "FAILED") return "failed"; // never auto-retried — recoverFailedRefund is the only deliberate recovery path

  if (refund.status === "SUCCEEDED") {
    // Phase H.8.1 (§7.1) — SUCCEEDED is no longer unconditionally terminal.
    // Exactly ONE new branch: the caller explicitly names the CURRENT
    // attempt's own stripeRefundId as what it observed (a genuine
    // refund.failed/refund.updated webhook for this exact attempt, or a
    // Tier-7 reconciliation self-check). Every other combination is
    // BYTE-FOR-BYTE UNCHANGED from pre-H.8.1 behavior.
    const observed = options?.observedStripeRefundId;

    // No observed id at all — the overwhelming majority of calls (internal
    // convergence calls, repeated manual calls with no webhook context).
    if (!observed) return "succeeded";

    // observed names a DIFFERENT Stripe Refund id than the current attempt
    // — the stale-historical-webhook-for-a-superseded-attempt case (test
    // 34M's exact regression guard). UNCHANGED: still an unconditional
    // "succeeded," no re-examination, no new audit row. This case was
    // already, and remains, entirely inert — it is the current-vs-
    // historical attempt identity protection (§9 of the H.8.1 plan) that
    // getAccountedStripeRefundIds/the PENDING-only webhook-authoritative
    // branch further below already implements for the DISCOVERY path; a
    // SUCCEEDED refund never reaches that branch, before or after this
    // change, and must not start doing so now — re-routing this case
    // through code designed only for PENDING refunds would return
    // "uncertain" instead of the required, provably-unchanged "succeeded".
    if (observed !== refund.stripeRefundId) return "succeeded";

    // observed === refund.stripeRefundId — THE NEW BRANCH. Never trust the
    // webhook payload's own status field (§10 "never trust the webhook
    // payload alone") — always re-retrieve authoritative Stripe state
    // fresh, validate it, then let applyStripeRefundStatusConvergence
    // decide: still "succeeded" -> true no-op (its own PENDING-only guard
    // matches zero rows); now "failed" -> the Scenario-G reversal.
    const payment = await db.payment.findUniqueOrThrow({ where: { id: refund.paymentId } });

    if (!paymentsUseStripe()) return "succeeded"; // dev-bypass mode never had a real Stripe object to regress from

    const stripe = getStripeClient();
    let stripeRefund: Stripe.Refund;
    try {
      stripeRefund = await stripe.refunds.retrieve(observed);
    } catch {
      return "uncertain";
    }
    if (stripeRefund.payment_intent !== payment.stripePaymentIntentId || stripeRefund.amount !== refund.amountCents) {
      await writeAuditLog({
        actorUserId: null,
        action: "refund.discovery_mismatch",
        entityType: "Refund",
        entityId: refund.id,
        metadata: { discoveredStripeRefundId: stripeRefund.id, discoveredAmount: stripeRefund.amount, expectedAmount: refund.amountCents },
      });
      return "uncertain";
    }
    return applyStripeRefundStatusConvergence(refund, payment, stripeRefund);
  }

  const payment = await db.payment.findUniqueOrThrow({ where: { id: refund.paymentId } });

  // PAYMENT_MODE=disabled_dev — the Payment was never actually created at
  // Stripe (see createDevBypassCapturedPayment), so there is nothing real
  // to refund there either. Mirrors that same bypass shape as the pre-H.8
  // createRefund: converge local state directly, no Stripe call, no
  // webhook/discovery machinery involved (none of that exists in this mode).
  if (!paymentsUseStripe()) {
    const bypassId = refund.stripeRefundId ?? `dev-bypass-${refund.id}`;
    const bypassRefund = {
      id: bypassId,
      status: "succeeded",
      payment_intent: payment.stripePaymentIntentId,
      amount: refund.amountCents,
      failure_reason: null,
    } as unknown as Stripe.Refund;
    return applyStripeRefundStatusConvergence(refund, payment, bypassRefund);
  }

  const stripe = getStripeClient();

  // --- Webhook-authoritative path (§AM "STALE WEBHOOK SAFETY") ---
  if (options?.observedStripeRefundId) {
    const observed = options.observedStripeRefundId;
    if (refund.stripeRefundId && observed !== refund.stripeRefundId) {
      const accountedIds = await getAccountedStripeRefundIds(refundId);
      if (accountedIds.has(observed)) {
        await writeAuditLog({
          actorUserId: null,
          action: "refund.stale_webhook_ignored",
          entityType: "Refund",
          entityId: refund.id,
          metadata: { observedStripeRefundId: observed, currentStripeRefundId: refund.stripeRefundId },
        });
        return refund.status === "PENDING" ? "pending" : "uncertain"; // logical Refund's live status is untouched
      }
      await writeAuditLog({
        actorUserId: null,
        action: "refund.discovery_multiple_candidates",
        entityType: "Refund",
        entityId: refund.id,
        metadata: { observedStripeRefundId: observed, currentStripeRefundId: refund.stripeRefundId, source: "webhook" },
      });
      return "uncertain"; // unrecognized — never trusted merely because metadata.refundId matched
    }
    if (!refund.stripeRefundId) {
      const accountedIds = await getAccountedStripeRefundIds(refundId);
      if (accountedIds.has(observed)) {
        await writeAuditLog({
          actorUserId: null,
          action: "refund.stale_webhook_ignored",
          entityType: "Refund",
          entityId: refund.id,
          metadata: { observedStripeRefundId: observed },
        });
        return "pending";
      }
      let candidate: Stripe.Refund;
      try {
        candidate = await stripe.refunds.retrieve(observed);
      } catch {
        return "uncertain";
      }
      if (candidate.payment_intent !== payment.stripePaymentIntentId || candidate.amount !== refund.amountCents) {
        await writeAuditLog({
          actorUserId: null,
          action: "refund.discovery_mismatch",
          entityType: "Refund",
          entityId: refund.id,
          metadata: { discoveredStripeRefundId: candidate.id, discoveredAmount: candidate.amount, expectedAmount: refund.amountCents },
        });
        return "uncertain";
      }
      await db.refund.updateMany({ where: { id: refund.id, stripeRefundId: null }, data: { stripeRefundId: candidate.id } });
      return applyStripeRefundStatusConvergence(refund, payment, candidate);
    }
    // observed === refund.stripeRefundId — falls through to the ordinary
    // known-id retrieve path below.
  }

  // --- Ordinary path ---
  let stripeRefund: Stripe.Refund;
  try {
    if (refund.stripeRefundId) {
      stripeRefund = await stripe.refunds.retrieve(refund.stripeRefundId);
    } else {
      if (!payment.stripePaymentIntentId) return "uncertain";
      const accountedIds = await getAccountedStripeRefundIds(refundId);
      const allMatches = await findMatchingStripeRefunds(stripe, payment.stripePaymentIntentId, refund.id);
      const { unaccounted } = classifyDiscoveredStripeRefunds(allMatches, null, accountedIds);

      if (unaccounted.length > 1) {
        await writeAuditLog({
          actorUserId: null,
          action: "refund.discovery_multiple_candidates",
          entityType: "Refund",
          entityId: refund.id,
          metadata: { candidateStripeRefundIds: unaccounted.map((m) => m.id), paymentIntentId: payment.stripePaymentIntentId },
        });
        return "uncertain";
      }

      const discovered = unaccounted[0];
      if (discovered) {
        if (discovered.payment_intent !== payment.stripePaymentIntentId || discovered.amount !== refund.amountCents) {
          await writeAuditLog({
            actorUserId: null,
            action: "refund.discovery_mismatch",
            entityType: "Refund",
            entityId: refund.id,
            metadata: { discoveredStripeRefundId: discovered.id, discoveredAmount: discovered.amount, expectedAmount: refund.amountCents },
          });
          return "uncertain";
        }
        await db.refund.updateMany({ where: { id: refund.id, stripeRefundId: null }, data: { stripeRefundId: discovered.id } });
        stripeRefund = discovered;
      } else if (accountedIds.size === 0) {
        // Genuinely first-ever attempt, confirmed by exhaustive search —
        // safe to create with the ORIGINAL stable key. UNREACHABLE once
        // any accounted (failed) attempt exists — that authority belongs
        // to recoverFailedRefund alone (§AM).
        stripeRefund = await stripe.refunds.create(
          {
            payment_intent: payment.stripePaymentIntentId,
            amount: refund.amountCents,
            metadata: { refundId: refund.id, paymentId: payment.id, bookingId: refund.bookingId, payerUserId: payment.payerUserId },
          },
          { idempotencyKey: `refund:${refund.id}` }
        );
        await db.refund.updateMany({ where: { id: refund.id, stripeRefundId: null }, data: { stripeRefundId: stripeRefund.id } });
      } else {
        // A recovery lineage already exists but no unaccounted Stripe
        // object was found yet — recoverFailedRefund's exclusive authority
        // to create from here. Leave visibly PENDING; the reconciliation
        // sweep's Tier 6 keeps it surfaced.
        return "pending";
      }
    }
  } catch {
    return "uncertain";
  }

  return applyStripeRefundStatusConvergence(refund, payment, stripeRefund);
}

/**
 * Phase H.8 amendment (§AM) — crash-safe, AuditLog-durable, deliberately
 * separate recovery primitive. NEVER called automatically by
 * resolveRefundOutcomeAndConverge, the webhook handler, or the
 * reconciliation sweep (a failed Stripe Refund object is never auto-
 * retried). Restartable with no dependency on any local variable surviving
 * a process crash — every fact after the initial guarded transition is
 * re-derived from AuditLog/Refund.
 */
export async function recoverFailedRefund(refundId: string): Promise<RefundOutcome> {
  const refund = await db.refund.findUniqueOrThrow({ where: { id: refundId } });
  if (refund.status === "SUCCEEDED") return "succeeded";

  if (refund.status === "FAILED") {
    // H.8.2 — refund.stripeRefundId is non-null for the ordinary case (a
    // real Stripe Refund object actually failed). It can be null here ONLY
    // via the new definitive-rejection path below (a recovery CREATE was
    // itself rejected by Stripe before any Refund object existed to record
    // an id for). In that case the durable AuditLog lineage — the most
    // recent refund.recovery_attempt_started row's own
    // previousFailedStripeRefundId — is the correct "attempt this recovery
    // supersedes" to chain from. Never guessed from status alone (task §4).
    const previousFailedStripeRefundId =
      refund.stripeRefundId ?? (await getMostRecentRecoveryContext(refund.id))?.previousFailedStripeRefundId ?? null;

    if (previousFailedStripeRefundId) {
      await db.$transaction(async (tx) => {
        const transition = await tx.refund.updateMany({
          where: { id: refund.id, status: "FAILED" },
          data: { status: "PENDING", stripeRefundId: null },
        });
        if (transition.count === 1) {
          await writeAuditLog(
            {
              actorUserId: null,
              action: "refund.recovery_attempt_started",
              entityType: "Refund",
              entityId: refund.id,
              metadata: { previousFailedStripeRefundId, bookingId: refund.bookingId },
            },
            tx
          );
        }
        // count === 0 (lost the transition to a concurrent caller) needs no
        // special handling — the code below re-reads fresh, authoritative
        // state and proceeds identically regardless of who won.
      });
    }
    // else: a FAILED refund with neither a stripeRefundId nor any
    // recorded recovery lineage at all — should be unreachable in
    // practice. Falls through without transitioning; the fresh re-read
    // below observes status still FAILED and returns "pending" via the
    // existing `current.status !== "PENDING"` guard, a safe inert no-op
    // rather than a guessed transition.
  }

  const current = await db.refund.findUniqueOrThrow({ where: { id: refundId } });
  if (current.status === "SUCCEEDED") return "succeeded";
  if (current.status !== "PENDING") return "pending";
  if (current.stripeRefundId) return resolveRefundOutcomeAndConverge(refundId);

  const recoveryContext = await getMostRecentRecoveryContext(refundId);
  if (!recoveryContext) return resolveRefundOutcomeAndConverge(refundId); // no recovery lineage exists — not this function's concern

  const { previousFailedStripeRefundId } = recoveryContext;
  const payment = await db.payment.findUniqueOrThrow({ where: { id: refund.paymentId } });
  if (!payment.stripePaymentIntentId) return "uncertain";
  const stripe = getStripeClient();

  const accountedIds = await getAccountedStripeRefundIds(refundId);
  const allMatches = await findMatchingStripeRefunds(stripe, payment.stripePaymentIntentId, refund.id);
  const { unaccounted } = classifyDiscoveredStripeRefunds(allMatches, null, accountedIds);

  if (unaccounted.length > 1) {
    await writeAuditLog({
      actorUserId: null,
      action: "refund.discovery_multiple_candidates",
      entityType: "Refund",
      entityId: refund.id,
      metadata: { candidateStripeRefundIds: unaccounted.map((m) => m.id), previousFailedStripeRefundId },
    });
    return "uncertain";
  }

  let stripeRefund: Stripe.Refund;
  if (unaccounted[0]) {
    // This exact recovery attempt was itself already made (a prior call to
    // this same function — possibly a now-dead process — got as far as
    // creating the new Stripe object but never persisted it) — adopt,
    // never re-create.
    stripeRefund = unaccounted[0];
  } else {
    try {
      stripeRefund = await stripe.refunds.create(
        {
          payment_intent: payment.stripePaymentIntentId,
          amount: refund.amountCents,
          metadata: {
            refundId: refund.id,
            paymentId: payment.id,
            bookingId: refund.bookingId,
            payerUserId: payment.payerUserId,
            recoveryOf: previousFailedStripeRefundId,
          },
        },
        { idempotencyKey: deriveRecoveryIdempotencyKey(refund.id, previousFailedStripeRefundId) }
      );
    } catch (error) {
      // H.8.2 — the R2/R3/... recovery CREATE itself can fail two
      // structurally different ways (task §7). A DEFINITIVE synchronous
      // rejection (classifyStripeRefundCreateFailure: a fully-completed
      // HTTP response proving Stripe never created a new Refund object)
      // reconverges PENDING -> FAILED so the outstanding obligation
      // becomes visible again via Tier 6's EXISTING `status: "FAILED"`
      // query — zero new reconciliation code needed (task §9 option A).
      // An AMBIGUOUS outcome (timeout/connection reset/unknown 5xx) must
      // NEVER be treated as proof nothing was created — this remains
      // PENDING exactly as before, safe for the existing discovery-first
      // machinery (findMatchingStripeRefunds/getAccountedStripeRefundIds)
      // to resolve on a later call.
      const classification = classifyStripeRefundCreateFailure(error);
      if (!classification.definitive) return "uncertain";

      await db.$transaction(async (tx) => {
        const transition = await tx.refund.updateMany({
          where: { id: refund.id, status: "PENDING" },
          data: { status: "FAILED" }, // stripeRefundId stays null — no Stripe object was ever created for this attempt
        });
        if (transition.count === 1) {
          await writeAuditLog(
            {
              actorUserId: null,
              action: "refund.recovery_create_rejected",
              entityType: "Refund",
              entityId: refund.id,
              metadata: {
                refundId: refund.id,
                paymentId: payment.id,
                bookingId: refund.bookingId,
                previousFailedStripeRefundId,
                owedCents: refund.amountCents,
                refundedAmountCents: payment.refundedAmountCents,
                stripeErrorType: classification.type,
                stripeErrorCode: classification.code,
                stripeRequestId: classification.requestId,
              },
            },
            tx
          );
        }
        // count === 0: lost the race to a concurrent caller that already
        // performed this exact reconvergence — idempotent no-op.
      });
      return "failed";
    }
  }

  await db.refund.updateMany({ where: { id: refund.id, stripeRefundId: null }, data: { stripeRefundId: stripeRefund.id } });
  return applyStripeRefundStatusConvergence(refund, payment, stripeRefund);
}

/**
 * Phase H.8 (§G Phase 2) — the single answer to "resolve a CANCELLED
 * booking's payment": callable from the synchronous cancellation path,
 * convergeToCaptured's late-discovery branch (§L), and the reconciliation
 * sweep, any number of times, in any order, always safe. Reads the
 * cancellation-intent AuditLog row (written once, atomically, alongside the
 * Booking -> CANCELLED transition, per §G Phase 1 step 7's provable-
 * uniqueness guarantees) for the tier/owed amount — never recomputes the
 * tier from "now," which could unfairly differ from the moment the human
 * actually cancelled.
 */
export async function convergeCancelledBookingPayment(bookingId: string): Promise<void> {
  const booking = await db.booking.findUnique({ where: { id: bookingId }, include: { payment: true } });
  if (!booking || booking.status !== "CANCELLED") return;
  const payment = booking.payment;
  if (!payment) return; // nothing was ever authorized — nothing to converge

  const intentRow = await db.auditLog.findFirst({
    where: {
      entityType: "Booking",
      entityId: bookingId,
      action: { in: ["booking.cancelled_by_customer", "booking.cancelled_by_tutor", "booking.cancelled_by_admin"] },
    },
    orderBy: { createdAt: "asc" },
    select: { metadata: true },
  });
  const intentMetadata = intentRow?.metadata as Record<string, unknown> | undefined;
  const owedCents = typeof intentMetadata?.computedRefundCents === "number" ? intentMetadata.computedRefundCents : 0;

  if (payment.status === "CANCELLED") return; // authorization already released, nothing further owed
  if (
    (payment.status === "REFUNDED" || payment.status === "PARTIALLY_REFUNDED") &&
    isRefundObligationSatisfied(owedCents, payment)
  ) {
    return; // already terminal-and-consistent
  }

  if (payment.status === "PENDING" || payment.status === "REQUIRES_ACTION" || payment.status === "AUTHORIZED") {
    const outcome = await cancelAuthorizedPayment(payment.id);
    switch (outcome) {
      case "cancelled": {
        const already = await db.auditLog.findFirst({
          where: { entityType: "Payment", entityId: payment.id, action: "payment.authorization_released" },
        });
        if (!already) {
          await writeAuditLog({
            actorUserId: null,
            action: "payment.authorization_released",
            entityType: "Payment",
            entityId: payment.id,
            metadata: { bookingId },
          });
          await notifyUser(db, {
            userId: payment.payerUserId,
            type: "payment.authorization_released",
            title: "Booking cancelled",
            body: "Your session was cancelled before payment was completed. No charge was made; any temporary hold has been released.",
            metadata: { bookingId },
          });
        }
        return;
      }
      case "captured": {
        const refreshed = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
        await runRefundBranch(bookingId, refreshed, owedCents);
        return;
      }
      case "still_capturable":
      case "uncertain":
      default:
        return; // genuinely unresolved — the reconciliation sweep retries; never surfaced as a cancellation failure
    }
  }

  if (payment.status === "CAPTURED") {
    await runRefundBranch(bookingId, payment, owedCents);
  }
}

async function runRefundBranch(
  bookingId: string,
  payment: { id: string; payerUserId: string; amountCents: number; refundedAmountCents: number },
  owedCents: number
): Promise<void> {
  if (owedCents <= 0) {
    // NO_REFUND tier — fully audited, no Stripe call, and never a
    // misleading "refund issued" message.
    const already = await db.auditLog.findFirst({
      where: { entityType: "Booking", entityId: bookingId, action: "payment.no_refund_recorded" },
    });
    if (already) return;
    await writeAuditLog({
      actorUserId: null,
      action: "payment.no_refund_recorded",
      entityType: "Booking",
      entityId: bookingId,
      metadata: { paymentId: payment.id },
    });
    await notifyUser(db, {
      userId: payment.payerUserId,
      type: "booking.cancelled_no_refund",
      title: "Session cancelled",
      body: "Your session was cancelled. Per the cancellation policy, no refund applies.",
      metadata: { bookingId },
    });
    return;
  }

  const remainingCents = payment.amountCents - payment.refundedAmountCents;
  const refund = await getOrCreateRefund({
    bookingId,
    paymentId: payment.id,
    amountCents: Math.max(0, Math.min(owedCents, remainingCents)),
    reason: "Booking cancelled",
    actorUserId: null,
  });
  if (refund.amountCents <= 0) return; // already fully covered
  await resolveRefundOutcomeAndConverge(refund.id);
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
