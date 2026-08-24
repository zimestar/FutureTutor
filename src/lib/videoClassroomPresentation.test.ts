import { describe, expect, it } from "vitest";
import { controlsForVideoRole, deriveVideoEntryState, formatCallDuration, presentConnectionState } from "@/lib/videoClassroomPresentation";

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
    expect(controlsForVideoRole("OBSERVER")).toEqual({ canPublishAudio: false, canPublishVideo: false });
    expect(controlsForVideoRole("STUDENT")).toEqual({ canPublishAudio: true, canPublishVideo: true });
    expect(controlsForVideoRole("TUTOR")).toEqual({ canPublishAudio: true, canPublishVideo: true });
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
});
