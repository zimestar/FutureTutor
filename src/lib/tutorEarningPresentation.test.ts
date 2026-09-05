import { describe, expect, it } from "vitest";
import { presentTutorEarning, presentTutorEarningTransparency, type TutorEarningSessionFacts } from "./tutorEarningPresentation";

const FUTURE_ELIGIBLE_AT = new Date("2026-09-12T19:03:00.000Z");
const COMPLETED_AT = new Date("2026-09-05T12:00:00.000Z");
const NO_SHOW_CONVERGED_AT = new Date("2026-09-05T13:00:00.000Z");
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

describe("presentTutorEarning (unchanged, still used by /tutor/bookings)", () => {
  it("still maps every status exactly as before — /tutor/bookings must not regress", () => {
    expect(presentTutorEarning("PENDING_ELIGIBLE", null)).toMatchObject({ key: "pendingOutcome", showEligibilityDate: false });
    expect(presentTutorEarning("PENDING_ELIGIBLE", FUTURE_ELIGIBLE_AT)).toMatchObject({ key: "pendingEligibility", showEligibilityDate: true });
    expect(presentTutorEarning("ELIGIBLE", null)).toMatchObject({ key: "eligible" });
    expect(presentTutorEarning("HELD", null)).toMatchObject({ key: "held" });
    expect(presentTutorEarning("TRANSFERRED", null)).toMatchObject({ key: "transferred" });
    expect(presentTutorEarning("CANCELLED", null)).toMatchObject({ key: "cancelled" });
  });
});

