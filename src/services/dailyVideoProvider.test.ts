import { describe, it, expect, vi, beforeEach } from "vitest";

// VIDEO-1B — direct unit coverage of the real Daily adapter, mocking only
// @/lib/dailyClient's network boundary (never a real fetch). VIDEO-1A only
// ever exercised VideoProviderAdapter through a hand-built fake at the
// interface level; this file is the first to test dailyVideoProvider.ts's
// own logic (deterministic naming, check-then-create room reuse, the
// post-failure race-recheck fallback, and exact per-role token payload
// shape) directly.

const dailyApiRequest = vi.fn();
const dailyApiGetRoom = vi.fn();
const dailyApiGetRoomStrict = vi.fn();
const dailyApiEjectParticipants = vi.fn();
const dailyApiDeleteRoom = vi.fn();
const dailyApiGetDomainConfig = vi.fn();

vi.mock("@/lib/dailyClient", async () => {
  const actual = await vi.importActual<typeof import("@/lib/dailyClient")>("@/lib/dailyClient");
  return {
    ...actual,
    dailyApiRequest: (...args: unknown[]) => dailyApiRequest(...args),
    dailyApiGetRoom: (...args: unknown[]) => dailyApiGetRoom(...args),
    dailyApiGetRoomStrict: (...args: unknown[]) => dailyApiGetRoomStrict(...args),
    dailyApiEjectParticipants: (...args: unknown[]) => dailyApiEjectParticipants(...args),
    dailyApiDeleteRoom: (...args: unknown[]) => dailyApiDeleteRoom(...args),
    dailyApiGetDomainConfig: (...args: unknown[]) => dailyApiGetDomainConfig(...args),
  };
});

import { createDailyVideoProvider } from "./dailyVideoProvider";
import { DailyApiError } from "@/lib/dailyClient";
import { VideoProviderUnavailableError } from "./videoProvider";

beforeEach(() => {
  dailyApiRequest.mockReset();
  dailyApiGetRoom.mockReset();
  dailyApiGetRoomStrict.mockReset();
  dailyApiEjectParticipants.mockReset();
  dailyApiDeleteRoom.mockReset();
  dailyApiGetDomainConfig.mockReset();
  dailyApiGetDomainConfig.mockResolvedValue({ domain_name: "futuretutor.daily.co", domain_id: "domain-1" });
});

const provider = createDailyVideoProvider();

const roomInput = {
  externalReference: "session-abc-123",
  notBefore: new Date("2026-08-24T10:00:00.000Z"),
  expiresAt: new Date("2026-08-24T12:10:00.000Z"),
};

describe("createRoom — deterministic naming", () => {
  it("computes the same room name across two separate calls for the same externalReference", async () => {
    dailyApiGetRoom.mockResolvedValue(null);
    dailyApiRequest.mockImplementation(async (_path: string, body: { name: string }) => ({
      id: "daily-id-1",
      name: body.name,
    }));

    const first = await provider.createRoom(roomInput);
    const second = await provider.createRoom(roomInput);

    expect(first.providerRoomId).toBe(second.providerRoomId);
    expect(dailyApiRequest).toHaveBeenCalledTimes(2);
    const [, firstBody] = dailyApiRequest.mock.calls[0] as [string, { name: string }];
    const [, secondBody] = dailyApiRequest.mock.calls[1] as [string, { name: string }];
    expect(firstBody.name).toBe(secondBody.name);
  });

  it("computes a different room name for a different externalReference", async () => {
    dailyApiGetRoom.mockResolvedValue(null);
    dailyApiRequest.mockImplementation(async (_path: string, body: { name: string }) => ({
      id: "daily-id",
      name: body.name,
    }));

    const a = await provider.createRoom(roomInput);
    const b = await provider.createRoom({ ...roomInput, externalReference: "session-different-999" });

    expect(a.providerRoomId).not.toBe(b.providerRoomId);
  });

  it("never embeds the raw externalReference in the room name", async () => {
    dailyApiGetRoom.mockResolvedValue(null);
    dailyApiRequest.mockImplementation(async (_path: string, body: { name: string }) => ({
      id: "daily-id",
      name: body.name,
    }));

    await provider.createRoom(roomInput);
    const [, body] = dailyApiRequest.mock.calls[0] as [string, { name: string }];
    expect(body.name).not.toContain(roomInput.externalReference);
    expect(body.name).toMatch(/^ft-[0-9a-f]{24}$/);
  });
});

