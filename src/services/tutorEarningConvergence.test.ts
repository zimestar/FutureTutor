import { describe, it, expect } from "vitest";
import {
  decideTutorEarningConvergence,
  isSessionEligibleForPayment,
  TUTOR_EARNING_FINANCIAL_DELAY_MS,
  type TutorEarningConvergenceDecisionInput,
} from "./tutorEarningConvergence";

// Phase 5B — pure, zero-I/O unit tests for the financial convergence
// decision function, mirroring sessionLifecyclePhase3.test.ts's own style
// for decideNoShowOutcome exactly. No database, no transactions, no mocks:
// decideTutorEarningConvergence takes primitive Session-truth facts and
// returns a primitive decision, so every branch of the task §3 policy table
// can be exercised directly.

const completedAt = new Date("2026-08-20T19:00:00.000Z");
const noShowConvergedAt = new Date("2026-08-20T18:15:00.000Z");

function input(overrides: Partial<TutorEarningConvergenceDecisionInput> = {}): TutorEarningConvergenceDecisionInput {
  return {
    sessionStatus: "SCHEDULED",
    completedAt: null,
    noShowConvergedAt: null,
    noShowOutcome: null,
    ...overrides,
  };
}

describe("TUTOR_EARNING_FINANCIAL_DELAY_MS", () => {
  it("is exactly 24 hours — unchanged in magnitude from the pre-Phase-5B rule", () => {
    expect(TUTOR_EARNING_FINANCIAL_DELAY_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe("decideTutorEarningConvergence (pure) — task §3A/§3B: SCHEDULED / IN_PROGRESS never due", () => {
  it("SCHEDULED -> NOT_DUE, regardless of any other fact", () => {
    expect(decideTutorEarningConvergence(input({ sessionStatus: "SCHEDULED" }))).toEqual({ kind: "NOT_DUE" });
  });

  it("IN_PROGRESS -> NOT_DUE", () => {
    expect(decideTutorEarningConvergence(input({ sessionStatus: "IN_PROGRESS" }))).toEqual({ kind: "NOT_DUE" });
  });
});

describe("decideTutorEarningConvergence (pure) — task §3C: COMPLETED", () => {
  it("COMPLETED with a completedAt -> ELIGIBLE_AT_VIA_COMPLETION, anchored to completedAt + 24h (never Booking.endAt)", () => {
    const decision = decideTutorEarningConvergence(input({ sessionStatus: "COMPLETED", completedAt }));
    expect(decision.kind).toBe("ELIGIBLE_AT_VIA_COMPLETION");
    if (decision.kind === "ELIGIBLE_AT_VIA_COMPLETION") {
      expect(decision.eligibleAt.getTime()).toBe(completedAt.getTime() + TUTOR_EARNING_FINANCIAL_DELAY_MS);
    }
  });

  it("COMPLETED without a completedAt (defensive — should never occur in practice) -> INCONSISTENT_SESSION_FACTS, never guessed", () => {
    expect(decideTutorEarningConvergence(input({ sessionStatus: "COMPLETED", completedAt: null }))).toEqual({
      kind: "INCONSISTENT_SESSION_FACTS",
    });
  });
});

describe("decideTutorEarningConvergence (pure) — task §3D: STUDENT_NO_SHOW preserves normal earning after the existing delay", () => {
  it("NO_SHOW + STUDENT_NO_SHOW -> ELIGIBLE_AT_VIA_STUDENT_NO_SHOW, anchored to noShowConvergedAt + 24h", () => {
    const decision = decideTutorEarningConvergence(
      input({ sessionStatus: "NO_SHOW", noShowOutcome: "STUDENT_NO_SHOW", noShowConvergedAt })
    );
    expect(decision.kind).toBe("ELIGIBLE_AT_VIA_STUDENT_NO_SHOW");
    if (decision.kind === "ELIGIBLE_AT_VIA_STUDENT_NO_SHOW") {
      expect(decision.eligibleAt.getTime()).toBe(noShowConvergedAt.getTime() + TUTOR_EARNING_FINANCIAL_DELAY_MS);
    }
  });

  it("NO_SHOW + STUDENT_NO_SHOW without a noShowConvergedAt (defensive) -> INCONSISTENT_SESSION_FACTS", () => {
    expect(
      decideTutorEarningConvergence(input({ sessionStatus: "NO_SHOW", noShowOutcome: "STUDENT_NO_SHOW", noShowConvergedAt: null }))
    ).toEqual({ kind: "INCONSISTENT_SESSION_FACTS" });
  });
});

describe("decideTutorEarningConvergence (pure) — task §3E: TUTOR_NO_SHOW never payable from time alone", () => {
  it("NO_SHOW + TUTOR_NO_SHOW -> HOLD_TUTOR_NO_SHOW", () => {
    expect(decideTutorEarningConvergence(input({ sessionStatus: "NO_SHOW", noShowOutcome: "TUTOR_NO_SHOW" }))).toEqual({
      kind: "HOLD_TUTOR_NO_SHOW",
    });
  });
});

describe("decideTutorEarningConvergence (pure) — task §3F: NO_SHOW_UNRESOLVED never decides refund liability", () => {
  it("NO_SHOW + NO_SHOW_UNRESOLVED -> HOLD_NO_SHOW_UNRESOLVED", () => {
    expect(decideTutorEarningConvergence(input({ sessionStatus: "NO_SHOW", noShowOutcome: "NO_SHOW_UNRESOLVED" }))).toEqual({
      kind: "HOLD_NO_SHOW_UNRESOLVED",
    });
  });

  it("NO_SHOW with a null noShowOutcome (defensive — reconstruction failed to classify) -> INCONSISTENT_SESSION_FACTS, never guessed", () => {
    expect(decideTutorEarningConvergence(input({ sessionStatus: "NO_SHOW", noShowOutcome: null }))).toEqual({
      kind: "INCONSISTENT_SESSION_FACTS",
    });
  });
});

describe("decideTutorEarningConvergence (pure) — task §3G: INTERRUPTED never auto-paid, never prorated", () => {
  it("INTERRUPTED -> HOLD_INTERRUPTED, independent of completedAt/noShowConvergedAt", () => {
    expect(decideTutorEarningConvergence(input({ sessionStatus: "INTERRUPTED" }))).toEqual({ kind: "HOLD_INTERRUPTED" });
  });
});

describe("decideTutorEarningConvergence (pure) — task §8: CANCELLED firewall", () => {
  it("CANCELLED -> CANCELLED_FIREWALL (never a financial decision of its own — H.8 already owns this earning)", () => {
    expect(decideTutorEarningConvergence(input({ sessionStatus: "CANCELLED" }))).toEqual({ kind: "CANCELLED_FIREWALL" });
  });
});

describe("isSessionEligibleForPayment (pure) — task §9/§7 shared predicate", () => {
  it("COMPLETED -> true", () => {
    expect(isSessionEligibleForPayment({ sessionStatus: "COMPLETED", noShowOutcome: null })).toBe(true);
  });

  it("NO_SHOW + STUDENT_NO_SHOW -> true", () => {
    expect(isSessionEligibleForPayment({ sessionStatus: "NO_SHOW", noShowOutcome: "STUDENT_NO_SHOW" })).toBe(true);
  });

  it("NO_SHOW + TUTOR_NO_SHOW -> false", () => {
    expect(isSessionEligibleForPayment({ sessionStatus: "NO_SHOW", noShowOutcome: "TUTOR_NO_SHOW" })).toBe(false);
  });

  it("NO_SHOW + NO_SHOW_UNRESOLVED -> false", () => {
    expect(isSessionEligibleForPayment({ sessionStatus: "NO_SHOW", noShowOutcome: "NO_SHOW_UNRESOLVED" })).toBe(false);
  });

  it("SCHEDULED / IN_PROGRESS / INTERRUPTED / CANCELLED -> false", () => {
    expect(isSessionEligibleForPayment({ sessionStatus: "SCHEDULED", noShowOutcome: null })).toBe(false);
    expect(isSessionEligibleForPayment({ sessionStatus: "IN_PROGRESS", noShowOutcome: null })).toBe(false);
    expect(isSessionEligibleForPayment({ sessionStatus: "INTERRUPTED", noShowOutcome: null })).toBe(false);
    expect(isSessionEligibleForPayment({ sessionStatus: "CANCELLED", noShowOutcome: null })).toBe(false);
  });
});
