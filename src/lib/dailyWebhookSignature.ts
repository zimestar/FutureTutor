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
 * endpoint synchronously sends a reachability check to the target URL
 * before finalizing a webhook subscription, and treats any non-200
 * response as a faulty endpoint (Daily's own docs: "if a non-200 status
 * code is received... Daily will consider the endpoint faulty"). This was
 * proven against the real Daily API and independently corroborated via
 * Railway's own HTTP proxy logs across several real creation attempts.
 *
 * The real probe's exact shape was captured directly (a single, atomic,
 * unambiguous log line — see the VIDEO-1B probe-shape diagnostic mission
 * for the full investigation): BOTH X-Webhook-Signature and
 * X-Webhook-Timestamp headers ARE present, but the timestamp value is in
 * Unix MILLISECONDS rather than the seconds this receiver's signing scheme
 * (and Daily's own documented scheme for real signed events) expects — a
 * value that, compared as seconds, is always ~1000x too large to ever
 * fall inside any real replay-tolerance window. It cannot be a real signed
 * event by construction: real events use seconds.
 *
 * isLivenessProbe classifies EXACTLY two shapes as a safe liveness probe:
 *   A. both headers absent entirely (no signature envelope at all), or
 *   B. both headers present, AND the timestamp is non-empty, numeric, an
 *      integer, structurally plausible as Unix milliseconds, and
 *      structurally NOT plausible as Unix seconds.
 * Every other shape (exactly one header, empty/non-numeric/fractional
 * timestamp, numeric garbage matching neither range, or — critically — any
 * plausible-SECONDS timestamp, whether validly signed, staled, or forged)
 * returns false and falls through to full verifyDailyWebhookSignature
 * verification unchanged. A plausible-seconds timestamp is NEVER
 * classified as a liveness probe, even if invalid or stale — only
 * verifyDailyWebhookSignature is allowed to decide that case, exactly as
 * before this change.
 *
 * This function does not inspect the body, User-Agent, or source IP
 * (VIDEO-1B §3 — all attacker-controllable, never used for this decision).
 * It performs no I/O and cannot itself cause any mutation — it only
 * classifies. Critically, a millisecond-shaped timestamp is NEVER
 * normalized/divided and passed on for verification or processing: the
 * caller (the route handler) must return a bare 200 immediately for any
 * request this function classifies true, before reading the body, before
 * verifyDailyWebhookSignature, before processDailyWebhookEvent, before any
 * DB or provider call. An attacker who mimics this exact shape can obtain
 * a 200 — that is accepted and intentional (Daily's own probe can't do
 * better than mimic-able header/timestamp shape either) — but that 200
 * grants no capability: it is a dead end, never a path to any state
 * mutation, because DAILY_WEBHOOK_SECRET is never consulted and no event
 * is ever parsed for a request that takes this path.
 */
const PLAUSIBLE_SECONDS_MIN = 946684800; // 2000-01-01T00:00:00Z
const PLAUSIBLE_SECONDS_MAX = 4102444800; // 2100-01-01T00:00:00Z

export function isLivenessProbe(signatureHeader: string | null, timestampHeader: string | null): boolean {
  // Case A — no signature envelope at all.
  if (signatureHeader === null && timestampHeader === null) return true;

  // Anything else requires BOTH headers present to even be considered for
  // Case B — a single missing header is never liveness, it's rejected by
  // verifyDailyWebhookSignature exactly as before this change.
  if (signatureHeader === null || timestampHeader === null) return false;
  if (timestampHeader.length === 0) return false;

  const value = Number(timestampHeader);
  if (!Number.isFinite(value)) return false;
  if (!Number.isInteger(value)) return false;

  const isPlausibleSeconds = value >= PLAUSIBLE_SECONDS_MIN && value <= PLAUSIBLE_SECONDS_MAX;
  // A plausible-seconds value is NEVER liveness, even if it will go on to
  // fail verification (stale/wrong signature) — only verifyDailyWebhookSignature
  // may reject those; this function must not shortcut that decision.
  if (isPlausibleSeconds) return false;

  const isPlausibleMilliseconds = value >= PLAUSIBLE_SECONDS_MIN * 1000 && value <= PLAUSIBLE_SECONDS_MAX * 1000;
  return isPlausibleMilliseconds;
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
