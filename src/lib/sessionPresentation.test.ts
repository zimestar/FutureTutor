import { createTranslator } from "use-intl/core";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import {
  deriveSessionArrivalPresentation,
  graceRemainingParts,
  isTerminalNoShowPresentation,
  noShowCopyKind,
  sessionCheckInControls,
  sessionCheckInErrorCode,
  shouldRefreshSessionAfterCheckIn,
  shouldShowSessionCheckIn,
  studentCheckInLabelKind,
} from "./sessionPresentation";

const windowOpen = new Date("2026-08-18T16:45:00Z");
const scheduledStart = new Date("2026-08-18T17:00:00Z");
const graceDeadline = new Date("2026-08-18T17:15:00Z");
const state = (overrides: Partial<Parameters<typeof deriveSessionArrivalPresentation>[0]> = {}) =>
  deriveSessionArrivalPresentation({ status: "SCHEDULED", now: windowOpen, checkInWindowOpensAt: windowOpen, scheduledStartAt: scheduledStart, graceDeadlineAt: graceDeadline, tutorPresenceRecorded: false, studentPresenceRecorded: false, noShowOutcome: null, ...overrides });

describe("SUI-1 Session arrival presentation", () => {
  it("presents the pre-window state before the authoritative opening instant", () => expect(state({ now: new Date(windowOpen.getTime() - 1) })).toBe("preWindow"));
  it("opens at the exact authoritative instant", () => expect(state()).toBe("ready"));
  it("presents Tutor check-in only when the backend allows it", () => expect(sessionCheckInControls(["CHECK_IN_AS_TUTOR"])).toEqual({ tutor: true, student: false }));
  it("presents Student check-in only when the backend allows it", () => expect(sessionCheckInControls(["CHECK_IN_AS_STUDENT"])).toEqual({ tutor: false, student: true }));
  it("uses learner-specific Guardian action context", () => expect(studentCheckInLabelKind("GUARDIAN")).toBe("guardian"));
  it("keeps Tutor learner-presence separate from Tutor self check-in", () => {
    expect(studentCheckInLabelKind("TUTOR_OWNER")).toBe("tutor");
    expect(sessionCheckInControls(["CHECK_IN_AS_TUTOR", "CHECK_IN_AS_STUDENT"])).toEqual({ tutor: true, student: true });
  });
  it("waits for the Tutor after Student presence", () => expect(state({ studentPresenceRecorded: true })).toBe("waitingForTutor"));
  it("waits for the learner after Tutor presence", () => expect(state({ tutorPresenceRecorded: true })).toBe("waitingForStudent"));
  it("uses the authoritative IN_PROGRESS state", () => expect(state({ status: "IN_PROGRESS", tutorPresenceRecorded: true, studentPresenceRecorded: true })).toBe("inProgress"));
  it("does not invent terminal outcome presentation", () => expect(state({ status: "UNRECOGNIZED_TERMINAL" })).toBe("unavailable"));
  it("maps authorization errors safely", () => expect(sessionCheckInErrorCode("notAuthorized")).toBe("notAuthorized"));
  it("maps too-early errors safely", () => expect(sessionCheckInErrorCode("tooEarly")).toBe("tooEarly"));
  it("maps unknown errors generically", () => expect(sessionCheckInErrorCode(new Error("internal"))).toBe("generic"));

  it("keeps the scheduled-start instant in the grace period without declaring a no-show", () => expect(state({ now: scheduledStart })).toBe("graceReady"));
  it("keeps T+14:59.999 in the grace period", () => expect(state({ now: new Date(graceDeadline.getTime() - 1) })).toBe("graceReady"));
  it("uses a neutral authoritative-refresh state at exactly T+15 instead of deciding no-show", () => expect(state({ now: graceDeadline })).toBe("deadlinePending"));
  it("shows Tutor-present / Student-waiting grace state", () => expect(state({ now: scheduledStart, tutorPresenceRecorded: true })).toBe("graceWaitingForStudent"));
  it("shows Student-present / Tutor-waiting grace state", () => expect(state({ now: scheduledStart, studentPresenceRecorded: true })).toBe("graceWaitingForTutor"));
  it("presents authoritative STUDENT_NO_SHOW", () => expect(state({ status: "NO_SHOW", noShowOutcome: "STUDENT_NO_SHOW" })).toBe("studentNoShow"));
  it("presents authoritative TUTOR_NO_SHOW", () => expect(state({ status: "NO_SHOW", noShowOutcome: "TUTOR_NO_SHOW" })).toBe("tutorNoShow"));
  it("presents neither-present outcome neutrally", () => expect(state({ status: "NO_SHOW", noShowOutcome: "NO_SHOW_UNRESOLVED" })).toBe("neutralNoShow"));
  it("marks every no-show presentation terminal", () => {
    expect(isTerminalNoShowPresentation("studentNoShow")).toBe(true);
    expect(isTerminalNoShowPresentation("tutorNoShow")).toBe(true);
    expect(isTerminalNoShowPresentation("neutralNoShow")).toBe(true);
    expect(isTerminalNoShowPresentation("graceReady")).toBe(false);
  });
  it("hides check-in at the deadline and for every terminal no-show", () => {
    const actions = ["CHECK_IN_AS_TUTOR"];
    expect(shouldShowSessionCheckIn("graceReady", actions)).toBe(true);
    expect(shouldShowSessionCheckIn("deadlinePending", actions)).toBe(false);
    expect(shouldShowSessionCheckIn("studentNoShow", actions)).toBe(false);
    expect(shouldShowSessionCheckIn("tutorNoShow", actions)).toBe(false);
    expect(shouldShowSessionCheckIn("neutralNoShow", actions)).toBe(false);
  });
  it("refreshes after authoritative late-check-in rejection", () => expect(shouldRefreshSessionAfterCheckIn({ error: "notEligible" })).toBe(true));
  it("countdown formatting is presentational and clamps at zero", () => {
    expect(graceRemainingParts(graceDeadline, new Date(graceDeadline.getTime() - 61_000))).toEqual({ minutes: 1, seconds: 1, expired: false });
    expect(graceRemainingParts(graceDeadline, graceDeadline)).toEqual({ minutes: 0, seconds: 0, expired: true });
  });
  it("keeps Tutor, Student, and Guardian no-show perspectives distinct", () => {
    expect(noShowCopyKind("TUTOR_OWNER", "STUDENT_NO_SHOW")).toBe("studentAbsentTutor");
    expect(noShowCopyKind("SELF_MANAGED_STUDENT", "TUTOR_NO_SHOW")).toBe("tutorAbsentLearner");
    expect(noShowCopyKind("GUARDIAN", "TUTOR_NO_SHOW")).toBe("tutorAbsentLearner");
  });

  for (const [locale, messages] of [["en", en], ["fr", fr]] as const) {
    it(`resolves SUI-1 messages in ${locale}`, () => {
      const translate = createTranslator({ locale, messages, namespace: "sessionExperience", onError: (error) => { throw error; } });
      expect(translate("states.waitingForTutor.title")).not.toContain("sessionExperience");
      expect(translate("actions.guardianStudent", { name: "Emma" })).toContain("Emma");
      expect(translate("errors.tooEarly")).toBeTruthy();
      expect(translate("states.graceWaitingForTutor.title")).toBeTruthy();
      expect(translate("states.studentNoShow.title")).toBeTruthy();
      const noShowCopy = JSON.stringify(messages.sessionExperience.noShow);
      expect(noShowCopy).not.toMatch(/refund|remboursement|compensation|TutorEarning/i);
      expect(JSON.stringify(messages.sessionExperience.states)).not.toMatch(/COMPLETED|INTERRUPTED/);
    });
  }
});
