import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  dailyApiGetDomainConfig,
  dailyApiListWebhooks,
  dailyApiCreateWebhook,
  dailyApiEjectParticipants,
  dailyApiDeleteRoom,
  DailyApiError,
  DailyApiKeyMissingError,
} from "./dailyClient";

// VIDEO-1B — unit coverage for dailyClient.ts's own raw HTTP wrappers,
// mocking global fetch directly (one layer below dailyVideoProvider.test.ts,
// which mocks this module instead). Never a real network call.

const originalKey = process.env.DAILY_API_KEY;
const fetchMock = vi.fn();

beforeEach(() => {
  process.env.DAILY_API_KEY = "test-key-not-real";
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.DAILY_API_KEY;
  else process.env.DAILY_API_KEY = originalKey;
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe("dailyApiGetDomainConfig", () => {
  it("GETs / and returns the parsed domain config", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ domain_name: "ft-sandbox", domain_id: "abc-123" }));
    const result = await dailyApiGetDomainConfig();
    expect(result).toEqual({ domain_name: "ft-sandbox", domain_id: "abc-123" });
    expect(fetchMock).toHaveBeenCalledWith("https://api.daily.co/v1/", expect.objectContaining({ method: "GET" }));
  });

  it("throws DailyApiError on a failed response, never leaking the raw body verbatim beyond the sanitized message", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "unauthorized", info: "invalid api key" }, false, 401));
    await expect(dailyApiGetDomainConfig()).rejects.toThrow(DailyApiError);
  });

  it("throws DailyApiKeyMissingError when DAILY_API_KEY is unset, before any fetch happens", async () => {
    delete process.env.DAILY_API_KEY;
    await expect(dailyApiGetDomainConfig()).rejects.toThrow(DailyApiKeyMissingError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("dailyApiListWebhooks", () => {
  it("returns the data array from a paginated-shaped response", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ total_count: 1, data: [{ uuid: "wh-1", url: "https://example.test/hook", eventTypes: ["participant.joined"], hmac: "x", state: "INACTIVE" }] })
    );
    const result = await dailyApiListWebhooks();
    expect(result).toHaveLength(1);
    expect(result[0].uuid).toBe("wh-1");
  });

  it("returns a bare array response as-is", async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ uuid: "wh-2", url: "https://x.test", eventTypes: [], hmac: "y", state: "INACTIVE" }]));
    const result = await dailyApiListWebhooks();
    expect(result).toHaveLength(1);
    expect(result[0].uuid).toBe("wh-2");
  });
});

describe("dailyApiCreateWebhook", () => {
  it("POSTs to /webhooks with the url and eventTypes, returns the created webhook including hmac", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ uuid: "wh-new", url: "https://staging.futuretutor.ca/api/webhooks/daily", eventTypes: ["participant.joined"], hmac: "secret-value", state: "INACTIVE" })
    );
    const result = await dailyApiCreateWebhook("https://staging.futuretutor.ca/api/webhooks/daily", ["participant.joined"]);
    expect(result.uuid).toBe("wh-new");
    expect(result.hmac).toBe("secret-value");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ url: "https://staging.futuretutor.ca/api/webhooks/daily", eventTypes: ["participant.joined"] });
  });
});

describe("dailyApiEjectParticipants", () => {
  it("POSTs the given user_ids to /rooms/{name}/eject", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ejectedIds: [] }));
    await dailyApiEjectParticipants("ft-room-1", ["user-a", "user-b"]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.daily.co/v1/rooms/ft-room-1/eject");
    expect(JSON.parse(init.body as string)).toEqual({ user_ids: ["user-a", "user-b"] });
  });

  it("throws DailyApiError on failure", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "bad request" }, false, 400));
    await expect(dailyApiEjectParticipants("ft-room-1", ["user-a"])).rejects.toThrow(DailyApiError);
  });
});

describe("dailyApiDeleteRoom", () => {
  it("DELETEs /rooms/{name} and succeeds on 200", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, true, 200));
    await expect(dailyApiDeleteRoom("ft-room-1")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("https://api.daily.co/v1/rooms/ft-room-1", expect.objectContaining({ method: "DELETE" }));
  });

  it("treats 404 as success (idempotent delete)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false, 404));
    await expect(dailyApiDeleteRoom("ft-room-1")).resolves.toBeUndefined();
  });

  it("throws DailyApiError on a genuine failure (not 200, not 404)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "server error" }, false, 500));
    await expect(dailyApiDeleteRoom("ft-room-1")).rejects.toThrow(DailyApiError);
  });
});
