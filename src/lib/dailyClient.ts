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

/**
 * Thin, typed fetch wrapper. Deliberately does NOT log the request body (it
 * may contain room/participant identifiers) or any response header — only
 * a sanitized status code and Daily's own top-level `error`/`info` message
 * (never a raw response dump) ever reach a thrown error's `.message`, and
 * the Authorization header is never included in anything returned or
 * thrown from this function.
 */
export async function dailyApiRequest<T>(path: string, body: unknown): Promise<T> {
  const apiKey = getDailyApiKey();
  let response: Response;
  try {
    response = await fetch(`${DAILY_API_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new DailyApiError(
      `Daily API request to ${path} failed before receiving a response: ${error instanceof Error ? error.message : "unknown network error"}`,
      0
    );
  }

  if (!response.ok) {
    let sanitizedMessage = `Daily API request to ${path} failed with status ${response.status}`;
    try {
      const parsed = (await response.json()) as { error?: string; info?: string };
      if (parsed.info) sanitizedMessage += `: ${parsed.info}`;
      else if (parsed.error) sanitizedMessage += `: ${parsed.error}`;
    } catch {
      // Response body wasn't JSON (or was empty) — the status-only message above is used as-is.
    }
    throw new DailyApiError(sanitizedMessage, response.status);
  }

  return (await response.json()) as T;
}
