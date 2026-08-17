import "server-only";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { notifyUser } from "@/lib/notify";
import {
  resolvePaymentFromStripePaymentIntent,
  resolveCaptureOutcomeAndConverge,
  convergeToCaptureFailed,
  recordPaymentAttemptBestEffort,
  reconcileStripeFinancialDetails,
  resolveRefundOutcomeAndConverge,
} from "@/services/payments";
import { syncTutorConnectStatusFromAccount } from "@/services/stripeConnect";

const STALE_PROCESSING_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Explicit atomic processing claim (Correction 4 of the Phase G plan) —
 * not just downstream-row guards, so concurrent deliveries of the same
 * event can never duplicate a secondary effect (a notification/audit row)
 * that isn't itself protected by a unique constraint.
 *
 *   RECEIVED/FAILED -> PROCESSING  (guarded updateMany — only the winner
 *                                   of a concurrent race runs business logic)
 *   PROCESSING -> PROCESSED         (success)
 *   PROCESSING -> FAILED            (business logic threw — retryable)
 *
 * A PROCESSED event is always a true no-op on redelivery. A FAILED event
 * remains retryable — the exact contradiction Correction 3 of the Phase G
 * plan fixed (a naive "duplicate insert -> return 200" check would have
 * silently swallowed a legitimate retry of a previously-failed event).
 */
export async function processStripeWebhookEvent(event: Stripe.Event): Promise<void> {
  let record = await db.stripeWebhookEvent.findUnique({ where: { stripeEventId: event.id } });
  if (!record) {
    try {
      record = await db.stripeWebhookEvent.create({
        data: { stripeEventId: event.id, type: event.type, processingStatus: "RECEIVED" },
      });
    } catch {
      // Race: a concurrent delivery just created it — re-read rather than
      // treat this as a failure.
      record = await db.stripeWebhookEvent.findUnique({ where: { stripeEventId: event.id } });
      if (!record) throw new Error("Failed to create or find StripeWebhookEvent");
    }
  }

  if (record.processingStatus === "PROCESSED") return; // true no-op duplicate

  const claim = await db.stripeWebhookEvent.updateMany({
    where: { id: record.id, processingStatus: { in: ["RECEIVED", "FAILED"] } },
    data: { processingStatus: "PROCESSING", attemptCount: { increment: 1 }, lastAttemptAt: new Date() },
  });
  if (claim.count === 0) {
    // Another delivery already holds PROCESSING (or has already moved
    // past this point) — do not run business logic again. The
    // claim-holder completes it, or the stale-PROCESSING reclaim sweep
    // recovers it later if that process crashed.
    return;
  }

  try {
    await runStripeEventBusinessLogic(event);
    await db.stripeWebhookEvent.updateMany({
      where: { id: record.id, processingStatus: "PROCESSING" },
      data: { processingStatus: "PROCESSED", processedAt: new Date() },
    });
  } catch (error) {
    // Never a raw Stripe payload — no card/bank data is ever stored
    // anywhere in this schema by construction, so a sanitized message is
    // always safe to persist.
    await db.stripeWebhookEvent.updateMany({
      where: { id: record.id, processingStatus: "PROCESSING" },
      data: { processingStatus: "FAILED", error: error instanceof Error ? error.message.slice(0, 500) : "Unknown error" },
    });
    throw error; // the route handler returns non-2xx so Stripe retries
  }
}

