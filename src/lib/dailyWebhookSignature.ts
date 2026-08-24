import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * VIDEO-1B — Daily webhook signature verification. Mirrors the exact
 * current scheme from Daily's REST API webhook documentation (verified via
 * WebFetch against docs.daily.co, 2026):
 *   - Headers: X-Webhook-Signature (the computed signature), X-Webhook-
 *     Timestamp (a Unix-seconds timestamp).
 *   - Signed string: `${X-Webhook-Timestamp header value}.${raw JSON body
 *     exactly as Daily sent it}` — the route handler MUST pass the raw,
 *     unparsed request body text here; re-serializing a parsed object would
 *     not reproduce Daily's own JSON.stringify output byte-for-byte and
 *     would break every signature.
 *   - Algorithm: HMAC-SHA256, secret is base64-decoded before use, and the
 *     resulting signature is base64-encoded for comparison against the
 *     header.
 * Daily's docs do not specify a replay/timestamp-tolerance window — this
 * module picks an explicit, conservative, documented default rather than
 * accepting an unbounded age or inventing an undocumented "official" value.
 */
export const DAILY_WEBHOOK_REPLAY_TOLERANCE_SECONDS = 5 * 60;

export class DailyWebhookSecretMissingError extends Error {}
export class DailyWebhookSignatureInvalidError extends Error {}
export class DailyWebhookTimestampInvalidError extends Error {}

/**
 * VIDEO-1B — creation-time probe compatibility. Daily's own POST /webhooks
 * endpoint synchronously sends an unsigned reachability check to the target
 * URL before finalizing a webhook subscription (confirmed empirically
 * against the real Daily API and independently corroborated via Railway's
 * own HTTP proxy logs — Daily's infrastructure hit this receiver and
 * received a 400, which Daily's docs confirm causes it to refuse to create
 * the webhook: "if a non-200 status code is received... Daily will consider
 * the endpoint faulty"). A receiver that fails closed on every unsigned
 * request can therefore never pass Daily's own setup-time health check.
 *
 * This function classifies EXACTLY the "no signature envelope presented at
 * all" shape (both headers absent) as a bare liveness probe — nothing else.
 * It does not inspect the body, the User-Agent, or the source IP (VIDEO-1B
 * §3 — those are all attacker-controllable and never used for this
 * decision). A request presenting only one of the two headers, or invalid/
 * stale values for either, is NOT this case — see verifyDailyWebhookSignature
 * below, which continues to reject those the same as before this change.
 *
 * The caller (the route handler) is responsible for the actual security
 * invariant: this function only classifies; it performs no I/O and cannot
 * itself cause any mutation. A request classified true here must be
 * answered with a bare 200 and MUST NOT reach processDailyWebhookEvent,
 * any DB read/write, or any provider call — enforced by the route handler
 * returning immediately on this classification, before parsing the body as
 * an event or importing anything from dailyWebhooks.ts.
 */
export function isBareReachabilityProbe(signatureHeader: string | null, timestampHeader: string | null): boolean {
  return signatureHeader === null && timestampHeader === null;
}

/**
 * VIDEO-1B — TEMPORARY diagnostic-only classification of the
 * X-Webhook-Timestamp header's SHAPE, never its value. Every returned field
 * is a boolean, an enum, or null — no raw or parsed timestamp number is
 * ever included in the result, so a caller logging this object cannot leak
 * the actual value no matter what it prints. To be removed once Daily's
 * real creation-time probe's timestamp shape is fully understood (see the
 * probe-shape diagnostic mission).
 *
 * Plausible-seconds/milliseconds ranges are deliberately wide and
 * unremarkable (roughly year 2000 to year 2100) — wide enough to classify
 * any real, sane timestamp Daily could plausibly send, without being tuned
 * to any specific observed value.
 */
export interface DiagnosticTimestampShape {
  timestampPresent: boolean;
  timestampNonEmpty: boolean;
  timestampNumeric: boolean;
  timestampInteger: boolean;
  timestampUnitClassification: "seconds" | "milliseconds" | "other" | "unknown";
  timestampWithinReplayTolerance: boolean | null;
}

const PLAUSIBLE_SECONDS_MIN = 946684800; // 2000-01-01T00:00:00Z
const PLAUSIBLE_SECONDS_MAX = 4102444800; // 2100-01-01T00:00:00Z

