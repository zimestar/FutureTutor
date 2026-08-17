import { describe, it, expect } from "vitest";
import Stripe from "stripe";
import { decideCancellationOutcome } from "./cancellationStateMachine";
import { calculateCancellationRefund } from "./cancellationPolicy";
import {
  mapStripeRefundStatus,
  mapStripePiStatusToAuthorizationOutcome,
  isRefundObligationSatisfied,
  deriveRecoveryIdempotencyKey,
  mapRefundedAmountToPaymentState,
  classifyStripeRefundCreateFailure,
} from "./payments";

const HOUR = 60 * 60 * 1000;

describe("calculateCancellationRefund (pure, boundary cases — §AD.A)", () => {
  const base = new Date("2026-01-10T12:00:00.000Z");

  it("1. exactly 48h -> 100%", () => {
    expect(calculateCancellationRefund(new Date(base.getTime() + 48 * HOUR), base, 10000).tier).toBe("FULL_REFUND");
  });
  it("2. 48h + 1ms -> 100%", () => {
    expect(calculateCancellationRefund(new Date(base.getTime() + 48 * HOUR + 1), base, 10000).tier).toBe(
      "FULL_REFUND"
    );
  });
  it("3. 48h - 1ms -> 50%", () => {
    expect(calculateCancellationRefund(new Date(base.getTime() + 48 * HOUR - 1), base, 10000).tier).toBe(
      "PARTIAL_REFUND"
    );
  });
  it("4. exactly 24h -> 50%", () => {
    expect(calculateCancellationRefund(new Date(base.getTime() + 24 * HOUR), base, 10000).tier).toBe(
      "PARTIAL_REFUND"
    );
  });
  it("5. 24h + 1ms -> 50%", () => {
    expect(calculateCancellationRefund(new Date(base.getTime() + 24 * HOUR + 1), base, 10000).tier).toBe(
      "PARTIAL_REFUND"
    );
  });
  it("6. 24h - 1ms -> 0%", () => {
    expect(calculateCancellationRefund(new Date(base.getTime() + 24 * HOUR - 1), base, 10000).tier).toBe(
      "NO_REFUND"
    );
  });
  it("7. exactly at startAt (0ms remaining) -> 0%", () => {
    expect(calculateCancellationRefund(base, base, 10000).tier).toBe("NO_REFUND");
  });
  it("8. past startAt (negative msUntilSession) -> 0%, no crash", () => {
    const past = new Date(base.getTime() - HOUR);
    expect(calculateCancellationRefund(past, base, 10000)).toEqual({
      tier: "NO_REFUND",
      refundPercent: 0,
      refundCents: 0,
    });
  });
  it("9. rounding: odd amountCents at 50% tier rounds exactly", () => {
    const result = calculateCancellationRefund(new Date(base.getTime() + 25 * HOUR), base, 4999);
    expect(result.refundCents).toBe(2500); // Math.round(2499.5) === 2500
  });
  it("10. amountCents = 0 -> 0 at every tier", () => {
    expect(calculateCancellationRefund(new Date(base.getTime() + 48 * HOUR), base, 0).refundCents).toBe(0);
    expect(calculateCancellationRefund(new Date(base.getTime() + 25 * HOUR), base, 0).refundCents).toBe(0);
    expect(calculateCancellationRefund(base, base, 0).refundCents).toBe(0);
  });
});

describe("mapStripeRefundStatus (pure — §AD.C)", () => {
  it("20. succeeded -> succeeded", () => expect(mapStripeRefundStatus("succeeded")).toBe("succeeded"));
  it("21. pending -> pending", () => expect(mapStripeRefundStatus("pending")).toBe("pending"));
  it("22. failed -> failed", () => expect(mapStripeRefundStatus("failed")).toBe("failed"));
  it("23. canceled -> failed", () => expect(mapStripeRefundStatus("canceled")).toBe("failed"));
  it("requires_action / unknown -> uncertain", () => expect(mapStripeRefundStatus("requires_action")).toBe("uncertain"));
});