function getPaymentIntentId(value: string | Stripe.PaymentIntent | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

/**
 * Deliberately narrow — only the events FutureTutor actually needs (see
 * the route handler's own subscription list), not "every Stripe event."
 * payment_intent.payment_failed is context-aware (Correction 6): the
 * business outcome depends on the LOCAL Payment's current state, never
 * inferred from the event name alone.
 */
async function runStripeEventBusinessLogic(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const payment = await resolvePaymentFromStripePaymentIntent(pi);
      if (payment) await resolveCaptureOutcomeAndConverge(payment.id);
      return;
    }
    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const payment = await resolvePaymentFromStripePaymentIntent(pi);
      if (!payment) return;
      if (payment.status === "AUTHORIZED" && payment.bookingId) {
        // Capture-phase failure — a tutor slot was already reserved, and the
        // authorization is definitively no longer usable. This remains a
        // genuinely terminal failure (unlike the branch below) — unchanged.
        // Not a "confirmation try" in the PaymentAttempt sense (see its
        // schema comment), so no attempt is recorded here.
        await convergeToCaptureFailed(payment.id);
        return;
      }

      // Authorization-phase failure — a single declined/failed confirmation
      // ATTEMPT, not a failed payment OBLIGATION. Stripe's own PaymentIntent
      // is not terminal here: a decline or a failed 3DS challenge returns it
      // to requires_payment_method (or leaves it at requires_action for
      // another authentication try), fully able to accept another attempt
      // against this exact same PI — the normal, expected retry flow, not an
      // edge case (see the Payment model's own schema comment: "Stripe
      // supports multiple confirmation attempts against the same PI").
      //
      // Recording the attempt is unconditional here (not gated behind
      // Payment's current status) — a stale/out-of-order delivery of this
      // event for an already-CAPTURED/CANCELLED/REFUNDED Payment still
      // represents a real attempt that genuinely happened at some point;
      // recordPaymentAttemptBestEffort's own sourceStripeEventId idempotency
      // already prevents any duplicate row regardless of delivery order.
      // Only the Payment.status mutation below needs the guard, so a stale
      // event can never regress an already-resolved Payment.
      await recordPaymentAttemptBestEffort({
        paymentId: payment.id,
        stripePaymentIntentId: pi.id,
        status: "FAILED",
        failureCode: pi.last_payment_error?.code ?? pi.last_payment_error?.decline_code ?? null,
        failureMessage: pi.last_payment_error?.message ?? null,
        sourceStripeEventId: event.id,
      });

      // Reflect Stripe's *current* retriable state locally — never a
      // terminal one. Payment.status must never become FAILED merely
      // because one attempt was declined; PaymentAttempt (above) is the
      // durable record of that. Any pi.status other than these two is
      // unexpected for this event — left untouched rather than guessed.
      if (pi.status === "requires_action") {
        await db.payment.updateMany({
          where: { id: payment.id, status: { in: ["PENDING", "REQUIRES_ACTION"] } },
          data: { status: "REQUIRES_ACTION" },
        });
      } else if (pi.status === "requires_payment_method") {
        await db.payment.updateMany({
          where: { id: payment.id, status: { in: ["PENDING", "REQUIRES_ACTION"] } },
          data: { status: "PENDING" },
        });
      }
      return;
    }
    case "payment_intent.canceled": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const payment = await resolvePaymentFromStripePaymentIntent(pi);
      if (!payment) return;

      // Phase-aware, same reasoning as payment_intent.payment_failed above
      // — checked via the actual relationship (does a PENDING_PAYMENT
      // Booking exist), not a single Payment.status snapshot, so a
      // partially-converged local state can't fall through the cracks. A
      // cancelled PaymentIntent discovered post-Step-A is functionally
      // identical to a failed capture: the authorization is gone and the
      // reserved slot must be released, so it reuses the exact same shared
      // convergence function rather than a second, divergent code path
      // that would otherwise leave the Booking/quotes/request permanently
      // stuck (the bug this fix addresses).
      const booking = payment.bookingId ? await db.booking.findUnique({ where: { id: payment.bookingId } }) : null;
      if (booking && booking.status === "PENDING_PAYMENT") {
        await convergeToCaptureFailed(payment.id);
        return;
      }

      // Pre-booking/authorization-phase cancellation — no slot was ever
      // reserved, so there is nothing to release; a plain terminal status
      // flip is sufficient. Safe even if reached for an already-resolved
      // Payment (CAPTURED, CAPTURE_FAILED, etc.) — the WHERE guard below
      // only ever matches a genuinely still-open Payment.
      await db.payment.updateMany({
        where: { id: payment.id, status: { in: ["PENDING", "REQUIRES_ACTION", "AUTHORIZED"] } },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
      return;
    }
    case "refund.created":
    case "refund.updated":
    case "refund.failed": {
      // Phase H.8 (§P, amended §AM) — the primary refund-convergence
      // mechanism. The event payload IS the Stripe.Refund object itself,
      // complete with its own metadata — no need to reach for it through
      // an expanded Charge.refunds list. observedStripeRefundId is passed
      // so resolveRefundOutcomeAndConverge can validate it against durable
      // accounted/current attempt state before ever treating it as truth —
      // a delayed webhook for a superseded (accounted) attempt is inert,
      // never capable of rolling the logical Refund backwards.
      const stripeRefund = event.data.object as Stripe.Refund;
      const refundId = stripeRefund.metadata?.refundId;
      if (!refundId) return; // not a FutureTutor-originated refund (e.g. a Dashboard-created one) — nothing to converge
      await resolveRefundOutcomeAndConverge(refundId, { observedStripeRefundId: stripeRefund.id });
      return;
    }
    case "charge.refunded": {
      // Safety net for a refund created directly in the Stripe dashboard
      // (bypassing FutureTutor's own refund flow, which already updates
      // local state synchronously) — reconciles if Stripe's
      // authoritative refunded amount disagrees with the local record.
      const charge = event.data.object as Stripe.Charge;
      const piId = getPaymentIntentId(charge.payment_intent);
      if (!piId) return;
      const payment = await db.payment.findUnique({ where: { stripePaymentIntentId: piId } });
      if (!payment || charge.amount_refunded <= payment.refundedAmountCents) return;
      await db.payment.update({
        where: { id: payment.id },
        data: {
          refundedAmountCents: charge.amount_refunded,
          status: charge.amount_refunded >= payment.amountCents ? "REFUNDED" : "PARTIALLY_REFUNDED",
        },
      });
      return;
    }
    case "charge.updated": {
      // Defensive fallback for Stripe fee/charge-linkage reconciliation
      // (Phase G.1) — in practice, balance_transaction has been observed
      // available synchronously right after capture for this integration's
      // manual-capture PaymentIntents, so convergeToCaptured already
      // resolves it opportunistically at capture time; this handler exists
      // for the genuine cases where it's attached to the Charge later.
      // Narrowly scoped: only enriches stripeChargeId/stripeBalanceTransactionId/
      // stripeFeeCents, never touches Booking/payment lifecycle state.
      const charge = event.data.object as Stripe.Charge;
      const piId = getPaymentIntentId(charge.payment_intent);
      if (!piId) return;
      const payment = await db.payment.findUnique({ where: { stripePaymentIntentId: piId } });
      if (!payment) return;
      if (payment.stripeChargeId && payment.stripeBalanceTransactionId) return; // already fully enriched
      await reconcileStripeFinancialDetails(payment.id);
      return;
    }
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      await syncTutorConnectStatusFromAccount(account);
      return;
    }
    case "charge.dispute.created": {
      const dispute = event.data.object as Stripe.Dispute;
      const piId = getPaymentIntentId(dispute.payment_intent);
      if (!piId) return;
      const payment = await db.payment.findUnique({ where: { stripePaymentIntentId: piId } });
      if (!payment) return;
      await db.payment.update({ where: { id: payment.id }, data: { disputeStatus: "OPEN" } });
      await writeAuditLog({
        actorUserId: null,
        action: "stripe.dispute.created",
        entityType: "Payment",
        entityId: payment.id,
      });
      const admins = await db.user.findMany({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } }, select: { id: true } });
      for (const admin of admins) {
        await notifyUser(db, {
          userId: admin.id,
          type: "stripe.dispute.created",
          title: "Payment disputed",
          body: "A customer has disputed a payment — review required.",
          metadata: { paymentId: payment.id },
        });
      }
      return;
    }
    case "charge.dispute.closed": {
      const dispute = event.data.object as Stripe.Dispute;
      const piId = getPaymentIntentId(dispute.payment_intent);
      if (!piId) return;
      const payment = await db.payment.findUnique({ where: { stripePaymentIntentId: piId } });
      if (!payment) return;
      await db.payment.update({
        where: { id: payment.id },
        data: { disputeStatus: dispute.status === "won" ? "WON" : "LOST" },
      });
      await writeAuditLog({
        actorUserId: null,
        action: "stripe.dispute.closed",
        entityType: "Payment",
        entityId: payment.id,
        metadata: { outcome: dispute.status },
      });
      return;
    }
    default:
      return; // an event type we don't subscribe to acting on
  }
}

/** Called from the reconciliation sweep — resets events stuck PROCESSING
 * because the claiming process crashed mid-handling, back to FAILED, so a
 * future delivery or sweep can reclaim them via the same guarded
 * updateMany in processStripeWebhookEvent above. */
export async function reclaimStaleProcessingWebhookEvents(): Promise<number> {
  const threshold = new Date(Date.now() - STALE_PROCESSING_THRESHOLD_MS);
  const result = await db.stripeWebhookEvent.updateMany({
    where: { processingStatus: "PROCESSING", lastAttemptAt: { lt: threshold } },
    data: { processingStatus: "FAILED", error: "Reclaimed after stale PROCESSING state" },
  });
  return result.count;
}
