import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

// PROD-CONNECT-WEBHOOKV2-1 — the mirror half of the secret-isolation proof
// (see connect/route.test.ts for the other direction): a signature
// generated with the dedicated Connect webhook secret must NOT authenticate
// against this, the existing platform endpoint's, secret. No prior
// route-level test file existed for this endpoint (only service-level
// coverage in stripeWebhooks.test.ts) — this file is scoped narrowly to
// the isolation proof, not a general re-test of platform business logic.

const PLATFORM_SECRET = "whsec_test_platform_1111111111111111111111111";
const CONNECT_SECRET = "whsec_test_connect_0000000000000000000000000000";

const mocks = vi.hoisted(() => ({
  processStripeWebhookEvent: vi.fn(),
}));

const signer = new Stripe("sk_test_dummy_signing_only_no_network_call");

vi.mock("@/lib/stripe", () => ({ getStripeClient: () => signer }));
vi.mock("@/services/stripeWebhooks", () => ({ processStripeWebhookEvent: mocks.processStripeWebhookEvent }));

const V1_PAYLOAD = JSON.stringify({
  id: "evt_v1_route_test_1",
  object: "event",
  type: "account.updated",
  data: { object: { id: "acct_test", object: "account" } },
});

function signedRequest(payload: string, secret: string): Request {
  const signature = signer.webhooks.generateTestHeaderString({ payload, secret });
  return new Request("https://futuretutor.ca/api/webhooks/stripe", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature },
    body: payload,
  });
}

describe("POST /api/webhooks/stripe — secret isolation", () => {
  const originalPlatformSecret = process.env.STRIPE_WEBHOOK_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = PLATFORM_SECRET;
  });

  afterEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = originalPlatformSecret;
  });

  it("a validly-signed platform event with the correct platform secret is accepted", async () => {
    const { POST } = await import("./route");

    const response = await POST(signedRequest(V1_PAYLOAD, PLATFORM_SECRET));

    expect(response.status).toBe(200);
    expect(mocks.processStripeWebhookEvent).toHaveBeenCalledTimes(1);
  });

  it("5. the dedicated Connect webhook secret cannot authenticate the platform endpoint", async () => {
    const { POST } = await import("./route");

    const response = await POST(signedRequest(V1_PAYLOAD, CONNECT_SECRET));

    expect(response.status).toBe(400);
    expect(mocks.processStripeWebhookEvent).not.toHaveBeenCalled();
  });
});
