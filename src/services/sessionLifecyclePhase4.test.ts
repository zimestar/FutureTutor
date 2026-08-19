import { describe, it, expect } from "vitest";
import { decideSessionCompletionOutcome, computeSessionInterruptionEligibility } from "./sessionLifecycle";

// Session Lifecycle Phase 4 — pure, zero-I/O unit tests for the completion
// and interruption decision functions, mirroring sessionLifecyclePhase3.test.ts's
// own style for decideNoShowOutcome exactly. No database, no transactions,
// no mocks: both functions take primitive inputs and return a primitive
// output, so every boundary can be exercised directly.

const endAt = new Date("2026-08-20T19:00:00.000Z");

function completionInput(overrides: Partial<Parameters<typeof decideSessionCompletionOutcome>[0]> = {}) {
  return {
    bookingStatus: "CONFIRMED",
    sessionStatus: "IN_PROGRESS" as const,
    bookingEndAt: endAt,
    now: endAt,
    ...overrides,
  };
}

describe("decideSessionCompletionOutcome (pure) — applicability gates (task §13)", () => {
  it("Booking not CONFIRMED -> NOT_APPLICABLE, regardless of time/status", () => {
    expect(decideSessionCompletionOutcome(completionInput({ bookingStatus: "CANCELLED" }))).toBe("NOT_APPLICABLE");
  });

  it("Session_ not IN_PROGRESS -> NOT_APPLICABLE for every other status (only IN_PROGRESS may ever become COMPLETED)", () => {
    expect(decideSessionCompletionOutcome(completionInput({ sessionStatus: "SCHEDULED" }))).toBe("NOT_APPLICABLE");
    expect(decideSessionCompletionOutcome(completionInput({ sessionStatus: "NO_SHOW" }))).toBe("NOT_APPLICABLE");
    expect(decideSessionCompletionOutcome(completionInput({ sessionStatus: "CANCELLED" }))).toBe("NOT_APPLICABLE");
    expect(decideSessionCompletionOutcome(completionInput({ sessionStatus: "COMPLETED" }))).toBe("NOT_APPLICABLE");
    expect(decideSessionCompletionOutcome(completionInput({ sessionStatus: "INTERRUPTED" }))).toBe("NOT_APPLICABLE");
  });
});

describe("decideSessionCompletionOutcome (pure) — Booking.endAt boundary (task §6)", () => {
  it("1ms before Booking.endAt -> NOT_YET_DUE", () => {
    const oneMsBefore = new Date(endAt.getTime() - 1);
    expect(decideSessionCompletionOutcome(completionInput({ now: oneMsBefore }))).toBe("NOT_YET_DUE");
  });

  it("exactly Booking.endAt -> COMPLETE (inclusive boundary, no dual-branch instant)", () => {
    expect(decideSessionCompletionOutcome(completionInput({ now: endAt }))).toBe("COMPLETE");
  });

  it("well after Booking.endAt (delayed convergence) -> still COMPLETE, deterministic regardless of how late the sweep runs", () => {
    const hoursLate = new Date(endAt.getTime() + 6 * 60 * 60 * 1000);
    expect(decideSessionCompletionOutcome(completionInput({ now: hoursLate }))).toBe("COMPLETE");
  });

  it("session started very late but is still IN_PROGRESS well before its own contractual end -> NOT_YET_DUE (starting late never shortens the contractual window)", () => {
    const stillBeforeEnd = new Date(endAt.getTime() - 5 * 60 * 1000);
    expect(decideSessionCompletionOutcome(completionInput({ now: stillBeforeEnd }))).toBe("NOT_YET_DUE");
  });
});

describe("computeSessionInterruptionEligibility (pure) — the single allowlist gate (task §10/§13)", () => {
  it("IN_PROGRESS -> eligible (null rejection)", () => {
    expect(computeSessionInterruptionEligibility({ sessionStatus: "IN_PROGRESS" })).toBeNull();
  });

  it("every other status -> NOT_IN_PROGRESS, including a duplicate INTERRUPTED request and every terminal state", () => {
    expect(computeSessionInterruptionEligibility({ sessionStatus: "SCHEDULED" })).toBe("NOT_IN_PROGRESS");
    expect(computeSessionInterruptionEligibility({ sessionStatus: "NO_SHOW" })).toBe("NOT_IN_PROGRESS");
    expect(computeSessionInterruptionEligibility({ sessionStatus: "CANCELLED" })).toBe("NOT_IN_PROGRESS");
    expect(computeSessionInterruptionEligibility({ sessionStatus: "COMPLETED" })).toBe("NOT_IN_PROGRESS");
    expect(computeSessionInterruptionEligibility({ sessionStatus: "INTERRUPTED" })).toBe("NOT_IN_PROGRESS");
  });
});