describe("mapStripePiStatusToAuthorizationOutcome (pure — §AD.E)", () => {
  it("25. succeeded -> captured (never cancelled — late-won capture)", () =>
    expect(mapStripePiStatusToAuthorizationOutcome("succeeded")).toBe("captured"));
  it("26. canceled -> cancelled", () => expect(mapStripePiStatusToAuthorizationOutcome("canceled")).toBe("cancelled"));
  it("27. requires_capture -> still_capturable (never cancelled — the core §K bug)", () =>
    expect(mapStripePiStatusToAuthorizationOutcome("requires_capture")).toBe("still_capturable"));
  it("28a. requires_action -> still_capturable", () =>
    expect(mapStripePiStatusToAuthorizationOutcome("requires_action")).toBe("still_capturable"));
  it("28b. requires_confirmation -> still_capturable", () =>
    expect(mapStripePiStatusToAuthorizationOutcome("requires_confirmation")).toBe("still_capturable"));
  it("28c. requires_payment_method -> still_capturable", () =>
    expect(mapStripePiStatusToAuthorizationOutcome("requires_payment_method")).toBe("still_capturable"));
  it("processing/unknown -> uncertain", () => expect(mapStripePiStatusToAuthorizationOutcome("processing")).toBe("uncertain"));
});

describe("mapRefundedAmountToPaymentState (pure — Phase H.8.1 §8/§19)", () => {
  it("no successful refunds -> settledRefundedCents=0, CAPTURED", () => {
    expect(
      mapRefundedAmountToPaymentState({ amountCents: 10400, currentStatus: "CAPTURED", successfulRefundAmounts: [] })
    ).toEqual({ settledRefundedCents: 0, nextStatus: "CAPTURED" });
  });

  it("0 < settledRefundedCents < amountCents -> PARTIALLY_REFUNDED", () => {
    expect(
      mapRefundedAmountToPaymentState({ amountCents: 10400, currentStatus: "CAPTURED", successfulRefundAmounts: [5200] })
    ).toEqual({ settledRefundedCents: 5200, nextStatus: "PARTIALLY_REFUNDED" });
  });

  it("settledRefundedCents === amountCents -> REFUNDED", () => {
    expect(
      mapRefundedAmountToPaymentState({ amountCents: 10400, currentStatus: "PARTIALLY_REFUNDED", successfulRefundAmounts: [10400] })
    ).toEqual({ settledRefundedCents: 10400, nextStatus: "REFUNDED" });
  });

  it("settledRefundedCents > amountCents (defensive, should not occur via runRefundBranch's clamp) -> REFUNDED", () => {
    expect(
      mapRefundedAmountToPaymentState({ amountCents: 10400, currentStatus: "PARTIALLY_REFUNDED", successfulRefundAmounts: [10400, 100] })
    ).toEqual({ settledRefundedCents: 10500, nextStatus: "REFUNDED" });
  });

  it("currentStatus not in {CAPTURED, PARTIALLY_REFUNDED, REFUNDED} -> null (no mapping, skip write)", () => {
    expect(mapRefundedAmountToPaymentState({ amountCents: 10400, currentStatus: "PENDING", successfulRefundAmounts: [10400] })).toBeNull();
    expect(mapRefundedAmountToPaymentState({ amountCents: 10400, currentStatus: "AUTHORIZED", successfulRefundAmounts: [] })).toBeNull();
    expect(mapRefundedAmountToPaymentState({ amountCents: 10400, currentStatus: "CANCELLED", successfulRefundAmounts: [] })).toBeNull();
  });

  it("multiple SUCCEEDED Refund rows (forward-compatibility, §6) -> summed correctly", () => {
    expect(
      mapRefundedAmountToPaymentState({ amountCents: 10400, currentStatus: "CAPTURED", successfulRefundAmounts: [5200, 5200] })
    ).toEqual({ settledRefundedCents: 10400, nextStatus: "REFUNDED" });
  });

  it("a FAILED/cycled attempt's amount is never counted — only SUCCEEDED amounts are passed in at all (R1 fail -> R2 fail -> R3 succeed lands on exactly R3's amount)", () => {
    // The caller (derivePaymentRefundState) only ever passes amounts for
    // rows CURRENTLY status=SUCCEEDED — a FAILED historical attempt's
    // amount is excluded before this function ever sees it, which is
    // exactly what makes R1/R2's amounts never double-count once R3
    // succeeds (§6's worked example).
    expect(
      mapRefundedAmountToPaymentState({ amountCents: 10400, currentStatus: "CAPTURED", successfulRefundAmounts: [10400] })
    ).toEqual({ settledRefundedCents: 10400, nextStatus: "REFUNDED" });
  });
});

