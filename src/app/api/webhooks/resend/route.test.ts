import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Webhook } from "standardwebhooks";
import { randomUUID } from "crypto";

// LIFECYCLE-1C — route-level webhook security tests. Mirrors
// src/app/api/webhooks/stripe/route.test.ts's established pattern exactly:
// real Request objects, real (locally-computed, no-network) signatures,
// the DB-touching processing function mocked so this file tests ONLY the
// route's own security/parsing contract.

const SECRET = `whsec_${Buffer.from(randomUUID()).toString("base64")}`;

const mocks = vi.hoisted(() => ({
  processResendWebhookEvent: vi.fn(),
}));

vi.mock("@/lib/lifecycle/reminders/emailEventCorrelation", () => ({
  processResendWebhookEvent: mocks.processResendWebhookEvent,
}));
vi.mock("@/lib/db", () => ({ db: {} }));

function sign(payload: string, secret: string, id = randomUUID()) {
  const wh = new Webhook(secret);
  const timestamp = new Date();
  const signature = wh.sign(id, timestamp, payload);
  return { id, headers: { "webhook-id": id, "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)), "webhook-signature": signature } };
}

function requestWith(payload: string, headers: Record<string, string>): Request {
  return new Request("https://futuretutor.ca/api/webhooks/resend", { method: "POST", headers, body: payload });
}

const PAYLOAD = JSON.stringify({ type: "email.sent", created_at: "2026-09-17T10:00:00.000Z", data: { email_id: "email_test" } });

describe("POST /api/webhooks/resend", () => {
  const originalSecret = process.env.RESEND_WEBHOOK_SECRET;
  const originalApiKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = "re_test_dummy_signing_only_no_network_call";
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
    mocks.processResendWebhookEvent.mockResolvedValue({ persisted: true });
  });

  afterEach(() => {
    process.env.RESEND_WEBHOOK_SECRET = originalSecret;
    process.env.RESEND_API_KEY = originalApiKey;
  });

  it("§1 a validly-signed payload is accepted and forwarded to processing", async () => {
    const { POST } = await import("./route");
    const { headers } = sign(PAYLOAD, SECRET);
    const response = await POST(requestWith(PAYLOAD, headers));
    expect(response.status).toBe(200);
    expect(mocks.processResendWebhookEvent).toHaveBeenCalledTimes(1);
  });

  it("§2 an invalid signature is rejected before processing", async () => {
    const { POST } = await import("./route");
    const { headers } = sign(PAYLOAD, `whsec_${Buffer.from(randomUUID()).toString("base64")}`);
    const response = await POST(requestWith(PAYLOAD, headers));
    expect(response.status).toBe(400);
    expect(mocks.processResendWebhookEvent).not.toHaveBeenCalled();
  });

  it("§3 a missing signature is rejected before processing", async () => {
    const { POST } = await import("./route");
    const response = await POST(requestWith(PAYLOAD, {}));
    expect(response.status).toBe(400);
    expect(mocks.processResendWebhookEvent).not.toHaveBeenCalled();
  });

  it("§4 a missing webhook secret fails closed without ever reading signature headers", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const { POST } = await import("./route");
    const { headers } = sign(PAYLOAD, SECRET);
    const response = await POST(requestWith(PAYLOAD, headers));
    expect(response.status).toBe(500);
    expect(mocks.processResendWebhookEvent).not.toHaveBeenCalled();
  });

  it("§5 a malformed (non-JSON) signed body is rejected safely, not a 500", async () => {
    const { POST } = await import("./route");
    const malformed = "{not valid json";
    const { headers } = sign(malformed, SECRET);
    const response = await POST(requestWith(malformed, headers));
    expect(response.status).toBe(400);
    expect(mocks.processResendWebhookEvent).not.toHaveBeenCalled();
  });

  it("§6 an unknown/out-of-scope but validly-signed event type still reaches processing (which itself safely no-ops) — the route never special-cases event type", async () => {
    const { POST } = await import("./route");
    const unknownEventPayload = JSON.stringify({ type: "contact.created", created_at: "2026-09-17T10:00:00.000Z", data: { id: "c1" } });
    const { headers } = sign(unknownEventPayload, SECRET);
    mocks.processResendWebhookEvent.mockResolvedValueOnce({ persisted: false, reason: "UNKNOWN_EVENT_TYPE" });
    const response = await POST(requestWith(unknownEventPayload, headers));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.persisted).toBe(false);
  });

  it("never echoes any part of the raw request body or secret back in an error response", async () => {
    const { POST } = await import("./route");
    const { headers } = sign(PAYLOAD, `whsec_${Buffer.from(randomUUID()).toString("base64")}`);
    const response = await POST(requestWith(PAYLOAD, headers));
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("email_test");
    expect(JSON.stringify(body)).not.toContain(SECRET);
  });

  it("a processing failure surfaces as 500 without leaking internals", async () => {
    const { POST } = await import("./route");
    mocks.processResendWebhookEvent.mockRejectedValueOnce(new Error("db unavailable: connection string sensitive-detail"));
    const { headers } = sign(PAYLOAD, SECRET);
    const response = await POST(requestWith(PAYLOAD, headers));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("sensitive-detail");
  });
});
