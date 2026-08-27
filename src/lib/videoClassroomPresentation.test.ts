import { describe, expect, it } from "vitest";
import {
  controlsForVideoRole,
  deriveVideoEntryState,
  formatCallDuration,
  isSessionEndingSoon,
  minutesRemainingInSession,
  presentConnectionState,
  resolveParticipantRoleFromUserData,
} from "@/lib/videoClassroomPresentation";

const base = {
  mode: "ONLINE" as const,
  status: "SCHEDULED" as const,
  opensAt: new Date("2026-08-24T10:00:00Z"),
  closesAt: new Date("2026-08-24T11:10:00Z"),
};

describe("VIDEO-1C classroom presentation", () => {
  it("maps authoritative lifecycle/window facts without inventing session transitions", () => {
    expect(deriveVideoEntryState({ ...base, now: new Date("2026-08-24T09:59:59Z") })).toBe("tooEarly");
    expect(deriveVideoEntryState({ ...base, now: base.opensAt })).toBe("ready");
    expect(deriveVideoEntryState({ ...base, status: "CANCELLED", now: base.opensAt })).toBe("cancelled");
    expect(deriveVideoEntryState({ ...base, status: "COMPLETED", now: base.opensAt })).toBe("ended");
    expect(deriveVideoEntryState({ ...base, now: new Date("2026-08-24T11:10:01Z") })).toBe("ended");
    expect(deriveVideoEntryState({ ...base, mode: "IN_PERSON", now: base.opensAt })).toBe("unavailable");
  });

  it("keeps observer publishing controls structurally unavailable", () => {
    expect(controlsForVideoRole("OBSERVER")).toEqual({ canPublishAudio: false, canPublishVideo: false, canShareScreen: false });
    expect(controlsForVideoRole("STUDENT")).toEqual({ canPublishAudio: true, canPublishVideo: true, canShareScreen: true });
    expect(controlsForVideoRole("TUTOR")).toEqual({ canPublishAudio: true, canPublishVideo: true, canShareScreen: true });
  });

  it("formats an informational elapsed timer", () => {
    expect(formatCallDuration(0)).toBe("00:00");
    expect(formatCallDuration(65)).toBe("01:05");
    expect(formatCallDuration(3661)).toBe("01:01:01");
  });

  it("maps provider connection events to safe presentation states", () => {
    expect(presentConnectionState("reconnecting")).toBe("reconnecting");
    expect(presentConnectionState("peer-to-peer-connected")).toBe("connected");
    expect(presentConnectionState("network-disconnected")).toBe("disconnected");
    expect(presentConnectionState("signaling-started")).toBeNull();
  });

  it("computes a clamped, presentational time-remaining figure", () => {
    const end = new Date("2026-08-24T11:00:00Z");
    expect(minutesRemainingInSession(end, new Date("2026-08-24T10:18:30Z"))).toBe(42);
    expect(minutesRemainingInSession(end, new Date("2026-08-24T10:00:00Z"))).toBe(60);
    expect(minutesRemainingInSession(end, new Date("2026-08-24T11:00:00Z"))).toBe(0);
    expect(minutesRemainingInSession(end, new Date("2026-08-24T12:00:00Z"))).toBe(0);
  });

  it("flags the ending-soon state only in the final ten minutes, never at/after zero", () => {
    expect(isSessionEndingSoon(11)).toBe(false);
    expect(isSessionEndingSoon(10)).toBe(true);
    expect(isSessionEndingSoon(1)).toBe(true);
    expect(isSessionEndingSoon(0)).toBe(false);
  });

  it("resolves a participant's classroom role from userData without trusting an unrecognized shape", () => {
    expect(resolveParticipantRoleFromUserData({ role: "TUTOR" })).toBe("TUTOR");
    expect(resolveParticipantRoleFromUserData({ role: "STUDENT" })).toBe("STUDENT");
    expect(resolveParticipantRoleFromUserData({ role: "OBSERVER" })).toBe("OBSERVER");
    expect(resolveParticipantRoleFromUserData({ role: "ADMIN" })).toBeNull();
    expect(resolveParticipantRoleFromUserData({ somethingElse: true })).toBeNull();
    expect(resolveParticipantRoleFromUserData(undefined)).toBeNull();
    expect(resolveParticipantRoleFromUserData(null)).toBeNull();
    expect(resolveParticipantRoleFromUserData("TUTOR")).toBeNull();
  });
});
