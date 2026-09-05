import { describe, expect, it } from "vitest";
import { classifyTutorEarningForAdmin } from "./adminFinancialOpsPresentation";
import type { TutorEarningSessionFacts } from "./tutorEarningPresentation";

const NOW = new Date("2026-09-12T00:00:00.000Z");
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

describe("classifyTutorEarningForAdmin", () => {
  it("item 7 — a session not yet completed classifies as pending session outcome", () => {
    const session: TutorEarningSessionFacts = { sessionStatus: "SCHEDULED", completedAt: null, noShowConvergedAt: null, noShowOutcome: null };
    const result = classifyTutorEarningForAdmin({ status: "PENDING_ELIGIBLE", eligibleAt: null }, session, null, NOW);
    expect(result.key).toBe("pendingSessionOutcome");
    expect(result.eligibilityDate).toBeNull();
  });

  it("item 8 — a completed session still inside its 24h delay classifies as waiting24h, projected", () => {
    const completedAt = new Date(NOW.getTime() - 1 * 60 * 60 * 1000); // 1h ago
    const session: TutorEarningSessionFacts = { sessionStatus: "COMPLETED", completedAt, noShowConvergedAt: null, noShowOutcome: null };
    const result = classifyTutorEarningForAdmin({ status: "PENDING_ELIGIBLE", eligibleAt: null }, session, null, NOW);
    expect(result.key).toBe("waiting24h");
    expect(result.delayAnchor).toBe("completion");
    expect(result.eligibilityDateIsExpected).toBe(true);
    expect(result.eligibilityDate?.getTime()).toBe(completedAt.getTime() + TWENTY_FOUR_HOURS_MS);
  });

  it("item 9 — the critical case: 24h has elapsed since completion but eligibleAt is still null => awaiting convergence, never fabricated as eligible", () => {
    const completedAt = new Date(NOW.getTime() - 30 * 60 * 60 * 1000); // 30h ago — past the 24h delay
    const session: TutorEarningSessionFacts = { sessionStatus: "COMPLETED", completedAt, noShowConvergedAt: null, noShowOutcome: null };
    const result = classifyTutorEarningForAdmin({ status: "PENDING_ELIGIBLE", eligibleAt: null }, session, null, NOW);
    expect(result.key).toBe("awaitingConvergence");
    expect(result.eligibilityDateIsExpected).toBe(true);
    expect(result.eligibilityDate?.getTime()).toBe(completedAt.getTime() + TWENTY_FOUR_HOURS_MS);
  });

  it("a real persisted eligibleAt already past now, with the earning still PENDING_ELIGIBLE, is ALSO awaiting convergence (the promotion sweep hasn't run) — and is NOT relabeled as expected", () => {
    const eligibleAt = new Date(NOW.getTime() - 60 * 60 * 1000); // persisted, 1h in the past
    const result = classifyTutorEarningForAdmin({ status: "PENDING_ELIGIBLE", eligibleAt }, null, null, NOW);
    expect(result.key).toBe("awaitingConvergence");
    expect(result.eligibilityDateIsExpected).toBe(false);
    expect(result.eligibilityDate).toEqual(eligibleAt);
  });

  it("a real persisted eligibleAt still in the future is waiting24h, not awaiting convergence", () => {
    const eligibleAt = new Date(NOW.getTime() + 60 * 60 * 1000);
    const result = classifyTutorEarningForAdmin({ status: "PENDING_ELIGIBLE", eligibleAt }, null, null, NOW);
    expect(result.key).toBe("waiting24h");
    expect(result.eligibilityDateIsExpected).toBe(false);
  });

  it("item 10 — a confirmed student no-show anchors expected eligibility to noShowConvergedAt, not completedAt", () => {
    const noShowConvergedAt = new Date(NOW.getTime() - 1 * 60 * 60 * 1000);
    const session: TutorEarningSessionFacts = { sessionStatus: "NO_SHOW", completedAt: null, noShowConvergedAt, noShowOutcome: "STUDENT_NO_SHOW" };
    const result = classifyTutorEarningForAdmin({ status: "PENDING_ELIGIBLE", eligibleAt: null }, session, null, NOW);
    expect(result.delayAnchor).toBe("studentNoShow");
    expect(result.eligibilityDate?.getTime()).toBe(noShowConvergedAt.getTime() + TWENTY_FOUR_HOURS_MS);
  });

  it("item 11 — a persisted eligibleAt is rendered as non-expected regardless of session facts", () => {
    const eligibleAt = new Date("2026-09-20T00:00:00.000Z");
    const result = classifyTutorEarningForAdmin({ status: "PENDING_ELIGIBLE", eligibleAt }, null, null, NOW);
    expect(result.eligibilityDateIsExpected).toBe(false);
    expect(result.eligibilityDate).toEqual(eligibleAt);
  });

  it("item 12 — ELIGIBLE earning classifies as eligible with no date", () => {
    const result = classifyTutorEarningForAdmin({ status: "ELIGIBLE", eligibleAt: new Date() }, null, null, NOW);
    expect(result.key).toBe("eligible");
  });

  it("item 12/13 — HELD with a tutor no-show session gets that specific reason", () => {
    const session: TutorEarningSessionFacts = { sessionStatus: "NO_SHOW", completedAt: null, noShowConvergedAt: null, noShowOutcome: "TUTOR_NO_SHOW" };
    const result = classifyTutorEarningForAdmin({ status: "HELD", eligibleAt: null }, session, null, NOW);
    expect(result.key).toBe("heldTutorNoShow");
  });

  it("item 13 — HELD with an unresolved no-show gets that specific reason", () => {
    const session: TutorEarningSessionFacts = { sessionStatus: "NO_SHOW", completedAt: null, noShowConvergedAt: null, noShowOutcome: "NO_SHOW_UNRESOLVED" };
    const result = classifyTutorEarningForAdmin({ status: "HELD", eligibleAt: null }, session, null, NOW);
    expect(result.key).toBe("heldNoShowUnresolved");
  });

  it("item 14 — HELD with an interrupted session gets that specific reason", () => {
    const session: TutorEarningSessionFacts = { sessionStatus: "INTERRUPTED", completedAt: null, noShowConvergedAt: null, noShowOutcome: null };
    const result = classifyTutorEarningForAdmin({ status: "HELD", eligibleAt: null }, session, null, NOW);
    expect(result.key).toBe("heldInterrupted");
  });

  it("item 15 — HELD with no determinable session facts falls back to an honest generic reason, never a guess", () => {
    const result = classifyTutorEarningForAdmin({ status: "HELD", eligibleAt: null }, null, null, NOW);
    expect(result.key).toBe("heldUnknown");
  });

  it("item 16 — no TutorTransfer row at all is handled safely (ELIGIBLE stays eligible, not transferPending)", () => {
    const result = classifyTutorEarningForAdmin({ status: "ELIGIBLE", eligibleAt: new Date() }, null, null, NOW);
    expect(result.key).toBe("eligible");
    expect(result.transferDate).toBeNull();
  });

  it("item 17 — a PENDING TutorTransfer classifies as transfer pending", () => {
    const result = classifyTutorEarningForAdmin({ status: "ELIGIBLE", eligibleAt: new Date() }, null, { status: "PENDING", completedAt: null }, NOW);
    expect(result.key).toBe("transferPending");
  });

  it("item 18 — a COMPLETED TutorTransfer classifies as transferred with its real completedAt date", () => {
    const completedAt = new Date("2026-09-11T09:00:00.000Z");
    const result = classifyTutorEarningForAdmin({ status: "TRANSFERRED", eligibleAt: null }, null, { status: "COMPLETED", completedAt }, NOW);
    expect(result.key).toBe("transferred");
    expect(result.transferDate).toEqual(completedAt);
  });

  it("item 19 — a FAILED TutorTransfer classifies as transfer failed, distinct from held/eligible", () => {
    const result = classifyTutorEarningForAdmin({ status: "ELIGIBLE", eligibleAt: new Date() }, null, { status: "FAILED", completedAt: null }, NOW);
    expect(result.key).toBe("transferFailed");
  });

  it("a CANCELLED earning always classifies as cancelled regardless of transfer/session facts", () => {
    const result = classifyTutorEarningForAdmin({ status: "CANCELLED", eligibleAt: null }, null, { status: "PENDING", completedAt: null }, NOW);
    expect(result.key).toBe("cancelled");
  });

  it("is a pure function: identical inputs twice produce identical output", () => {
    const session: TutorEarningSessionFacts = { sessionStatus: "COMPLETED", completedAt: new Date(NOW.getTime() - 10 * 60 * 60 * 1000), noShowConvergedAt: null, noShowOutcome: null };
    const a = classifyTutorEarningForAdmin({ status: "PENDING_ELIGIBLE", eligibleAt: null }, session, null, NOW);
    const b = classifyTutorEarningForAdmin({ status: "PENDING_ELIGIBLE", eligibleAt: null }, session, null, NOW);
    expect(a).toEqual(b);
  });
});
