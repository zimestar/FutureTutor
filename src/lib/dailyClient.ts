import "server-only";

/**
 * VIDEO-1A — Daily.co REST API access. Mirrors src/lib/stripe.ts's exact
 * `server-only`-guarded, lazily-validated singleton-config pattern (Daily
 * has no official server SDK the way Stripe does — its server surface is a
 * plain REST API, so this exposes a small typed fetch wrapper instead of a
 * client object). DAILY_API_KEY is read here ONLY — never destructured into
 * a variable that could be accidentally logged or forwarded, and never sent
 * anywhere except as the Authorization header of a request to
 * api.daily.co.
 *
 * Verified against Daily's current REST API documentation (2026):
 * POST https://api.daily.co/v1/rooms and
 * POST https://api.daily.co/v1/meeting-tokens, both authenticated via
 * `Authorization: Bearer <DAILY_API_KEY>`.
 */

const DAILY_API_BASE_URL = "https://api.daily.co/v1";

export class DailyApiKeyMissingError extends Error {}
export class DailyApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

function getDailyApiKey(): string {
  const key = process.env.DAILY_API_KEY;
  if (!key) {
    throw new DailyApiKeyMissingError(
      "DAILY_API_KEY is not configured — every video call site must check videoUseDailyProvider()-equivalent " +
        "configuration before reaching here."
    );
  }
  return key;
}

async function rawDailyFetch(path: string, init: RequestInit): Promise<Response> {
  const apiKey = getDailyApiKey();
  try {
    return await fetch(`${DAILY_API_BASE_URL}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${apiKey}` },
    });
  } catch (error) {
    throw new DailyApiError(
      `Daily API request to ${path} failed before receiving a response: ${error instanceof Error ? error.message : "unknown network error"}`,
      0
    );
  }
}

async function sanitizedErrorFromResponse(path: string, response: Response): Promise<DailyApiError> {
  let sanitizedMessage = `Daily API request to ${path} failed with status ${response.status}`;
  try {
    const parsed = (await response.json()) as { error?: string; info?: string };
    if (parsed.info) sanitizedMessage += `: ${parsed.info}`;
    else if (parsed.error) sanitizedMessage += `: ${parsed.error}`;
  } catch {
    // Response body wasn't JSON (or was empty) — the status-only message above is used as-is.
  }
  return new DailyApiError(sanitizedMessage, response.status);
}

/**
 * Thin, typed fetch wrapper. Deliberately does NOT log the request body (it
 * may contain room/participant identifiers) or any response header — only
 * a sanitized status code and Daily's own top-level `error`/`info` message
 * (never a raw response dump) ever reach a thrown error's `.message`, and
 * the Authorization header is never included in anything returned or
 * thrown from this function.
 */
export async function dailyApiRequest<T>(path: string, body: unknown): Promise<T> {
  const response = await rawDailyFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await sanitizedErrorFromResponse(path, response);
  return (await response.json()) as T;
}

/**
 * VIDEO-1B — read-only lookup, used by createRoom's check-then-create
 * deterministic-naming flow (see dailyVideoProvider.ts). Daily's public
 * docs do not clearly document the exact status code for "no room with
 * this name" (observed inconsistently as 400 in some docs, conventionally
 * 404 elsewhere) — rather than guess a single status code, ANY failed
 * response here is treated uniformly as "could not confirm the room
 * exists," returning null. This is deliberately conservative: it never
 * risks misreading a real outage as "not found" and silently proceeding to
 * create a duplicate — createRoom's own caller-side re-check after a
 * failed POST (see dailyVideoProvider.ts) is what actually closes that
 * race, not this function's error handling.
 */
export async function dailyApiGetRoom(roomName: string): Promise<{ id: string; name: string } | null> {
  let response: Response;
  try {
    response = await rawDailyFetch(`/rooms/${encodeURIComponent(roomName)}`, { method: "GET" });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as { id: string; name: string };
}

/**
 * VIDEO-1B — best-effort participant removal, used by revokeRoomAccess
 * (dailyVideoProvider.ts) before deleting the room. POSTs explicit
 * `user_ids` (never relies on omitting them to mean "eject everyone" —
 * undocumented behavior this codebase does not assume). Failure here is
 * always non-fatal to the caller's overall revocation attempt (see
 * dailyVideoProvider.ts) — surfaced as a thrown DailyApiError so the
 * caller can decide, never swallowed here.
 */
export async function dailyApiEjectParticipants(roomName: string, userIds: string[]): Promise<void> {
  const response = await rawDailyFetch(`/rooms/${encodeURIComponent(roomName)}/eject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_ids: userIds }),
  });
  if (!response.ok) throw await sanitizedErrorFromResponse(`/rooms/${roomName}/eject`, response);
}

/**
 * VIDEO-1B — deletes a room, the authoritative access-closing mechanism:
 * once gone, no previously-issued token's `room_name` claim resolves to
 * anything, regardless of the token's own unexpired `exp`. A 404 (room
 * already gone — e.g. a second cancellation-triggered revocation attempt,
 * or the room already expired on its own) is treated as SUCCESS, not a
 * failure — deletion is idempotent by nature: the end state ("this room
 * does not exist") is identical either way.
 */
export async function dailyApiDeleteRoom(roomName: string): Promise<void> {
  const response = await rawDailyFetch(`/rooms/${encodeURIComponent(roomName)}`, { method: "DELETE" });
  if (response.ok || response.status === 404) return;
  throw await sanitizedErrorFromResponse(`/rooms/${roomName}`, response);
}

export interface DailyDomainConfig {
  domain_name: string;
  domain_id: string;
}

/**
 * VIDEO-1B — harmless, side-effect-free authenticated read (GET /,
 * "get domain config"), used purely to verify a configured DAILY_API_KEY
 * is valid and to identify WHICH Daily account/sandbox it authenticates
 * against (domain_name/domain_id) — never printed alongside the key
 * itself, and this function never receives or touches the raw key value
 * beyond rawDailyFetch's own internal use.
 */
export async function dailyApiGetDomainConfig(): Promise<DailyDomainConfig> {
  const response = await rawDailyFetch("/", { method: "GET" });
  if (!response.ok) throw await sanitizedErrorFromResponse("/", response);
  return (await response.json()) as DailyDomainConfig;
}

export interface DailyWebhookConfig {
  uuid: string;
  url: string;
  eventTypes: string[];
  hmac: string;
  state: string;
}

/** VIDEO-1B — GET /webhooks. Used to find an existing webhook for a given
 * URL before creating a new one, avoiding an accumulation of duplicate
 * subscriptions across repeated setup runs. */
export async function dailyApiListWebhooks(): Promise<DailyWebhookConfig[]> {
  const response = await rawDailyFetch("/webhooks", { method: "GET" });
  if (!response.ok) throw await sanitizedErrorFromResponse("/webhooks", response);
  const body = (await response.json()) as { total_count?: number; data?: DailyWebhookConfig[] } | DailyWebhookConfig[];
  return Array.isArray(body) ? body : (body.data ?? []);
}

/**
 * VIDEO-1B — POST /webhooks. The response's `hmac` field is the webhook's
 * signing secret (Daily auto-generates one when omitted from the request,
 * which this function always does) — the caller is responsible for storing
 * it as DAILY_WEBHOOK_SECRET without ever logging it; this function itself
 * does not log the response body.
 */
export async function dailyApiCreateWebhook(url: string, eventTypes: string[]): Promise<DailyWebhookConfig> {
  return dailyApiRequest<DailyWebhookConfig>("/webhooks", { url, eventTypes });
}