describe("createRoom — check-then-create reuse", () => {
  it("reuses an existing room found by the deterministic name, never calling create", async () => {
    dailyApiGetRoom.mockResolvedValue({ id: "daily-id-existing", name: "ft-existing000000000000" });

    const result = await provider.createRoom(roomInput);

    expect(result.providerRoomId).toBe("ft-existing000000000000");
    expect(dailyApiRequest).not.toHaveBeenCalled();
  });

  it("creates a new room when none exists yet", async () => {
    dailyApiGetRoom.mockResolvedValue(null);
    dailyApiRequest.mockResolvedValue({ id: "daily-id", name: "ft-newroom00000000000000" });

    const result = await provider.createRoom(roomInput);

    expect(result.providerRoomId).toBe("ft-newroom00000000000000");
    expect(dailyApiRequest).toHaveBeenCalledTimes(1);
    const [path, body] = dailyApiRequest.mock.calls[0] as [string, { privacy: string; properties: Record<string, unknown> }];
    expect(path).toBe("/rooms");
    expect(body.privacy).toBe("private");
    expect(body.properties.enable_knocking).toBe(false);
  });

  it("race fallback: create fails, but a re-check finds the room a concurrent attempt just created — reuses it, does not throw", async () => {
    dailyApiGetRoom
      .mockResolvedValueOnce(null) // initial check: not found
      .mockResolvedValueOnce({ id: "daily-id-raced", name: "ft-raced0000000000000000" }); // post-failure re-check: found
    dailyApiRequest.mockRejectedValue(new DailyApiError("room name already exists", 400));

    const result = await provider.createRoom(roomInput);

    expect(result.providerRoomId).toBe("ft-raced0000000000000000");
  });

  it("race fallback exhausted: create fails and the re-check still finds nothing — throws VideoProviderUnavailableError", async () => {
    dailyApiGetRoom.mockResolvedValue(null);
    dailyApiRequest.mockRejectedValue(new DailyApiError("internal error", 500));

    await expect(provider.createRoom(roomInput)).rejects.toThrow(VideoProviderUnavailableError);
  });

  it("propagates VideoProviderUnavailableError for a non-DailyApiError failure with no room recoverable via re-check", async () => {
    dailyApiGetRoom.mockResolvedValue(null);
    dailyApiRequest.mockRejectedValue(new Error("network blip"));

    await expect(provider.createRoom(roomInput)).rejects.toThrow(VideoProviderUnavailableError);
  });
});

describe("roomExists — stale-reference fix", () => {
  it("returns true when Daily confirms the room exists", async () => {
    dailyApiGetRoomStrict.mockResolvedValue({ outcome: "found", room: { id: "daily-id", name: "ft-someroom0000000000000" } });
    await expect(provider.roomExists("ft-someroom0000000000000")).resolves.toBe(true);
  });

  it("returns false ONLY for an authoritative not_found", async () => {
    dailyApiGetRoomStrict.mockResolvedValue({ outcome: "not_found" });
    await expect(provider.roomExists("ft-someroom0000000000000")).resolves.toBe(false);
  });

  it("throws VideoProviderUnavailableError for an unknown outcome (5xx) — never returns false", async () => {
    dailyApiGetRoomStrict.mockResolvedValue({ outcome: "unknown", error: new DailyApiError("server error", 500) });
    await expect(provider.roomExists("ft-someroom0000000000000")).rejects.toThrow(VideoProviderUnavailableError);
  });

  it("throws VideoProviderUnavailableError for an unknown outcome (network failure) — never returns false", async () => {
    dailyApiGetRoomStrict.mockResolvedValue({ outcome: "unknown", error: new DailyApiError("network error", 0) });
    await expect(provider.roomExists("ft-someroom0000000000000")).rejects.toThrow(VideoProviderUnavailableError);
  });
});

