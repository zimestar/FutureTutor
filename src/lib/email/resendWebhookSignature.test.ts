import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Webhook } from "standardwebhooks";
import { randomUUID } from "crypto";
import {
  verifyResendWebhookSignature,
  isResendWebhookSecretConfigured,
  ResendWebhookSecretMissingError,
  ResendWebhookSignatureInvalidError,
} from "./resendWebhookSignature";

// LIFECYCLE-1C Phase 5/15 — offline, no-network signature verification
// tests. resend.webhooks.verify() performs pure local HMAC verification
// (Standard Webhooks spec) — no API call is made, so this is fully testable
// with a fabricated secret and no real Resend account, mirroring
// stripe/route.test.ts's own established "sign locally with a test helper,
// verify with the real verification path" pattern.

const SECRET = `whsec_${Buffer.from(randomUUID()).toString("base64")}`;
const PAYLOAD = JSON.stringify({ type: "email.sent", created_at: "2026-09-17T10:00:00.000Z", data: { email_id: "email_test" } });

function sign(payload: string, secret: string, id = randomUUID(), timestamp = new Date()) {
  const wh = new Webhook(secret);
  const signature = wh.sign(id, timestamp, payload);
  const headers = new Headers({
    "webhook-id": id,
    "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    "webhook-signature": signature,
  });
  return headers;
}

describe("resendWebhookSignature", () => {
  const originalSecret = process.env.RESEND_WEBHOOK_SECRET;
  const originalApiKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_dummy_signing_only_no_network_call";
  });

  afterEach(() => {
    process.env.RESEND_WEBHOOK_SECRET = originalSecret;
    process.env.RESEND_API_KEY = originalApiKey;
  });

  it("§1 a validly-signed payload with the correct secret is accepted", () => {
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
    const headers = sign(PAYLOAD, SECRET);
    const result = verifyResendWebhookSignature({ rawBody: PAYLOAD, headers });
    expect(result.type).toBe("email.sent");
  });

  it("§2 an invalid signature (wrong secret) is rejected", () => {
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
    const wrongSecret = `whsec_${Buffer.from(randomUUID()).toString("base64")}`;
    const headers = sign(PAYLOAD, wrongSecret);
    expect(() => verifyResendWebhookSignature({ rawBody: PAYLOAD, headers })).toThrow(ResendWebhookSignatureInvalidError);
  });

  it("§3 missing signature headers are rejected", () => {
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
    const headers = new Headers();
    expect(() => verifyResendWebhookSignature({ rawBody: PAYLOAD, headers })).toThrow(ResendWebhookSignatureInvalidError);
  });

  it("§4 a missing webhook secret fails closed", () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    expect(isResendWebhookSecretConfigured()).toBe(false);
    const headers = sign(PAYLOAD, SECRET);
    expect(() => verifyResendWebhookSignature({ rawBody: PAYLOAD, headers })).toThrow(ResendWebhookSecretMissingError);
  });

  it("§5 a malformed/tampered payload (signature computed over different bytes) is rejected safely, never throws an unrelated error", () => {
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
    const headers = sign(PAYLOAD, SECRET);
    const tamperedPayload = PAYLOAD.replace("email.sent", "email.clicked");
    expect(() => verifyResendWebhookSignature({ rawBody: tamperedPayload, headers })).toThrow(ResendWebhookSignatureInvalidError);
  });

  it("never throws a raw/unwrapped error type — every failure is one of the two typed errors", () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    try {
      verifyResendWebhookSignature({ rawBody: PAYLOAD, headers: new Headers() });
      expect.fail("expected a throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ResendWebhookSecretMissingError);
    }
  });
});
