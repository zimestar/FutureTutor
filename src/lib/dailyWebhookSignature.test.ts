import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";
import {
  verifyDailyWebhookSignature,
  parseDailyWebhookTimestamp,
  isDailyWebhookSecretConfigured,
  DailyWebhookSecretMissingError,
  DailyWebhookSignatureInvalidError,
  DailyWebhookTimestampInvalidError,
  DAILY_WEBHOOK_REPLAY_TOLERANCE_SECONDS,
} from "./dailyWebhookSignature";

// VIDEO-1B — pure unit coverage, no DB, no network. Reimplements Daily's
// documented signing scheme independently (HMAC-SHA256 of
// `${timestamp}.${rawBody}`, base64 secret, base64 signature) to produce
// genuinely valid test fixtures, rather than hard-coding a signature that
// would silently stop testing anything the moment the implementation
// changed.

const TEST_SECRET_BASE64 = Buffer.from("test-daily-webhook-secret-32-bytes!!").toString("base64");

function sign(timestampHeader: string, rawBody: string, secretBase64 = TEST_SECRET_BASE64): string {
  return createHmac("sha256", Buffer.from(secretBase64, "base64"))
    .update(`${timestampHeader}.${rawBody}`)
    .digest("base64");
}

const originalSecret = process.env.DAILY_WEBHOOK_SECRET;

beforeEach(() => {
  process.env.DAILY_WEBHOOK_SECRET = TEST_SECRET_BASE64;
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.DAILY_WEBHOOK_SECRET;
  else process.env.DAILY_WEBHOOK_SECRET = originalSecret;
});

describe("parseDailyWebhookTimestamp", () => {
  const now = new Date("2026-08-24T12:00:00.000Z");
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const nowMilliseconds = now.getTime();

  it("classifies a plausible Unix SECONDS value, raw string preserved unmodified", () => {
    const result = parseDailyWebhookTimestamp(String(nowSeconds));
    expect(result).toEqual({ raw: String(nowSeconds), unit: "seconds", epochSeconds: nowSeconds });
  });

  it("classifies a plausible Unix MILLISECONDS value, epochSeconds correctly divided, raw string preserved unmodified", () => {
    const result = parseDailyWebhookTimestamp(String(nowMilliseconds));
    expect(result).toEqual({ raw: String(nowMilliseconds), unit: "milliseconds", epochSeconds: nowMilliseconds / 1000 });
  });

  it("throws on an empty string", () => {
    expect(() => parseDailyWebhookTimestamp("")).toThrow(DailyWebhookTimestampInvalidError);
  });

  it("throws on a non-numeric value", () => {
    expect(() => parseDailyWebhookTimestamp("not-a-real-timestamp")).toThrow(DailyWebhookTimestampInvalidError);
  });

  it("throws on a fractional value, even at millisecond magnitude", () => {
    expect(() => parseDailyWebhookTimestamp(String(nowMilliseconds + 0.5))).toThrow(DailyWebhookTimestampInvalidError);
  });

  it("throws on numeric garbage matching neither plausible range", () => {
    expect(() => parseDailyWebhookTimestamp("42")).toThrow(DailyWebhookTimestampInvalidError);
  });
});

describe("isDailyWebhookSecretConfigured", () => {
  it("returns true when DAILY_WEBHOOK_SECRET is set", () => {
    expect(isDailyWebhookSecretConfigured()).toBe(true);
  });

  it("returns false when DAILY_WEBHOOK_SECRET is unset", () => {
    delete process.env.DAILY_WEBHOOK_SECRET;
    expect(isDailyWebhookSecretConfigured()).toBe(false);
  });
});