describe("createParticipantToken — per-role permission shape", () => {
  const tokenInput = {
    providerRoomId: "ft-someroom0000000000000",
    participantExternalId: "user-1",
    notBefore: new Date("2026-08-24T10:00:00.000Z"),
    expiresAt: new Date("2026-08-24T12:10:00.000Z"),
  };

  beforeEach(() => {
    dailyApiRequest.mockResolvedValue({ token: "fake-signed-token" });
  });

  it("STUDENT: not owner, can screenshare, camera/mic on by default, no restrictive permissions object", async () => {
    await provider.createParticipantToken({ ...tokenInput, role: "STUDENT" });
    const [path, body] = dailyApiRequest.mock.calls[0] as [string, { properties: Record<string, unknown> }];
    expect(path).toBe("/meeting-tokens");
    expect(body.properties.is_owner).toBe(false);
    expect(body.properties.enable_screenshare).toBe(true);
    expect(body.properties.start_video_off).toBe(false);
    expect(body.properties.start_audio_off).toBe(false);
    expect(body.properties.permissions).toBeUndefined();
  });

  it("TUTOR: is_owner true, otherwise same participant capabilities as STUDENT — no extra recording/admin-only properties", async () => {
    await provider.createParticipantToken({ ...tokenInput, role: "TUTOR" });
    const [, body] = dailyApiRequest.mock.calls[0] as [string, { properties: Record<string, unknown> }];
    expect(body.properties.is_owner).toBe(true);
    expect(body.properties.enable_screenshare).toBe(true);
    expect(body.properties.permissions).toBeUndefined();
  });

  it("PARENT observer: canSend empty, canAdmin false, camera/mic default off, hasPresence true", async () => {
    await provider.createParticipantToken({ ...tokenInput, role: "OBSERVER" });
    const [, body] = dailyApiRequest.mock.calls[0] as [string, { properties: Record<string, unknown> }];
    expect(body.properties.is_owner).toBe(false);
    expect(body.properties.enable_screenshare).toBe(false);
    expect(body.properties.start_video_off).toBe(true);
    expect(body.properties.start_audio_off).toBe(true);
    expect(body.properties.permissions).toEqual({ hasPresence: true, canSend: [], canAdmin: false });
  });

  it("every token request sets eject_at_token_exp and an exp matching the caller-supplied expiresAt", async () => {
    const result = await provider.createParticipantToken({ ...tokenInput, role: "STUDENT" });
    const [, body] = dailyApiRequest.mock.calls[0] as [string, { properties: Record<string, unknown> }];
    expect(body.properties.eject_at_token_exp).toBe(true);
    expect(body.properties.exp).toBe(Math.floor(tokenInput.expiresAt.getTime() / 1000));
    expect(result.joinUrl).toBe(`https://futuretutor.daily.co/${tokenInput.providerRoomId}`);
  });

  it("wraps a token-creation failure as VideoProviderUnavailableError, never leaking the raw Daily error", async () => {
    dailyApiRequest.mockRejectedValue(new DailyApiError("invalid room", 400));
    await expect(provider.createParticipantToken({ ...tokenInput, role: "STUDENT" })).rejects.toThrow(
      VideoProviderUnavailableError
    );
  });
});

describe("revokeRoomAccess — cancellation revocation", () => {
  const revokeInput = { providerRoomId: "ft-someroom0000000000000", knownParticipantUserIds: ["user-student", "user-tutor"] };

  it("ejects the known participants, then deletes the room", async () => {
    dailyApiEjectParticipants.mockResolvedValue(undefined);
    dailyApiDeleteRoom.mockResolvedValue(undefined);

    await provider.revokeRoomAccess(revokeInput);

    expect(dailyApiEjectParticipants).toHaveBeenCalledWith(revokeInput.providerRoomId, revokeInput.knownParticipantUserIds);
    expect(dailyApiDeleteRoom).toHaveBeenCalledWith(revokeInput.providerRoomId);
  });

  it("skips the eject call entirely when there are no known participant ids", async () => {
    dailyApiDeleteRoom.mockResolvedValue(undefined);
    await provider.revokeRoomAccess({ providerRoomId: revokeInput.providerRoomId, knownParticipantUserIds: [] });
    expect(dailyApiEjectParticipants).not.toHaveBeenCalled();
    expect(dailyApiDeleteRoom).toHaveBeenCalled();
  });

  it("still deletes the room even when ejection fails (independent, non-blocking steps)", async () => {
    dailyApiEjectParticipants.mockRejectedValue(new DailyApiError("nobody connected", 400));
    dailyApiDeleteRoom.mockResolvedValue(undefined);

    await expect(provider.revokeRoomAccess(revokeInput)).resolves.toBeUndefined();
    expect(dailyApiDeleteRoom).toHaveBeenCalledWith(revokeInput.providerRoomId);
  });

  it("throws VideoProviderUnavailableError when deletion fails, regardless of ejection's outcome", async () => {
    dailyApiEjectParticipants.mockResolvedValue(undefined);
    dailyApiDeleteRoom.mockRejectedValue(new DailyApiError("internal error", 500));

    await expect(provider.revokeRoomAccess(revokeInput)).rejects.toThrow(VideoProviderUnavailableError);
  });

  it("throws VideoProviderUnavailableError for a non-DailyApiError deletion failure too", async () => {
    dailyApiEjectParticipants.mockResolvedValue(undefined);
    dailyApiDeleteRoom.mockRejectedValue(new Error("network blip"));

    await expect(provider.revokeRoomAccess(revokeInput)).rejects.toThrow(VideoProviderUnavailableError);
  });
});
