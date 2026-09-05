import { describe, expect, it } from "vitest";
import { mapPaymentStatus, toPaymentHistoryDto } from "./paymentHistoryPresentation";

const BASE_ROW = {
  id: "pay-1",
  amountCents: 10000,
  currency: "CAD",
  refundedAmountCents: 0,
  status: "CAPTURED" as const,
  capturedAt: new Date("2026-09-01T12:00:00.000Z"),
  createdAt: new Date("2026-08-30T12:00:00.000Z"),
  booking: {
    id: "booking-1",
    subjectSlug: "math",
    academicLevelSlug: "high-school",
    tutorFirstName: "Taylor",
    mode: "ONLINE" as const,
    startAt: new Date("2026-09-05T18:00:00.000Z"),
    endAt: new Date("2026-09-05T19:00:00.000Z"),
    timezone: "America/Toronto",
  },
  refunds: [],
};

describe("mapPaymentStatus", () => {
  it("maps only CAPTURED/PARTIALLY_REFUNDED/REFUNDED to a customer-facing status", () => {
    expect(mapPaymentStatus("CAPTURED")).toBe("PAID");
    expect(mapPaymentStatus("PARTIALLY_REFUNDED")).toBe("PARTIALLY_REFUNDED");
    expect(mapPaymentStatus("REFUNDED")).toBe("REFUNDED");
  });

  it("returns null for every non-captured status — a customer never sees a failed/pending/cancelled attempt as a paid line item", () => {
    expect(mapPaymentStatus("PENDING")).toBeNull();
    expect(mapPaymentStatus("REQUIRES_ACTION")).toBeNull();
    expect(mapPaymentStatus("AUTHORIZED")).toBeNull();
    expect(mapPaymentStatus("FAILED")).toBeNull();
    expect(mapPaymentStatus("CANCELLED")).toBeNull();
    expect(mapPaymentStatus("CAPTURE_FAILED")).toBeNull();
  });
});

describe("toPaymentHistoryDto", () => {
  it("a captured payment with a booking maps to a full DTO", () => {
    const dto = toPaymentHistoryDto(BASE_ROW);
    expect(dto).not.toBeNull();
    expect(dto!.status).toBe("PAID");
    expect(dto!.amountCents).toBe(10000);
    expect(dto!.netAmountCents).toBe(10000);
    expect(dto!.booking?.id).toBe("booking-1");
    expect(dto!.paidAt).toBe("2026-09-01T12:00:00.000Z");
  });

  it("a non-captured-family status is defensively excluded, returning null rather than a misleading row", () => {
    expect(toPaymentHistoryDto({ ...BASE_ROW, status: "FAILED" })).toBeNull();
    expect(toPaymentHistoryDto({ ...BASE_ROW, status: "PENDING" })).toBeNull();
  });

  it("refundedAmountCents/netAmountCents come from the Payment row's own authoritative fields, never re-summed from refunds[]", () => {
    const dto = toPaymentHistoryDto({
      ...BASE_ROW,
      status: "PARTIALLY_REFUNDED",
      refundedAmountCents: 3000,
      refunds: [
        { id: "r1", amountCents: 1000, currency: "CAD", status: "SUCCEEDED", createdAt: new Date("2026-09-02T00:00:00.000Z") },
        { id: "r2", amountCents: 2000, currency: "CAD", status: "SUCCEEDED", createdAt: new Date("2026-09-03T00:00:00.000Z") },
      ],
    });
    expect(dto!.refundedAmountCents).toBe(3000);
    expect(dto!.netAmountCents).toBe(7000);
    expect(dto!.refunds).toHaveLength(2);
    expect(dto!.refunds[0]!.id).toBe("r1");
  });

  it("a payment with no linked Booking (bookingId nullable in schema) renders safely with booking: null, never throws", () => {
    const dto = toPaymentHistoryDto({ ...BASE_ROW, booking: null });
    expect(dto).not.toBeNull();
    expect(dto!.booking).toBeNull();
  });

  it("falls back to createdAt only if capturedAt is unexpectedly null, never silently producing an epoch date", () => {
    const dto = toPaymentHistoryDto({ ...BASE_ROW, capturedAt: null });
    expect(dto!.paidAt).toBe("2026-08-30T12:00:00.000Z");
  });

  it("never exposes a raw Stripe field or tutor-payout data on the DTO", () => {
    const dto = toPaymentHistoryDto(BASE_ROW)!;
    const serialized = JSON.stringify(dto);
    for (const forbidden of [
      "stripePaymentIntentId",
      "stripeChargeId",
      "stripeBalanceTransactionId",
      "stripeCustomerId",
      "stripeFeeCents",
      "disputeStatus",
      "tutorPayoutCents",
      "payerUserId",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
