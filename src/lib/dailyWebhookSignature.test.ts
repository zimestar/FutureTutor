import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";
import {
  verifyDailyWebhookSignature,
  isLivenessProbe,
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

describe("verifyDailyWebhookSignature", () => {
  it("accepts a genuinely valid signature and timestamp within tolerance", () => {
    const rawBody = JSON.stringify({ type: "participant.joined", payload: { room: "ft-abc", user_id: "user-1" } });
    const now = new Date("2026-08-24T12:00:00.000Z");
    const timestampHeader = String(Math.floor(now.getTime() / 1000));
    const signatureHeader = sign(timestampHeader, rawBody);

    expect(() => verifyDailyWebhookSignature({ rawBody, signatureHeader, timestampHeader, now })).not.toThrow();
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

  it("rejects an invalid signature (wrong secret / tampered body) even with a valid timestamp", () => {
    const rawBody = JSON.stringify({ type: "participant.joined", payload: { room: "ft-abc", user_id: "user-1" } });
    const now = new Date("2026-08-24T12:00:00.000Z");
    const timestampHeader = String(Math.floor(now.getTime() / 1000));
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

  it("rejects a stale timestamp beyond the replay-tolerance window", () => {
    const rawBody = "{}";
    const now = new Date("2026-08-24T12:00:00.000Z");
    const staleTimestamp = Math.floor(now.getTime() / 1000) - (DAILY_WEBHOOK_REPLAY_TOLERANCE_SECONDS + 60);
    const timestampHeader = String(staleTimestamp);
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

  it("accepts a timestamp exactly at the tolerance boundary", () => {
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

describe("isLivenessProbe", () => {
  const now = new Date("2026-08-24T12:00:00.000Z");
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const nowMilliseconds = now.getTime();

  it("Case A: both headers absent — true", () => {
    expect(isLivenessProbe(null, null)).toBe(true);
  });

  it("current plausible Unix milliseconds with both headers present — true (the real Daily probe's confirmed shape)", () => {
    expect(isLivenessProbe("some-signature", String(nowMilliseconds))).toBe(true);
  });

  it("only the signature header present — false", () => {
    expect(isLivenessProbe("some-signature", null)).toBe(false);
  });

  it("only the timestamp header present — false", () => {
    expect(isLivenessProbe(null, "1700000000")).toBe(false);
  });

  it("empty-string timestamp with signature present — false", () => {
    expect(isLivenessProbe("some-signature", "")).toBe(false);
  });

  it("non-numeric timestamp with signature present — false", () => {
    expect(isLivenessProbe("some-signature", "not-a-real-timestamp")).toBe(false);
  });

  it("fractional numeric timestamp — false, even at millisecond magnitude", () => {
    expect(isLivenessProbe("some-signature", String(nowMilliseconds + 0.5))).toBe(false);
  });

  it("numeric garbage matching neither the seconds nor milliseconds range — false", () => {
    expect(isLivenessProbe("some-signature", "42")).toBe(false);
  });

  it("plausible Unix SECONDS timestamp — false, even though both headers are present (never shortcuts verifyDailyWebhookSignature's own decision)", () => {
    expect(isLivenessProbe("some-signature", String(nowSeconds))).toBe(false);
  });

  it("a STALE plausible Unix seconds timestamp — still false (liveness classification never depends on staleness, only unit)", () => {
    const staleSeconds = nowSeconds - (DAILY_WEBHOOK_REPLAY_TOLERANCE_SECONDS + 60);
    expect(isLivenessProbe("some-signature", String(staleSeconds))).toBe(false);
  });

  it("empty-string headers (distinct from absent/null) with no timestamp — false", () => {
    expect(isLivenessProbe("", "")).toBe(false);
  });
});