describe("decideCancellationOutcome (pure — §AD.F, §H matrix rows)", () => {
  it("30. no payment row -> no stripe action, no refund", () => {
    expect(
      decideCancellationOutcome({
        bookingStatusBeforeCancellation: "PENDING_PAYMENT",
        paymentStatus: null,
        hasStripePaymentIntentId: false,
        isTutorCancelling: false,
        refundCents: 0,
      })
    ).toEqual({
      stripeAction: "none",
      refundRequired: false,
      earningAction: "void_if_no_transfer",
      sessionAction: "cancel_if_scheduled",
      quickMatchAction: "close_if_booked",
    });
  });

  it("31. PENDING/no stripePaymentIntentId -> cancel_authorization, no refund", () => {
    const outcome = decideCancellationOutcome({
      bookingStatusBeforeCancellation: "PENDING_PAYMENT",
      paymentStatus: "PENDING",
      hasStripePaymentIntentId: false,
      isTutorCancelling: false,
      refundCents: 0,
    });
    expect(outcome.stripeAction).toBe("cancel_authorization");
    expect(outcome.refundRequired).toBe(false);
  });

  it("32. AUTHORIZED with stripePaymentIntentId -> cancel_authorization", () => {
    const outcome = decideCancellationOutcome({
      bookingStatusBeforeCancellation: "PENDING_PAYMENT",
      paymentStatus: "AUTHORIZED",
      hasStripePaymentIntentId: true,
      isTutorCancelling: false,
      refundCents: 0,
    });
    expect(outcome.stripeAction).toBe("cancel_authorization");
  });

  it("33. REQUIRES_ACTION -> cancel_authorization", () => {
    expect(
      decideCancellationOutcome({
        bookingStatusBeforeCancellation: "PENDING_PAYMENT",
        paymentStatus: "REQUIRES_ACTION",
        hasStripePaymentIntentId: true,
        isTutorCancelling: false,
        refundCents: 0,
      }).stripeAction
    ).toBe("cancel_authorization");
  });

  it("34. CAPTURED, refundCents > 0 -> refund, refundRequired true", () => {
    const outcome = decideCancellationOutcome({
      bookingStatusBeforeCancellation: "CONFIRMED",
      paymentStatus: "CAPTURED",
      hasStripePaymentIntentId: true,
      isTutorCancelling: false,
      refundCents: 5000,
    });
    expect(outcome.stripeAction).toBe("refund");
    expect(outcome.refundRequired).toBe(true);
  });

  it("35. CAPTURED, refundCents === 0 (NO_REFUND tier) -> no stripe action, no refund", () => {
    const outcome = decideCancellationOutcome({
      bookingStatusBeforeCancellation: "CONFIRMED",
      paymentStatus: "CAPTURED",
      hasStripePaymentIntentId: true,
      isTutorCancelling: false,
      refundCents: 0,
    });
    expect(outcome.stripeAction).toBe("none");
    expect(outcome.refundRequired).toBe(false);
  });

  it("36. tutor cancelling, CAPTURED, full remaining amount -> refund", () => {
    const outcome = decideCancellationOutcome({
      bookingStatusBeforeCancellation: "CONFIRMED",
      paymentStatus: "CAPTURED",
      hasStripePaymentIntentId: true,
      isTutorCancelling: true,
      refundCents: 10000,
    });
    expect(outcome.stripeAction).toBe("refund");
  });

  it("37. CAPTURE_FAILED -> no stripe action from this phase (already handled by convergeToCaptureFailed)", () => {
    expect(
      decideCancellationOutcome({
        bookingStatusBeforeCancellation: "PENDING_PAYMENT",
        paymentStatus: "CAPTURE_FAILED",
        hasStripePaymentIntentId: true,
        isTutorCancelling: false,
        refundCents: 0,
      }).stripeAction
    ).toBe("none");
  });

  it("38. CANCELLED payment -> no stripe action (already terminal)", () => {
    expect(
      decideCancellationOutcome({
        bookingStatusBeforeCancellation: "PENDING_PAYMENT",
        paymentStatus: "CANCELLED",
        hasStripePaymentIntentId: true,
        isTutorCancelling: false,
        refundCents: 0,
      }).stripeAction
    ).toBe("none");
  });

  it("39. PARTIALLY_REFUNDED -> no stripe action from this phase (already converged)", () => {
    expect(
      decideCancellationOutcome({
        bookingStatusBeforeCancellation: "CONFIRMED",
        paymentStatus: "PARTIALLY_REFUNDED",
        hasStripePaymentIntentId: true,
        isTutorCancelling: false,
        refundCents: 0,
      }).stripeAction
    ).toBe("none");
  });

  it("40. REFUNDED -> no stripe action", () => {
    expect(
      decideCancellationOutcome({
        bookingStatusBeforeCancellation: "CONFIRMED",
        paymentStatus: "REFUNDED",
        hasStripePaymentIntentId: true,
        isTutorCancelling: false,
        refundCents: 0,
      }).stripeAction
    ).toBe("none");
  });

  it("41-45. earning/session/quickMatch actions are always the standard cancellation-consequence set, regardless of payment branch", () => {
    for (const paymentStatus of ["PENDING", "AUTHORIZED", "CAPTURED", "CANCELLED", null] as const) {
      const outcome = decideCancellationOutcome({
        bookingStatusBeforeCancellation: "CONFIRMED",
        paymentStatus,
        hasStripePaymentIntentId: true,
        isTutorCancelling: false,
        refundCents: 0,
      });
      expect(outcome.earningAction).toBe("void_if_no_transfer");
      expect(outcome.sessionAction).toBe("cancel_if_scheduled");
      expect(outcome.quickMatchAction).toBe("close_if_booked");
    }
  });
});

