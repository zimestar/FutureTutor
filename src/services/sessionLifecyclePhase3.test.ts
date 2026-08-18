import { describe, it, expect } from "vitest";
import {
  decideNoShowOutcome,
  computeNoShowGraceDeadline,
  NO_SHOW_GRACE_PERIOD_MINUTES_AFTER_START,
  NO_SHOW_GRACE_PERIOD_MS_AFTER_START,
} from "./sessionLifecycle";

// Session Lifecycle Phase 3 — pure, zero-I/O unit tests for the no-show
// convergence decision function, mirroring sessionLifecycle.test.ts's own
// style for computeCheckInEligibility exactly. No database, no
// transactions, no mocks: decideNoShowOutcome takes primitive inputs and
// returns a primitive output, so every boundary can be exercised directly.

const startAt = new Date("2026-08-20T18:00:00.000Z");
const graceDeadlineAt = new Date(startAt.getTime() + NO_SHOW_GRACE_PERIOD_MS_AFTER_START);

function input(overrides: Partial<Parameters<typeof decideNoShowOutcome>[0]> = {}) {
  return {
    bookingStatus: "CONFIRMED",
    sessionStatus: "SCHEDULED" as const,
    bookingStartAt: startAt,
    tutorHasCheckedIn: false,
    studentHasCheckedIn: false,
    now: graceDeadlineAt,
    ...overrides,
  };
}

describe("computeNoShowGraceDeadline (pure)", () => {
  it("is exactly Booking.startAt + 15 minutes", () => {
    expect(computeNoShowGraceDeadline(startAt).getTime()).toBe(startAt.getTime() + 15 * 60 * 1000);
  });

  it("the ratified V1 grace period is exactly 15 minutes", () => {
    expect(NO_SHOW_GRACE_PERIOD_MINUTES_AFTER_START).toBe(15);
    expect(NO_SHOW_GRACE_PERIOD_MS_AFTER_START).toBe(15 * 60 * 1000);
  });
});

describe("decideNoShowOutcome (pure) — applicability gates", () => {
  it("Booking not CONFIRMED -> NOT_APPLICABLE, regardless of time/presence", () => {
    expect(decideNoShowOutcome(input({ bookingStatus: "CANCELLED" }))).toBe("NOT_APPLICABLE");
    expect(decideNoShowOutcome(input({ bookingStatus: "PENDING_PAYMENT" }))).toBe("NOT_APPLICABLE");
  });

  it("Session_ already IN_PROGRESS -> NOT_APPLICABLE (no-show is only ever SCHEDULED -> NO_SHOW, never a transition out of IN_PROGRESS)", () => {
    expect(decideNoShowOutcome(input({ sessionStatus: "IN_PROGRESS" }))).toBe("NOT_APPLICABLE");
  });

  it("Session_ already terminal (COMPLETED/NO_SHOW/CANCELLED/INTERRUPTED) -> NOT_APPLICABLE", () => {
    expect(decideNoShowOutcome(input({ sessionStatus: "COMPLETED" }))).toBe("NOT_APPLICABLE");
    expect(decideNoShowOutcome(input({ sessionStatus: "NO_SHOW" }))).toBe("NOT_APPLICABLE");
    expect(decideNoShowOutcome(input({ sessionStatus: "CANCELLED" }))).toBe("NOT_APPLICABLE");
    expect(decideNoShowOutcome(input({ sessionStatus: "INTERRUPTED" }))).toBe("NOT_APPLICABLE");
  });
});

describe("decideNoShowOutcome (pure) — T+15 boundary (§5 of the Phase 3 task)", () => {
  it("1ms before T+15 -> NOT_YET_DUE, regardless of presence", () => {
    const oneMsBefore = new Date(graceDeadlineAt.getTime() - 1);
    expect(decideNoShowOutcome(input({ now: oneMsBefore }))).toBe("NOT_YET_DUE");
    expect(decideNoShowOutcome(input({ now: oneMsBefore, tutorHasCheckedIn: true }))).toBe("NOT_YET_DUE");
  });

  it("exactly T+15 -> eligible for convergence (inclusive boundary, no dual-branch instant)", () => {
    expect(decideNoShowOutcome(input({ now: graceDeadlineAt, tutorHasCheckedIn: true, studentHasCheckedIn: false }))).toBe(
      "STUDENT_NO_SHOW"
    );
  });

  it("well after T+15 -> still eligible for convergence", () => {
    const hoursLate = new Date(graceDeadlineAt.getTime() + 3 * 60 * 60 * 1000);
    expect(decideNoShowOutcome(input({ now: hoursLate, tutorHasCheckedIn: true, studentHasCheckedIn: false }))).toBe(
      "STUDENT_NO_SHOW"
    );
  });

  it("well before startAt (long before T+15) -> NOT_YET_DUE", () => {
    const daysEarly = new Date(startAt.getTime() - 3 * 24 * 60 * 60 * 1000);
    expect(decideNoShowOutcome(input({ now: daysEarly }))).toBe("NOT_YET_DUE");
  });
});

describe("decideNoShowOutcome (pure) — presence permutations at/after T+15 (§3 A/B/C/D of the Phase 3 task)", () => {
  it("A) Tutor checked in, Student did not -> STUDENT_NO_SHOW", () => {
    expect(decideNoShowOutcome(input({ tutorHasCheckedIn: true, studentHasCheckedIn: false }))).toBe("STUDENT_NO_SHOW");
  });

  it("B) Student checked in, Tutor did not -> TUTOR_NO_SHOW", () => {
    expect(decideNoShowOutcome(input({ tutorHasCheckedIn: false, studentHasCheckedIn: true }))).toBe("TUTOR_NO_SHOW");
  });

  it("C) Neither checked in -> NO_SHOW_UNRESOLVED (bilateral absence, no auto-blame; represented by plain Session_.status = NO_SHOW, not a new enum value)", () => {
    expect(decideNoShowOutcome(input({ tutorHasCheckedIn: false, studentHasCheckedIn: false }))).toBe("NO_SHOW_UNRESOLVED");
  });

  it("D) Both checked in -> NO_TRANSITION_DUAL_PRESENT (should already be IN_PROGRESS elsewhere; convergence never fires a no-show here)", () => {
    expect(decideNoShowOutcome(input({ tutorHasCheckedIn: true, studentHasCheckedIn: true }))).toBe(
      "NO_TRANSITION_DUAL_PRESENT"
    );
  });
});