export function classifyDiagnosticTimestampShape(
  timestampHeader: string | null,
  now: Date = new Date()
): DiagnosticTimestampShape {
  const timestampPresent = timestampHeader !== null;
  const timestampNonEmpty = timestampPresent && timestampHeader.length > 0;

  if (!timestampNonEmpty) {
    return {
      timestampPresent,
      timestampNonEmpty,
      timestampNumeric: false,
      timestampInteger: false,
      timestampUnitClassification: "unknown",
      timestampWithinReplayTolerance: null,
    };
  }

  const value = Number(timestampHeader);
  const timestampNumeric = Number.isFinite(value);
  if (!timestampNumeric) {
    return {
      timestampPresent,
      timestampNonEmpty,
      timestampNumeric: false,
      timestampInteger: false,
      timestampUnitClassification: "unknown",
      timestampWithinReplayTolerance: null,
    };
  }

  const timestampInteger = Number.isInteger(value);
  const isPlausibleSeconds = value >= PLAUSIBLE_SECONDS_MIN && value <= PLAUSIBLE_SECONDS_MAX;
  const isPlausibleMilliseconds = value >= PLAUSIBLE_SECONDS_MIN * 1000 && value <= PLAUSIBLE_SECONDS_MAX * 1000;

  let timestampUnitClassification: DiagnosticTimestampShape["timestampUnitClassification"] = "other";
  if (isPlausibleSeconds) timestampUnitClassification = "seconds";
  else if (isPlausibleMilliseconds) timestampUnitClassification = "milliseconds";

  let timestampWithinReplayTolerance: boolean | null = null;
  if (timestampUnitClassification === "seconds") {
    const driftSeconds = Math.abs(now.getTime() / 1000 - value);
    timestampWithinReplayTolerance = driftSeconds <= DAILY_WEBHOOK_REPLAY_TOLERANCE_SECONDS;
  }

  return {
    timestampPresent,
    timestampNonEmpty,
    timestampNumeric,
    timestampInteger,
    timestampUnitClassification,
    timestampWithinReplayTolerance,
  };
}

function getDailyWebhookSecret(): string {
  const secret = process.env.DAILY_WEBHOOK_SECRET;
  if (!secret) throw new DailyWebhookSecretMissingError("DAILY_WEBHOOK_SECRET is not configured");
  return secret;
}

export interface VerifyDailyWebhookSignatureInput {
  rawBody: string;
  signatureHeader: string | null;
  timestampHeader: string | null;
  /** Injectable for tests; defaults to the real clock. */
  now?: Date;
}

/**
 * Fail-closed by construction: every rejection path throws (never returns a
 * boolean the caller could accidentally ignore). Order: cheap structural
 * checks (header presence, timestamp parses as a number, timestamp within
 * tolerance) before the HMAC computation — not a timing-defense measure
 * (an attacker without the secret cannot forge a valid signature regardless
 * of what order checks run in, so there is no meaningful oracle here), just
 * avoiding unnecessary crypto work for obviously-malformed requests.
 */
export function verifyDailyWebhookSignature(input: VerifyDailyWebhookSignatureInput): void {
  if (!input.signatureHeader) {
    throw new DailyWebhookSignatureInvalidError("Missing X-Webhook-Signature header");
  }
  if (!input.timestampHeader) {
    throw new DailyWebhookTimestampInvalidError("Missing X-Webhook-Timestamp header");
  }

  const timestampSeconds = Number(input.timestampHeader);
  if (!Number.isFinite(timestampSeconds)) {
    throw new DailyWebhookTimestampInvalidError("Malformed X-Webhook-Timestamp header");
  }

  const now = input.now ?? new Date();
  const driftSeconds = Math.abs(now.getTime() / 1000 - timestampSeconds);
  if (driftSeconds > DAILY_WEBHOOK_REPLAY_TOLERANCE_SECONDS) {
    throw new DailyWebhookTimestampInvalidError(
      `X-Webhook-Timestamp outside the ${DAILY_WEBHOOK_REPLAY_TOLERANCE_SECONDS}s replay-tolerance window`
    );
  }

  const secret = getDailyWebhookSecret();
  const signedPayload = `${input.timestampHeader}.${input.rawBody}`;
  const expectedSignature = createHmac("sha256", Buffer.from(secret, "base64")).update(signedPayload).digest("base64");

  const providedBuffer = Buffer.from(input.signatureHeader, "base64");
  const expectedBuffer = Buffer.from(expectedSignature, "base64");
  // timingSafeEqual throws on unequal-length buffers rather than returning
  // false — checked explicitly first so a mismatched-length header can
  // never crash the request instead of being rejected as invalid.
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new DailyWebhookSignatureInvalidError("Signature mismatch");
  }
}