describe("verifyDailyWebhookSignature", () => {
  it("accepts a genuinely valid SECONDS signature and timestamp within tolerance", () => {
    const rawBody = JSON.stringify({ type: "participant.joined", payload: { room: "ft-abc", user_id: "user-1" } });
    const now = new Date("2026-08-24T12:00:00.000Z");
    const timestampHeader = String(Math.floor(now.getTime() / 1000));
    const signatureHeader = sign(timestampHeader, rawBody);

    expect(() => verifyDailyWebhookSignature({ rawBody, signatureHeader, timestampHeader, now })).not.toThrow();
  });

  it("REGRESSION — accepts a genuinely valid MILLISECONDS signature, HMAC computed from the RAW millisecond header string (the real, directly-observed production shape)", () => {
    const rawBody = JSON.stringify({ type: "participant.joined", payload: { room: "ft-abc", user_id: "user-1" } });
    const now = new Date("2026-08-24T12:00:00.000Z");
    const timestampHeader = String(now.getTime()); // milliseconds
    const signatureHeader = sign(timestampHeader, rawBody); // HMAC over the raw millisecond string — never normalized to seconds

    expect(() => verifyDailyWebhookSignature({ rawBody, signatureHeader, timestampHeader, now })).not.toThrow();
  });

  it("rejects a milliseconds timestamp signed as if it had been normalized to seconds (proves normalization would break real verification)", () => {
    const rawBody = "{}";
    const now = new Date("2026-08-24T12:00:00.000Z");
    const timestampHeader = String(now.getTime()); // milliseconds header, as Daily actually sends
    const normalizedSeconds = String(Math.floor(now.getTime() / 1000));
    const signatureHeader = sign(normalizedSeconds, rawBody); // wrongly signed against the normalized value

    expect(() => verifyDailyWebhookSignature({ rawBody, signatureHeader, timestampHeader, now })).toThrow(
      DailyWebhookSignatureInvalidError
    );
  });

  it("rejects a missing signature header", () => {
    expect(() =>
      verifyDailyWebhookSignature({ rawBody: "{}", signatureHeader: null, timestampHeader: "1700000000" })
    ).toThrow(DailyWebhookSignatureInvalidError);
  });

  it("rejects a missing timestamp header", () => {
    expect(() =>
      verifyDailyWebhookSignature({ rawBody: "{}", signatureHeader: "anything", timestampHeader: null })
    ).toThrow(DailyWebhookTimestampInvalidError);
  });

  it("rejects a malformed (non-numeric) timestamp header", () => {
    expect(() =>
      verifyDailyWebhookSignature({ rawBody: "{}", signatureHeader: "anything", timestampHeader: "not-a-number" })
    ).toThrow(DailyWebhookTimestampInvalidError);
  });

  it("rejects numeric garbage matching neither plausible seconds nor milliseconds range", () => {
    expect(() =>
      verifyDailyWebhookSignature({ rawBody: "{}", signatureHeader: "anything", timestampHeader: "42" })
    ).toThrow(DailyWebhookTimestampInvalidError);
  });

  it("rejects an invalid SECONDS signature (wrong secret / tampered body) even with a valid timestamp", () => {
    const rawBody = JSON.stringify({ type: "participant.joined", payload: { room: "ft-abc", user_id: "user-1" } });
    const now = new Date("2026-08-24T12:00:00.000Z");
    const timestampHeader = String(Math.floor(now.getTime() / 1000));
    const signatureHeader = sign(timestampHeader, rawBody, Buffer.from("a-completely-different-secret!!").toString("base64"));

    expect(() => verifyDailyWebhookSignature({ rawBody, signatureHeader, timestampHeader, now })).toThrow(
      DailyWebhookSignatureInvalidError
    );
  });

  it("rejects an invalid MILLISECONDS signature (wrong secret / tampered body) even with a valid timestamp", () => {
    const rawBody = JSON.stringify({ type: "participant.joined", payload: { room: "ft-abc", user_id: "user-1" } });
    const now = new Date("2026-08-24T12:00:00.000Z");
    const timestampHeader = String(now.getTime());
    const signatureHeader = sign(timestampHeader, rawBody, Buffer.from("a-completely-different-secret!!").toString("base64"));

    expect(() => verifyDailyWebhookSignature({ rawBody, signatureHeader, timestampHeader, now })).toThrow(
      DailyWebhookSignatureInvalidError
    );
  });

  it("rejects a tampered body that no longer matches the signature", () => {
    const originalBody = JSON.stringify({ type: "participant.joined", payload: { room: "ft-abc", user_id: "user-1" } });
    const tamperedBody = JSON.stringify({ type: "participant.joined", payload: { room: "ft-abc", user_id: "attacker-controlled" } });
    const now = new Date("2026-08-24T12:00:00.000Z");
    const timestampHeader = String(Math.floor(now.getTime() / 1000));
    const signatureHeader = sign(timestampHeader, originalBody);

    expect(() =>
      verifyDailyWebhookSignature({ rawBody: tamperedBody, signatureHeader, timestampHeader, now })
    ).toThrow(DailyWebhookSignatureInvalidError);
  });

  it("rejects a signature with a mismatched length (never crashes on timingSafeEqual)", () => {
    expect(() =>
      verifyDailyWebhookSignature({
        rawBody: "{}",
        signatureHeader: Buffer.from("short").toString("base64"),
        timestampHeader: String(Math.floor(Date.now() / 1000)),
      })
    ).toThrow(DailyWebhookSignatureInvalidError);
  });

  it("rejects a stale SECONDS timestamp beyond the replay-tolerance window", () => {
    const rawBody = "{}";
    const now = new Date("2026-08-24T12:00:00.000Z");
    const staleTimestamp = Math.floor(now.getTime() / 1000) - (DAILY_WEBHOOK_REPLAY_TOLERANCE_SECONDS + 60);
    const timestampHeader = String(staleTimestamp);
    const signatureHeader = sign(timestampHeader, rawBody);

    expect(() => verifyDailyWebhookSignature({ rawBody, signatureHeader, timestampHeader, now })).toThrow(
      DailyWebhookTimestampInvalidError
    );
  });

  it("rejects a stale MILLISECONDS timestamp beyond the replay-tolerance window, even with an otherwise-correct signature", () => {
    const rawBody = "{}";
    const now = new Date("2026-08-24T12:00:00.000Z");
    const staleMs = now.getTime() - (DAILY_WEBHOOK_REPLAY_TOLERANCE_SECONDS + 60) * 1000;
    const timestampHeader = String(staleMs);
    const signatureHeader = sign(timestampHeader, rawBody);

    expect(() => verifyDailyWebhookSignature({ rawBody, signatureHeader, timestampHeader, now })).toThrow(
      DailyWebhookTimestampInvalidError
    );
  });

  it("rejects a future timestamp beyond the replay-tolerance window (clock-skew abuse, not just replay)", () => {
    const rawBody = "{}";
    const now = new Date("2026-08-24T12:00:00.000Z");
    const futureTimestamp = Math.floor(now.getTime() / 1000) + (DAILY_WEBHOOK_REPLAY_TOLERANCE_SECONDS + 60);
    const timestampHeader = String(futureTimestamp);
    const signatureHeader = sign(timestampHeader, rawBody);

    expect(() => verifyDailyWebhookSignature({ rawBody, signatureHeader, timestampHeader, now })).toThrow(
      DailyWebhookTimestampInvalidError
    );
  });

  it("accepts a SECONDS timestamp exactly at the tolerance boundary", () => {
    const rawBody = "{}";
    const now = new Date("2026-08-24T12:00:00.000Z");
    const boundaryTimestamp = Math.floor(now.getTime() / 1000) - DAILY_WEBHOOK_REPLAY_TOLERANCE_SECONDS;
    const timestampHeader = String(boundaryTimestamp);
    const signatureHeader = sign(timestampHeader, rawBody);

    expect(() => verifyDailyWebhookSignature({ rawBody, signatureHeader, timestampHeader, now })).not.toThrow();
  });

  it("throws DailyWebhookSecretMissingError when DAILY_WEBHOOK_SECRET is unset, never crashing raw", () => {
    delete process.env.DAILY_WEBHOOK_SECRET;
    const rawBody = "{}";
    const timestampHeader = String(Math.floor(Date.now() / 1000));
    expect(() =>
      verifyDailyWebhookSignature({ rawBody, signatureHeader: "anything", timestampHeader })
    ).toThrow(DailyWebhookSecretMissingError);
  });
});
