import { createTranslator } from "use-intl/core";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import {
  deriveSessionArrivalPresentation,
  sessionCheckInControls,
  sessionCheckInErrorCode,
  studentCheckInLabelKind,
} from "./sessionPresentation";

const windowOpen = new Date("2026-08-18T16:45:00Z");
const state = (overrides: Partial<Parameters<typeof deriveSessionArrivalPresentation>[0]> = {}) =>
  deriveSessionArrivalPresentation({ status: "SCHEDULED", now: windowOpen, checkInWindowOpensAt: windowOpen, tutorPresenceRecorded: false, studentPresenceRecorded: false, ...overrides });

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

  for (const [locale, messages] of [["en", en], ["fr", fr]] as const) {
    it(`resolves SUI-1 messages in ${locale}`, () => {
      const translate = createTranslator({ locale, messages, namespace: "sessionExperience", onError: (error) => { throw error; } });
      expect(translate("states.waitingForTutor.title")).not.toContain("sessionExperience");
      expect(translate("actions.guardianStudent", { name: "Emma" })).toContain("Emma");
      expect(translate("errors.tooEarly")).toBeTruthy();
    });
  }
});
