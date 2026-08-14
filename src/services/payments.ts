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

export async function convergeToCaptured(paymentId: string): Promise<void> {
  // Best-effort, outside any transaction — never blocks the critical
  // CAPTURED/CONFIRMED convergence below if this fails or the data isn't
  // available yet (see the module comment above).
  const chargeDetails = await resolveChargeAndFeeDetailsForPayment(paymentId).catch(() => null);

  await withSerializableRetry(() =>
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
  )
  );
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