describe("presentTutorEarningTransparency", () => {
  it("item 4/11 — a normal completed session still waiting on the sweep: pending outcome, not a persisted date", () => {
    // Session_ has reached SCHEDULED-not-yet-completed — no session facts to project from.
    const result = presentTutorEarningTransparency({ status: "PENDING_ELIGIBLE", eligibleAt: null }, null, null);
    expect(result.key).toBe("pendingOutcome");
    expect(result.eligibilityDate).toBeNull();
    expect(result.eligibilityDateIsExpected).toBe(false);
  });

  it("item 7 — a real persisted eligibleAt is shown as-is, not relabeled as 'expected'", () => {
    const result = presentTutorEarningTransparency({ status: "PENDING_ELIGIBLE", eligibleAt: FUTURE_ELIGIBLE_AT }, null, null);
    expect(result.key).toBe("pendingEligibilityPersisted");
    expect(result.eligibilityDate).toEqual(FUTURE_ELIGIBLE_AT);
    expect(result.eligibilityDateIsExpected).toBe(false);
  });

  it("item 8 — null eligibleAt with a session that has not yet reached a payable outcome is handled honestly (no invented date)", () => {
    const session: TutorEarningSessionFacts = { sessionStatus: "SCHEDULED", completedAt: null, noShowConvergedAt: null, noShowOutcome: null };
    const result = presentTutorEarningTransparency({ status: "PENDING_ELIGIBLE", eligibleAt: null }, session, null);
    expect(result.key).toBe("pendingOutcome");
    expect(result.eligibilityDate).toBeNull();
  });

  it("item 9 — a completed session whose sweep hasn't converged yet gets a clearly-distinguished EXPECTED date, anchored to completedAt + 24h", () => {
    const session: TutorEarningSessionFacts = { sessionStatus: "COMPLETED", completedAt: COMPLETED_AT, noShowConvergedAt: null, noShowOutcome: null };
    const result = presentTutorEarningTransparency({ status: "PENDING_ELIGIBLE", eligibleAt: null }, session, null);
    expect(result.key).toBe("pendingEligibilityExpected");
    expect(result.eligibilityDateIsExpected).toBe(true);
    expect(result.eligibilityDate?.getTime()).toBe(COMPLETED_AT.getTime() + TWENTY_FOUR_HOURS_MS);
  });

  it("item 6 — never anchors the expected date to the booking's scheduled end time, only to the authoritative outcome timestamp", () => {
    const session: TutorEarningSessionFacts = { sessionStatus: "COMPLETED", completedAt: COMPLETED_AT, noShowConvergedAt: null, noShowOutcome: null };
    const result = presentTutorEarningTransparency({ status: "PENDING_ELIGIBLE", eligibleAt: null }, session, null);
    // The only anchor this function ever reads is completedAt/noShowConvergedAt.
    expect(result.eligibilityDate?.getTime()).not.toBe(COMPLETED_AT.getTime());
  });

  it("item 10 — a confirmed student no-show projects its expected date from noShowConvergedAt, not completedAt", () => {
    const session: TutorEarningSessionFacts = {
      sessionStatus: "NO_SHOW",
      completedAt: null,
      noShowConvergedAt: NO_SHOW_CONVERGED_AT,
      noShowOutcome: "STUDENT_NO_SHOW",
    };
    const result = presentTutorEarningTransparency({ status: "PENDING_ELIGIBLE", eligibleAt: null }, session, null);
    expect(result.key).toBe("pendingEligibilityExpected");
    expect(result.eligibilityDate?.getTime()).toBe(NO_SHOW_CONVERGED_AT.getTime() + TWENTY_FOUR_HOURS_MS);
  });

  it("item 12 — an ELIGIBLE earning is reported as eligible, with no eligibility date to show (already past that stage)", () => {
    const result = presentTutorEarningTransparency({ status: "ELIGIBLE", eligibleAt: FUTURE_ELIGIBLE_AT }, null, null);
    expect(result.key).toBe("eligible");
    expect(result.eligibilityDate).toBeNull();
  });

  it("item 13 — a HELD earning with a TUTOR_NO_SHOW session gets that specific reason, not a generic 'on hold'", () => {
    const session: TutorEarningSessionFacts = { sessionStatus: "NO_SHOW", completedAt: null, noShowConvergedAt: null, noShowOutcome: "TUTOR_NO_SHOW" };
    const result = presentTutorEarningTransparency({ status: "HELD", eligibleAt: null }, session, null);
    expect(result.key).toBe("heldTutorNoShow");
  });

  it("a HELD earning with an unresolved no-show gets that specific reason", () => {
    const session: TutorEarningSessionFacts = { sessionStatus: "NO_SHOW", completedAt: null, noShowConvergedAt: null, noShowOutcome: "NO_SHOW_UNRESOLVED" };
    const result = presentTutorEarningTransparency({ status: "HELD", eligibleAt: null }, session, null);
    expect(result.key).toBe("heldNoShowUnresolved");
  });

  it("a HELD earning with an interrupted session gets that specific reason", () => {
    const session: TutorEarningSessionFacts = { sessionStatus: "INTERRUPTED", completedAt: null, noShowConvergedAt: null, noShowOutcome: null };
    const result = presentTutorEarningTransparency({ status: "HELD", eligibleAt: null }, session, null);
    expect(result.key).toBe("heldInterrupted");
  });

  it("a HELD earning with no determinable session facts falls back to a generic, honest reason rather than guessing", () => {
    const result = presentTutorEarningTransparency({ status: "HELD", eligibleAt: null }, null, null);
    expect(result.key).toBe("held");
  });

  it("item 14/15/16 — a TRANSFERRED earning with a completed TutorTransfer shows its real transfer date", () => {
    const transferDate = new Date("2026-09-06T09:00:00.000Z");
    const result = presentTutorEarningTransparency({ status: "TRANSFERRED", eligibleAt: FUTURE_ELIGIBLE_AT }, null, { completedAt: transferDate });
    expect(result.key).toBe("transferred");
    expect(result.transferDate).toEqual(transferDate);
  });

  it("item 13/14 — a TRANSFERRED earning without a loaded transfer relation renders safely with no transfer date, never throwing", () => {
    const result = presentTutorEarningTransparency({ status: "TRANSFERRED", eligibleAt: null }, null, null);
    expect(result.key).toBe("transferred");
    expect(result.transferDate).toBeNull();
  });

  it("a CANCELLED earning is reported as cancelled with no dates", () => {
    const result = presentTutorEarningTransparency({ status: "CANCELLED", eligibleAt: null }, null, null);
    expect(result.key).toBe("cancelled");
    expect(result.eligibilityDate).toBeNull();
    expect(result.transferDate).toBeNull();
  });
});
