import "server-only";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getStripeClient } from "@/lib/stripe";
import { paymentsAreLive } from "@/lib/paymentMode";
import { writeAuditLog } from "@/lib/audit";
import { notifyUser } from "@/lib/notify";
import { resolveCaptureOutcomeAndConverge, cancelAuthorizedPayment } from "@/services/payments";

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

  let transfer = await db.tutorTransfer.findUnique({ where: { tutorEarningId: earningId } });
  if (!transfer) {
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
  }
  if (transfer.status === "COMPLETED") return;

  if (!paymentsAreLive()) {
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
  if (!paymentsAreLive()) return;
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
}
