import { describe, it, expect } from "vitest";
import { describeCancellationConsequence } from "./cancellationPolicy";

// CANCELLATION-CONFIRM1 — this mission adds a confirmation dialog around
// the existing cancellation button; it does not touch
// describeCancellationConsequence or calculateCancellationRefund at all.
// These tests exist because the dialog now surfaces this exact string
// prominently (previously it was small print next to the button) and no
// test previously covered it directly — closing that gap, not changing
// the function.

const HOUR = 60 * 60 * 1000;
const START = new Date("2026-01-10T12:00:00.000Z");

describe("describeCancellationConsequence", () => {
  it("item 9 — full-refund tier (>=48h out) is described correctly for a payer", () => {
    const now = new Date(START.getTime() - 49 * HOUR);
    const text = describeCancellationConsequence({
      isTutorViewer: false,
      paymentStatus: "CAPTURED",
      sessionStartAt: START,
      now,
      amountCents: 3200,
      currency: "CAD",
    });
    expect(text).toContain("Full refund");
    expect(text).toContain("32.00");
  });

  it("item 10 — partial-refund tier (24h-48h out) is described correctly for a payer", () => {
    const now = new Date(START.getTime() - 30 * HOUR);
    const text = describeCancellationConsequence({
      isTutorViewer: false,
      paymentStatus: "CAPTURED",
      sessionStartAt: START,
      now,
      amountCents: 3200,
      currency: "CAD",
    });
    expect(text).toContain("50% refund");
    expect(text).toContain("16.00");
  });

  it("item 8 — zero-refund tier (<24h out) is described correctly for a payer, and never claims a refund", () => {
    const now = new Date(START.getTime() - 1 * HOUR);
    const text = describeCancellationConsequence({
      isTutorViewer: false,
      paymentStatus: "CAPTURED",
      sessionStartAt: START,
      now,
      amountCents: 3200,
      currency: "CAD",
    });
    expect(text).toContain("No refund");
    expect(text.toLowerCase()).not.toContain("full refund");
  });

  it("a not-yet-captured payment (PENDING/REQUIRES_ACTION/AUTHORIZED) is described as a no-charge cancellation, regardless of tier math", () => {
    const now = new Date(START.getTime() - 1 * HOUR); // would otherwise be NO_REFUND tier
    const text = describeCancellationConsequence({
      isTutorViewer: false,
      paymentStatus: "AUTHORIZED",
      sessionStartAt: START,
      now,
      amountCents: 3200,
      currency: "CAD",
    });
    expect(text.toLowerCase()).toContain("no charge was ever completed");
  });

  it("item 11 — tutor viewer never sees payer-refund-flavored copy ('your refund')", () => {
    const text = describeCancellationConsequence({
      isTutorViewer: true,
      paymentStatus: null,
      sessionStartAt: START,
      now: new Date(START.getTime() - 1 * HOUR),
      amountCents: 0,
      currency: "CAD",
    });
    expect(text.toLowerCase()).not.toContain("your refund");
    expect(text.toLowerCase()).not.toContain("you will be refunded");
    expect(text).toContain("the customer");
  });
});
