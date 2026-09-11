import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { PaymentStatus, PaymentDisputeStatus } from "@/generated/prisma/enums";

/**
 * FINANCIAL-TRANSFER-SAFETY-GATES1 — the single authoritative predicate for
 * "is this Payment currently safe for a tutor transfer to be authorized or
 * executed against it." Deliberately its own tiny, dependency-light module
 * (no import from payments.ts, which pulls in @/lib/stripe at module scope)
 * so that BOTH call sites — markEligibleEarnings (tutorEarningConvergence.ts,
 * which must stay Stripe-free) and createTransferForEarning
 * (tutorTransfers.ts, the sole Stripe-transfer boundary) — can share exactly
 * one definition without the DB-only convergence path gaining any Stripe
 * reachability. Verified by financialConvergenceStripeReachability.test.ts.
 *
 * Split into a PURE decision function (decidePaymentTransferSafety) and a
 * thin I/O wrapper (assessPaymentSafetyForTutorTransfer), mirroring this
 * codebase's own established pattern for exactly this kind of financial
 * policy (decideTutorEarningConvergence / convergeTutorEarningFromSession in
 * tutorEarningConvergence.ts; mapRefundedAmountToPaymentState /
 * derivePaymentRefundState in payments.ts) — the decision logic is testable
 * with zero database, zero mocks, against primitive facts.
 *
 * FAIL-CLOSED by construction: every branch either affirmatively proves SAFE
 * from real, current, persisted Payment/Refund state, or returns a
 * non-SAFE result. There is no fallback branch that defaults to SAFE.
 *
 * SAFE:    Payment.status === CAPTURED, refundedAmountCents === 0,
 *          disputeStatus is null or WON, and no PENDING Refund exists.
 * BLOCKED: Payment.status is REFUNDED/PARTIALLY_REFUNDED,
 *          refundedAmountCents > 0, or disputeStatus is OPEN or LOST —
 *          each is a definitive, persisted signal that funds are not (or
 *          are no longer) safely the platform's to move.
 * UNKNOWN: no Payment row found for this booking, Payment.status is
 *          anything else (PENDING/REQUIRES_ACTION/AUTHORIZED/
 *          CAPTURE_FAILED/FAILED/CANCELLED — none of which should be
 *          reachable for a booking that already has a TutorEarning, since
 *          TutorEarning is only ever created inside convergeToCaptured's
 *          CAPTURED branch, but this function never assumes that
 *          invariant holds and fails closed if it doesn't), or a Refund
 *          row for this payment is still PENDING (an in-flight refund
 *          attempt whose outcome is not yet known — Payment.status/
 *          refundedAmountCents only reflect SUCCEEDED refunds, per
 *          payments.ts's derivePaymentRefundState, so a PENDING refund is
 *          real ambiguity, not a false alarm).
 *
 * disputeStatus WON is treated as SAFE, not blocking: per actual Stripe
 * semantics, a WON dispute means the platform's chargeback defense
 * succeeded and the disputed funds remain settled with the platform — it
 * is a resolved-favorably state, not an open or unsafe one. OPEN (active,
 * unresolved) and LOST (resolved against the platform, funds clawed back)
 * both block. A historical dispute does not forever block payment — only
 * an unresolved or lost one does.
 */
export type PaymentTransferSafety =
  | { status: "SAFE" }
  | { status: "BLOCKED"; reason: string }
  | { status: "UNKNOWN"; reason: string };

export interface PaymentTransferSafetyFacts {
  paymentStatus: PaymentStatus;
  disputeStatus: PaymentDisputeStatus | null;
  refundedAmountCents: number;
  hasPendingRefund: boolean;
}

/**
 * PURE — no I/O. Takes only the authoritative persisted facts (never a
 * client-claimed value) and returns exactly one permitted result. This is
 * the SOLE place transfer-safety policy is expressed.
 */
export function decidePaymentTransferSafety(facts: PaymentTransferSafetyFacts): PaymentTransferSafety {
  if (facts.paymentStatus === "REFUNDED") return { status: "BLOCKED", reason: "PAYMENT_REFUNDED" };
  if (facts.paymentStatus === "PARTIALLY_REFUNDED") return { status: "BLOCKED", reason: "PAYMENT_PARTIALLY_REFUNDED" };
  if (facts.paymentStatus !== "CAPTURED") {
    return { status: "UNKNOWN", reason: `PAYMENT_STATUS_NOT_CAPTURED:${facts.paymentStatus}` };
  }

  // Defense-in-depth: payments.ts's derivePaymentRefundState always writes
  // status and refundedAmountCents together, atomically, from the same
  // authoritative source — so this should already be unreachable given
  // paymentStatus === CAPTURED above. Checked independently anyway rather
  // than trusting that invariant blindly.
  if (facts.refundedAmountCents > 0) return { status: "BLOCKED", reason: "REFUNDED_AMOUNT_NONZERO" };

  if (facts.disputeStatus === "OPEN") return { status: "BLOCKED", reason: "DISPUTE_OPEN" };
  if (facts.disputeStatus === "LOST") return { status: "BLOCKED", reason: "DISPUTE_LOST" };

  if (facts.hasPendingRefund) return { status: "UNKNOWN", reason: "REFUND_PENDING_RECONCILIATION" };

  return { status: "SAFE" };
}

/**
 * I/O wrapper — reads the authoritative current Payment (by its unique
 * bookingId) plus whether any PENDING Refund exists against it, then
 * delegates the entire decision to the pure function above. Accepts a
 * transaction client so callers already inside a transaction (or wanting a
 * coherent read alongside other work) can pass one; a plain db read is
 * equally valid for callers outside a transaction.
 */
export async function assessPaymentSafetyForTutorTransfer(
  client: Prisma.TransactionClient | typeof db,
  bookingId: string
): Promise<PaymentTransferSafety> {
  const payment = await client.payment.findUnique({
    where: { bookingId },
    select: { id: true, status: true, disputeStatus: true, refundedAmountCents: true },
  });
  if (!payment) return { status: "UNKNOWN", reason: "NO_PAYMENT_FOUND" };

  const pendingRefund = await client.refund.findFirst({
    where: { paymentId: payment.id, status: "PENDING" },
    select: { id: true },
  });

  return decidePaymentTransferSafety({
    paymentStatus: payment.status,
    disputeStatus: payment.disputeStatus,
    refundedAmountCents: payment.refundedAmountCents,
    hasPendingRefund: pendingRefund !== null,
  });
}

// A real type predicate (not just `: boolean`) so callers get automatic
// narrowing on the non-SAFE branch too — e.g. `if (isPaymentTransferSafe(x))
// return; x.reason` type-checks without a redundant manual narrowing check.
export function isPaymentTransferSafe(assessment: PaymentTransferSafety): assessment is Extract<PaymentTransferSafety, { status: "SAFE" }> {
  return assessment.status === "SAFE";
}
