import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

// PROD-CONNECT-WEBHOOKV2-1 — route-level coverage for the dedicated
// Accounts v2 Connect webhook. Uses a real (dummy-keyed) Stripe SDK
// instance only to compute/verify signatures (a pure local HMAC operation,
// no network call) — getStripeClient() is mocked to return it so these
// tests exercise genuine Stripe signature-verification math without
// needing a live STRIPE_SECRET_KEY or PAYMENT_MODE configuration.

const CONNECT_SECRET = "whsec_test_connect_0000000000000000000000000000";
const PLATFORM_SECRET = "whsec_test_platform_1111111111111111111111111";

const mocks = vi.hoisted(() => ({
  processStripeConnectWebhookEvent: vi.fn(),
}));

const signer = new Stripe("sk_test_dummy_signing_only_no_network_call");

vi.mock("@/lib/stripe", () => ({ getStripeClient: () => signer }));
vi.mock("@/services/stripeConnectWebhooks", () => ({
  processStripeConnectWebhookEvent: mocks.processStripeConnectWebhookEvent,
  CONNECT_EVENT_ALLOWLIST: new Set(["v2.core.account[requirements].updated"]),
}));

const THIN_PAYLOAD = JSON.stringify({
  id: "evt_v2_route_test_1",
  object: "v2.core.event",
  type: "v2.core.account[requirements].updated",
  created: new Date().toISOString(),
  livemode: true,
  related_object: { id: "acct_test", type: "v2.core.account", url: "/v2/core/accounts/acct_test" },
});

function signedRequest(payload: string, secret: string): Request {
  const signature = signer.webhooks.generateTestHeaderString({ payload, secret });
  return new Request("https://futuretutor.ca/api/webhooks/stripe/connect", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature },
    body: payload,
  });
}

describe("POST /api/webhooks/stripe/connect", () => {
  const originalConnectSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = CONNECT_SECRET;
  });

  afterEach(() => {
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = originalConnectSecret;
  });

  it("1. missing STRIPE_CONNECT_WEBHOOK_SECRET fails closed — 500, no processing attempted, no Stripe SDK call", async () => {
    delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    const { POST } = await import("./route");

    const response = await POST(signedRequest(THIN_PAYLOAD, CONNECT_SECRET));

    expect(response.status).toBe(500);
    expect(mocks.processStripeConnectWebhookEvent).not.toHaveBeenCalled();
  });

  it("2. an invalid signature is rejected — 400, no processing attempted", async () => {
    const { POST } = await import("./route");
    const request = new Request("https://futuretutor.ca/api/webhooks/stripe/connect", {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": "t=1700000000,v1=0000000000000000000000000000000000000000000000000000000000000000" },
      body: THIN_PAYLOAD,
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(mocks.processStripeConnectWebhookEvent).not.toHaveBeenCalled();
  });

  it("3. a validly-signed Connect notification is accepted — 200, dispatched exactly once", async () => {
    const { POST } = await import("./route");

    const response = await POST(signedRequest(THIN_PAYLOAD, CONNECT_SECRET));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(mocks.processStripeConnectWebhookEvent).toHaveBeenCalledTimes(1);
  });

  it("4. the EXISTING platform webhook secret cannot authenticate this endpoint", async () => {
    const { POST } = await import("./route");

    const response = await POST(signedRequest(THIN_PAYLOAD, PLATFORM_SECRET));

    expect(response.status).toBe(400);
    expect(mocks.processStripeConnectWebhookEvent).not.toHaveBeenCalled();
  });
});
