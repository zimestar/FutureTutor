import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { processStripeConnectWebhookEvent } from "@/services/stripeConnectWebhooks";

/**
 * PROD-CONNECT-WEBHOOKV2-1 — dedicated Stripe Connect Accounts v2 webhook,
 * deliberately separate from /api/webhooks/stripe (the existing platform
 * endpoint, unchanged by this route's existence): Stripe requires two
 * separate event destinations to receive both "Your account" events
 * (the existing endpoint) and "Connected accounts" events (this one) — a
 * single destination cannot subscribe to both scopes. Own signing secret
 * (STRIPE_CONNECT_WEBHOOK_SECRET, distinct from STRIPE_WEBHOOK_SECRET —
 * never reused, never shared), own event allowlist, own thin-event parsing
 * (stripe.parseEventNotificationAsync, not stripe.webhooks.constructEventAsync
 * — Accounts v2 events use a genuinely different envelope, confirmed via
 * the installed Stripe SDK's own type definitions). Shares only the
 * downstream claim/idempotency machinery and Connect-status derivation
 * with the platform endpoint, both already certified and unchanged.
 *
 * The Stripe Connected-accounts event destination for this route does not
 * exist yet as of this commit — deploying this code is safe with
 * STRIPE_CONNECT_WEBHOOK_SECRET entirely absent: every request fails
 * closed at the first check below, before any Stripe SDK call, and
 * nothing about the existing platform webhook or application startup
 * depends on this variable being set.
 */
export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "STRIPE_CONNECT_WEBHOOK_SECRET is not configured" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const rawBody = await request.text();

  const stripe = getStripeClient();
  let notification;
  try {
    notification = await stripe.parseEventNotificationAsync(rawBody, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await processStripeConnectWebhookEvent(notification);
  } catch (error) {
    // Sanitized — never the raw notification payload, matching the
    // platform webhook route's own logging convention.
    console.error("Stripe Connect webhook processing failed", notification.id, notification.type, error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
