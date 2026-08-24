import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * VIDEO-1B — Daily webhook authentication. Originally built against Daily's
 * documented scheme (X-Webhook-Signature + a Unix-SECONDS X-Webhook-
 * Timestamp), then extended once a real, genuinely-signed
 * participant.joined delivery was directly observed in staging — via an
 * atomic diagnostic capture, not inference — carrying a Unix-MILLISECONDS
 * timestamp instead. An earlier version of this module treated ANY
 * plausible-milliseconds timestamp as an unconditional liveness no-op,
 * reasoning that only Daily's creation-time reachability probe could ever
 * send one; that assumption is now proven false by the same kind of direct
 * evidence that first established it, and silently swallowed real events.
 *
 * Current model — authentication-first, never unit-based:
 *   - AUTHENTICITY is decided exclusively by HMAC verification. Timestamp
 *     UNIT (seconds vs. milliseconds) is never used to pre-classify a
 *     request as fake/harmless before verification runs.
 *   - A timestamp is accepted in EITHER unit — Daily has been directly
 *     observed sending both (the original documented seconds scheme is
 *     still supported; nothing that worked before stops working).
 *   - The signed HMAC input uses the RAW X-Webhook-Timestamp header string
 *     EXACTLY as received, in whichever unit Daily actually sent — Daily
 *     signs the header value it sent, so normalizing it before computing
 *     the HMAC would break verification for a real millisecond event.
 *   - A normalized epochSeconds value is used ONLY for replay/freshness
 *     comparison against the tolerance window — never for the HMAC input.
 */
export const DAILY_WEBHOOK_REPLAY_TOLERANCE_SECONDS = 5 * 60;

export class DailyWebhookSecretMissingError extends Error {}
export class DailyWebhookSignatureInvalidError extends Error {}
export class DailyWebhookTimestampInvalidError extends Error {}

const PLAUSIBLE_SECONDS_MIN = 946684800; // 2000-01-01T00:00:00Z
const PLAUSIBLE_SECONDS_MAX = 4102444800; // 2100-01-01T00:00:00Z

export type DailyWebhookTimestampUnit = "seconds" | "milliseconds";

export interface ParsedDailyWebhookTimestamp {
  /** The ORIGINAL header string, unmodified — this exact value is what
   * must be used to reconstruct the HMAC input; never re-derive it from
   * epochSeconds, which is a lossy, unit-normalized projection. */
  raw: string;
  unit: DailyWebhookTimestampUnit;
  /** Normalized to seconds regardless of the original unit — used ONLY for
   * freshness/replay-tolerance comparison, never for HMAC input. */
  epochSeconds: number;
}

/**
 * Pure classifier/parser — accepts a timestamp plausible as either Unix
 * SECONDS or Unix MILLISECONDS (year 2000–2100 in either unit) and reports
 * which. Throws DailyWebhookTimestampInvalidError for anything else: empty,
 * non-numeric, fractional (a real Unix timestamp in either unit is always
 * an integer), or numeric garbage outside both plausible ranges. Never
 * inspects the signature or body — a structural check only, run before any
 * cryptographic work.
 */
export function parseDailyWebhookTimestamp(timestampHeader: string): ParsedDailyWebhookTimestamp {
  if (timestampHeader.length === 0) {
    throw new DailyWebhookTimestampInvalidError("Empty X-Webhook-Timestamp header");
  }
  const value = Number(timestampHeader);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new DailyWebhookTimestampInvalidError("Malformed X-Webhook-Timestamp header");
  }
  if (value >= PLAUSIBLE_SECONDS_MIN && value <= PLAUSIBLE_SECONDS_MAX) {
    return { raw: timestampHeader, unit: "seconds", epochSeconds: value };
  }
  if (value >= PLAUSIBLE_SECONDS_MIN * 1000 && value <= PLAUSIBLE_SECONDS_MAX * 1000) {
    return { raw: timestampHeader, unit: "milliseconds", epochSeconds: value / 1000 };
  }
  throw new DailyWebhookTimestampInvalidError("X-Webhook-Timestamp is not a plausible Unix seconds or milliseconds value");
}

function getDailyWebhookSecret(): string {
  const secret = process.env.DAILY_WEBHOOK_SECRET;
  if (!secret) throw new DailyWebhookSecretMissingError("DAILY_WEBHOOK_SECRET is not configured");
  return secret;
}

/** Presence check only — never returns or logs the secret's value. Used by
 * the route handler to decide whether cryptographic verification is even
 * possible before reading the body (see route.ts's doc comment for why the
 * secret-missing case needs different, body-shape-based handling). */
export function isDailyWebhookSecretConfigured(): boolean {
  return Boolean(process.env.DAILY_WEBHOOK_SECRET);
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
 * checks (header presence, timestamp parses/classifies, timestamp within
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

  const parsedTimestamp = parseDailyWebhookTimestamp(input.timestampHeader);

  const now = input.now ?? new Date();
  const driftSeconds = Math.abs(now.getTime() / 1000 - parsedTimestamp.epochSeconds);
  if (driftSeconds > DAILY_WEBHOOK_REPLAY_TOLERANCE_SECONDS) {
    throw new DailyWebhookTimestampInvalidError(
      `X-Webhook-Timestamp outside the ${DAILY_WEBHOOK_REPLAY_TOLERANCE_SECONDS}s replay-tolerance window`
    );
  }

  const secret = getDailyWebhookSecret();
  // CRITICAL: the RAW header string (parsedTimestamp.raw), not a
  // unit-normalized value — Daily computes its own signature over whatever
  // string it actually sent, in whichever unit, so normalizing here would
  // make a real milliseconds-timestamped event's signature unverifiable.
  const signedPayload = `${parsedTimestamp.raw}.${input.rawBody}`;
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