describe("isRefundObligationSatisfied (pure — §AD.G, §Q)", () => {
  it("46a. refundedAmountCents < owedCents -> false", () => {
    expect(isRefundObligationSatisfied(10000, { refundedAmountCents: 5000 })).toBe(false);
  });
  it("46b. refundedAmountCents === owedCents -> true", () => {
    expect(isRefundObligationSatisfied(10000, { refundedAmountCents: 10000 })).toBe(true);
  });
  it("46c. refundedAmountCents > owedCents -> true, does not crash", () => {
    expect(isRefundObligationSatisfied(10000, { refundedAmountCents: 15000 })).toBe(true);
  });
  it("47. NO_REFUND tier (owed 0) -> trivially satisfied", () => {
    expect(isRefundObligationSatisfied(0, { refundedAmountCents: 0 })).toBe(true);
  });
});

describe("deriveRecoveryIdempotencyKey (pure — §AD.G, §M)", () => {
  it("48a. differs from the original key for any non-empty previousFailedStripeRefundId", () => {
    const key = deriveRecoveryIdempotencyKey("refund_abc", "re_original_failed_id");
    expect(key).not.toBe("refund:refund_abc");
    expect(key).toBe("refund:refund_abc:retry-after:re_original_failed_id");
  });
  it("48b. deterministic — same inputs always produce the same key", () => {
    const key1 = deriveRecoveryIdempotencyKey("refund_abc", "re_1");
    const key2 = deriveRecoveryIdempotencyKey("refund_abc", "re_1");
    expect(key1).toBe(key2);
  });
  it("48c. a second generation's key (derived from re_2) differs from the first (derived from re_1)", () => {
    const gen1 = deriveRecoveryIdempotencyKey("refund_abc", "re_1");
    const gen2 = deriveRecoveryIdempotencyKey("refund_abc", "re_2");
    expect(gen1).not.toBe(gen2);
  });
});

