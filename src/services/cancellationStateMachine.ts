import "server-only";
import type { BookingStatus, PaymentStatus } from "@/generated/prisma/enums";

/**
 * Phase H.8 — pure decision function answering "what should a legitimate
 * cancellation of THIS booking/payment combination do," per
 * FutureTutor_H8_Implementation_Plan.md §H's Booking x Payment state
 * matrix. No I/O, no Prisma — cancellationPolicy.ts's orchestration calls
 * this to decide WHAT to do, then does it, separating the (100%
 * unit-testable) decision from the (integration-tested) execution. This is
 * the concrete answer to "do not simply patch individual if-statements;
 * plan the cancellation operation as a state-aware workflow."
 */

export type CancellationStripeAction = "none" | "cancel_authorization" | "refund";
export type CancellationEarningAction = "none" | "void_if_no_transfer";
export type CancellationSessionAction = "none" | "cancel_if_scheduled";
export type CancellationQuickMatchAction = "none" | "close_if_booked";

export interface CancellationOutcomeDecision {
  stripeAction: CancellationStripeAction;
  refundRequired: boolean;
  earningAction: CancellationEarningAction;
  sessionAction: CancellationSessionAction;
  quickMatchAction: CancellationQuickMatchAction;
}

export interface DecideCancellationOutcomeInput {
  bookingStatusBeforeCancellation: BookingStatus;
  paymentStatus: PaymentStatus | null;
  hasStripePaymentIntentId: boolean;
  isTutorCancelling: boolean;
  /** 0 for NO_REFUND, 1 for FULL_REFUND, 0.5 for PARTIAL_REFUND, or the
   * tutor-100% remaining-amount case (also refundPercent semantics of 1,
   * but computed from remaining-cents, not the tier — this function only
   * needs to know refundRequired, the exact cents are the caller's job). */
  refundCents: number;
}

/**
 * Every row of §H's matrix that is reachable per current H.8 scope (D-marked
 * "unreachable" rows — DECLINED/COMPLETED/NO_SHOW/RESCHEDULED/booking-level
 * REFUNDED, PaymentStatus.FAILED — are simply never passed in, since no
 * writer produces them anywhere in the codebase; this function still
 * degrades safely (stripeAction: "none", earning/session/quickMatch
 * untouched) if one ever were).
 */
export function decideCancellationOutcome(input: DecideCancellationOutcomeInput): CancellationOutcomeDecision {
  const { paymentStatus, hasStripePaymentIntentId, refundCents } = input;

  let stripeAction: CancellationStripeAction = "none";
  if (paymentStatus === "PENDING" || paymentStatus === "REQUIRES_ACTION" || paymentStatus === "AUTHORIZED") {
    // Release the hold regardless of whether a Stripe object exists yet —
    // cancelAuthorizedPayment itself branches on hasStripePaymentIntentId
    // to decide local-only convergence vs. a real Stripe call (§K, review
    // category 9); this decision function only needs to say "an
    // authorization-side action is owed," not how it's carried out.
    stripeAction = "cancel_authorization";
  } else if (paymentStatus === "CAPTURED") {
    stripeAction = refundCents > 0 ? "refund" : "none";
  }
  // paymentStatus null, CANCELLED, CAPTURE_FAILED, PARTIALLY_REFUNDED,
  // REFUNDED, FAILED: no action from this Phase — either nothing was ever
  // authorized, or the payment side is already terminal/handled elsewhere
  // (convergeToCaptureFailed already cancels its own booking; a booking
  // cannot be cancelled twice — see cancellationPolicy.ts's guarded
  // updateMany).

  void hasStripePaymentIntentId; // documented above — not itself branched on here

  return {
    stripeAction,
    refundRequired: stripeAction === "refund" && refundCents > 0,
    earningAction: "void_if_no_transfer",
    sessionAction: "cancel_if_scheduled",
    quickMatchAction: "close_if_booked",
  };
}
