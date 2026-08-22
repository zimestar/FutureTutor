import { describe, it, expect } from "vitest";
import { shouldAutoFinalizeBooking } from "./bookingAutoFinalize";

describe("shouldAutoFinalizeBooking", () => {
  it("auto-finalizes exactly once when Stripe authorization first succeeds", () => {
    const result = shouldAutoFinalizeBooking({
      useStripe: true,
      authorizedPiId: "pi_123",
      quoteKey: "student1|2026-01-01T00:00:00Z|math|highSchool",
      alreadyFinalizedForKey: null,
    });
    expect(result).toBe(true);
  });

  it("never re-triggers finalization for a selection already finalized (guards double-submit / repeated effect runs)", () => {
    const quoteKey = "student1|2026-01-01T00:00:00Z|math|highSchool";
    const result = shouldAutoFinalizeBooking({
      useStripe: true,
      authorizedPiId: "pi_123",
      quoteKey,
      alreadyFinalizedForKey: quoteKey,
    });
    expect(result).toBe(false);
  });

  it("does nothing before authorization exists", () => {
    const result = shouldAutoFinalizeBooking({
      useStripe: true,
      authorizedPiId: null,
      quoteKey: "student1|2026-01-01T00:00:00Z|math|highSchool",
      alreadyFinalizedForKey: null,
    });
    expect(result).toBe(false);
  });

  it("does nothing without a quote selection", () => {
    const result = shouldAutoFinalizeBooking({
      useStripe: true,
      authorizedPiId: "pi_123",
      quoteKey: null,
      alreadyFinalizedForKey: null,
    });
    expect(result).toBe(false);
  });

  it("never auto-finalizes on the non-Stripe/dev-bypass path (no separate authorization stage exists there)", () => {
    const result = shouldAutoFinalizeBooking({
      useStripe: false,
      authorizedPiId: "pi_123",
      quoteKey: "student1|2026-01-01T00:00:00Z|math|highSchool",
      alreadyFinalizedForKey: null,
    });
    expect(result).toBe(false);
  });

  it("allows a genuinely new selection (different quoteKey) to auto-finalize again after a prior one already did", () => {
    const result = shouldAutoFinalizeBooking({
      useStripe: true,
      authorizedPiId: "pi_456",
      quoteKey: "student1|2026-01-02T00:00:00Z|science|university",
      alreadyFinalizedForKey: "student1|2026-01-01T00:00:00Z|math|highSchool",
    });
    expect(result).toBe(true);
  });
});