describe("classifyStripeRefundCreateFailure (pure — Phase H.8.2, grounded in the REAL installed Stripe SDK error classes)", () => {
  it("49a. StripeInvalidRequestError, statusCode 400 -> DEFINITIVE, structured fields captured (rawType/code/requestId, never the message)", () => {
    const error = new Stripe.errors.StripeInvalidRequestError({
      message: "A previous attempt to refund charge ch_test to card card_test failed",
      type: "invalid_request_error",
      statusCode: 400,
      code: "charge_already_refunded",
      requestId: "req_test_definitive",
    });
    const result = classifyStripeRefundCreateFailure(error);
    expect(result.definitive).toBe(true);
    expect(result.type).toBe("invalid_request_error"); // rawType, NOT the SDK class name
    expect(result.code).toBe("charge_already_refunded");
    expect(result.requestId).toBe("req_test_definitive");
  });

  it("49b. StripeInvalidRequestError, statusCode 404 -> still DEFINITIVE (generateV1Error's own 400/404 range)", () => {
    const error = new Stripe.errors.StripeInvalidRequestError({
      message: "No such refund",
      type: "invalid_request_error",
      statusCode: 404,
      code: "resource_missing",
    });
    expect(classifyStripeRefundCreateFailure(error).definitive).toBe(true);
  });

  it("49c. StripeConnectionError (no response ever received — timeout/ECONNRESET) -> AMBIGUOUS", () => {
    const error = new Stripe.errors.StripeConnectionError({ message: "connect ETIMEDOUT" });
    const result = classifyStripeRefundCreateFailure(error);
    expect(result.definitive).toBe(false);
    expect(result.type).toBeNull();
  });

  it("49d. StripeAPIError (5xx — Stripe's own processing state is genuinely unknown) -> AMBIGUOUS", () => {
    const error = new Stripe.errors.StripeAPIError({ message: "internal error", statusCode: 500 });
    expect(classifyStripeRefundCreateFailure(error).definitive).toBe(false);
  });

  it("49e. StripeRateLimitError -> AMBIGUOUS (never treated as proof nothing was created)", () => {
    const error = new Stripe.errors.StripeRateLimitError({ message: "too many requests", statusCode: 429 });
    expect(classifyStripeRefundCreateFailure(error).definitive).toBe(false);
  });

  it("49f. StripeAuthenticationError -> AMBIGUOUS", () => {
    const error = new Stripe.errors.StripeAuthenticationError({ message: "bad key", statusCode: 401 });
    expect(classifyStripeRefundCreateFailure(error).definitive).toBe(false);
  });

  it("49g. a plain non-Stripe Error (e.g. a local bug) -> AMBIGUOUS, fails closed", () => {
    expect(classifyStripeRefundCreateFailure(new Error("something else entirely")).definitive).toBe(false);
  });

  it("49h. a thrown non-Error value -> AMBIGUOUS, fails closed, never throws itself", () => {
    expect(() => classifyStripeRefundCreateFailure("a string, not even an Error")).not.toThrow();
    expect(classifyStripeRefundCreateFailure("a string, not even an Error").definitive).toBe(false);
  });

  it("49i. never string-matches on .message — a StripeAPIError whose message happens to mention 'invalid' is still AMBIGUOUS", () => {
    const error = new Stripe.errors.StripeAPIError({ message: "invalid internal state, please retry", statusCode: 500 });
    expect(classifyStripeRefundCreateFailure(error).definitive).toBe(false);
  });
});
