import { describe, it, expect } from "vitest";
import { decidePaymentTransferSafety, isPaymentTransferSafe, type PaymentTransferSafetyFacts } from "./paymentSafety";

// FINANCIAL-TRANSFER-SAFETY-GATES1 — pure, zero-I/O unit tests for the
// authoritative transfer-safety decision function, mirroring
// tutorEarningConvergence.test.ts's own style for decideTutorEarningConvergence
// exactly. No database, no transactions, no mocks: decidePaymentTransferSafety
// takes primitive Payment/Refund facts and returns a primitive decision, so
// every branch of the policy can be exercised directly.

function facts(overrides: Partial<PaymentTransferSafetyFacts> = {}): PaymentTransferSafetyFacts {
  return {
    paymentStatus: "CAPTURED",
    disputeStatus: null,
    refundedAmountCents: 0,
    hasPendingRefund: false,
    ...overrides,
  };
}

describe("decidePaymentTransferSafety — Phase 6 scenario A: fully safe, unrefunded, undisputed CAPTURED payment", () => {
  it("CAPTURED, refundedAmountCents=0, no dispute, no pending refund -> SAFE", () => {
    expect(decidePaymentTransferSafety(facts())).toEqual({ status: "SAFE" });
    expect(isPaymentTransferSafe(decidePaymentTransferSafety(facts()))).toBe(true);
  });
});

describe("decidePaymentTransferSafety — Phase 6 scenario B: partial refund", () => {
  it("PARTIALLY_REFUNDED status -> BLOCKED, regardless of amount", () => {
    const result = decidePaymentTransferSafety(facts({ paymentStatus: "PARTIALLY_REFUNDED", refundedAmountCents: 500 }));
    expect(result).toEqual({ status: "BLOCKED", reason: "PAYMENT_PARTIALLY_REFUNDED" });
    expect(isPaymentTransferSafe(result)).toBe(false);
  });

  it("CAPTURED status but refundedAmountCents > 0 (defense-in-depth, should be unreachable in practice) -> BLOCKED", () => {
    const result = decidePaymentTransferSafety(facts({ paymentStatus: "CAPTURED", refundedAmountCents: 1 }));
    expect(result).toEqual({ status: "BLOCKED", reason: "REFUNDED_AMOUNT_NONZERO" });
  });
});

describe("decidePaymentTransferSafety — Phase 6 scenario C: full refund", () => {
  it("REFUNDED status -> BLOCKED", () => {
    const result = decidePaymentTransferSafety(facts({ paymentStatus: "REFUNDED", refundedAmountCents: 3200 }));
    expect(result).toEqual({ status: "BLOCKED", reason: "PAYMENT_REFUNDED" });
  });
});

describe("decidePaymentTransferSafety — Phase 6 scenario F: refund settlement ambiguous", () => {
  it("a PENDING Refund exists even though Payment.status/refundedAmountCents still look clean -> UNKNOWN (fail closed)", () => {
    const result = decidePaymentTransferSafety(facts({ hasPendingRefund: true }));
    expect(result).toEqual({ status: "UNKNOWN", reason: "REFUND_PENDING_RECONCILIATION" });
    expect(isPaymentTransferSafe(result)).toBe(false);
  });
});

describe("decidePaymentTransferSafety — Phase 7: dispute scenarios", () => {
  it("no dispute (disputeStatus null) -> SAFE (all else equal)", () => {
    expect(decidePaymentTransferSafety(facts({ disputeStatus: null }))).toEqual({ status: "SAFE" });
  });

  it("OPEN dispute -> BLOCKED", () => {
    const result = decidePaymentTransferSafety(facts({ disputeStatus: "OPEN" }));
    expect(result).toEqual({ status: "BLOCKED", reason: "DISPUTE_OPEN" });
  });

  it("LOST dispute -> BLOCKED (funds clawed back)", () => {
    const result = decidePaymentTransferSafety(facts({ disputeStatus: "LOST" }));
    expect(result).toEqual({ status: "BLOCKED", reason: "DISPUTE_LOST" });
  });

  it("WON dispute -> SAFE (resolved favorably, funds remain settled — a historical dispute does not forever block payment)", () => {
    const result = decidePaymentTransferSafety(facts({ disputeStatus: "WON" }));
    expect(result).toEqual({ status: "SAFE" });
    expect(isPaymentTransferSafe(result)).toBe(true);
  });
});

describe("decidePaymentTransferSafety — non-CAPTURED payment statuses never assumed safe", () => {
  for (const status of ["PENDING", "REQUIRES_ACTION", "AUTHORIZED", "CAPTURE_FAILED", "FAILED", "CANCELLED"] as const) {
    it(`${status} -> UNKNOWN (fail closed, never guessed)`, () => {
      const result = decidePaymentTransferSafety(facts({ paymentStatus: status }));
      expect(result).toEqual({ status: "UNKNOWN", reason: `PAYMENT_STATUS_NOT_CAPTURED:${status}` });
      expect(isPaymentTransferSafe(result)).toBe(false);
    });
  }
});

describe("decidePaymentTransferSafety — Phase 8: combined conditions", () => {
  it("refund AND dispute together -> BLOCKED (refund check wins, still correctly blocked either way)", () => {
    const result = decidePaymentTransferSafety(facts({ paymentStatus: "REFUNDED", refundedAmountCents: 3200, disputeStatus: "OPEN" }));
    expect(result.status).toBe("BLOCKED");
  });

  it("dispute LOST with a refund also recorded -> BLOCKED", () => {
    const result = decidePaymentTransferSafety(facts({ paymentStatus: "PARTIALLY_REFUNDED", refundedAmountCents: 1000, disputeStatus: "LOST" }));
    expect(result.status).toBe("BLOCKED");
  });

  it("WON dispute with a pending refund -> UNKNOWN (pending refund still gates even though the dispute itself is resolved favorably)", () => {
    const result = decidePaymentTransferSafety(facts({ disputeStatus: "WON", hasPendingRefund: true }));
    expect(result).toEqual({ status: "UNKNOWN", reason: "REFUND_PENDING_RECONCILIATION" });
  });
});

describe("isPaymentTransferSafe — only SAFE is ever true", () => {
  it("BLOCKED and UNKNOWN are both false", () => {
    expect(isPaymentTransferSafe({ status: "BLOCKED", reason: "x" })).toBe(false);
    expect(isPaymentTransferSafe({ status: "UNKNOWN", reason: "x" })).toBe(false);
    expect(isPaymentTransferSafe({ status: "SAFE" })).toBe(true);
  });
});
