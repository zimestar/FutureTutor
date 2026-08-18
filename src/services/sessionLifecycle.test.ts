import { describe, it, expect } from "vitest";
import { computeCheckInEligibility, CHECK_IN_WINDOW_MS_BEFORE_START, CHECK_IN_WINDOW_MINUTES_BEFORE_START } from "./sessionLifecycle";

const startAt = new Date("2026-08-20T18:00:00.000Z");

function input(overrides: Partial<Parameters<typeof computeCheckInEligibility>[0]> = {}) {
  return {
    bookingStatus: "CONFIRMED",
    bookingStartAt: startAt,
    sessionStatus: "SCHEDULED" as const,
    now: startAt,
    ...overrides,
  };
}

describe("computeCheckInEligibility (pure)", () => {
  it("Booking not CONFIRMED -> BOOKING_NOT_CONFIRMED, checked before session-state/window", () => {
    expect(computeCheckInEligibility(input({ bookingStatus: "CANCELLED" }))).toBe("BOOKING_NOT_CONFIRMED");
    expect(computeCheckInEligibility(input({ bookingStatus: "PENDING_PAYMENT" }))).toBe("BOOKING_NOT_CONFIRMED");
  });

  it("Session CANCELLED -> SESSION_NOT_IN_ELIGIBLE_STATE (cancelled Session rejects check-in)", () => {
    expect(computeCheckInEligibility(input({ sessionStatus: "CANCELLED" }))).toBe("SESSION_NOT_IN_ELIGIBLE_STATE");
  });

  it("Session COMPLETED/NO_SHOW/INTERRUPTED -> SESSION_NOT_IN_ELIGIBLE_STATE (terminal outcomes reject check-in)", () => {
    expect(computeCheckInEligibility(input({ sessionStatus: "COMPLETED" }))).toBe("SESSION_NOT_IN_ELIGIBLE_STATE");
    expect(computeCheckInEligibility(input({ sessionStatus: "NO_SHOW" }))).toBe("SESSION_NOT_IN_ELIGIBLE_STATE");
    expect(computeCheckInEligibility(input({ sessionStatus: "INTERRUPTED" }))).toBe("SESSION_NOT_IN_ELIGIBLE_STATE");
  });

  it("Session SCHEDULED at/after the check-in window opens -> eligible (null)", () => {
    const windowOpensAt = new Date(startAt.getTime() - CHECK_IN_WINDOW_MS_BEFORE_START);
    expect(computeCheckInEligibility(input({ now: windowOpensAt }))).toBeNull();
    expect(computeCheckInEligibility(input({ now: startAt }))).toBeNull();
  });

  it("Session IN_PROGRESS -> eligible (repeat/reconnect check-ins remain evidence-legal)", () => {
    expect(computeCheckInEligibility(input({ sessionStatus: "IN_PROGRESS", now: startAt }))).toBeNull();
  });

  it("Exactly 1ms before the check-in window opens -> TOO_EARLY (exact boundary, no dual-branch instant)", () => {
    const oneMsBeforeWindow = new Date(startAt.getTime() - CHECK_IN_WINDOW_MS_BEFORE_START - 1);
    expect(computeCheckInEligibility(input({ now: oneMsBeforeWindow }))).toBe("TOO_EARLY");
  });

  it("Days before startAt -> TOO_EARLY (no unlimited early check-in)", () => {
    const daysEarly = new Date(startAt.getTime() - 3 * 24 * 60 * 60 * 1000);
    expect(computeCheckInEligibility(input({ now: daysEarly }))).toBe("TOO_EARLY");
  });

  it("Long after startAt (late arrival) -> still eligible; Phase 2 makes no no-show decision", () => {
    const hoursLate = new Date(startAt.getTime() + 3 * 60 * 60 * 1000);
    expect(computeCheckInEligibility(input({ now: hoursLate }))).toBeNull();
  });

  it("The documented V1 window is exactly 15 minutes", () => {
    expect(CHECK_IN_WINDOW_MINUTES_BEFORE_START).toBe(15);
    expect(CHECK_IN_WINDOW_MS_BEFORE_START).toBe(15 * 60 * 1000);
  });
});
