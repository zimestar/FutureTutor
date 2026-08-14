import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { processStripeWebhookEvent } from "@/services/stripeWebhooks";

/**
 * Stripe webhooks are authoritative asynchronous financial events — never
 * trust a client-side redirect/confirmation alone (see
 * verifyAndAuthorizePaymentIntent in src/services/payments.ts for the
 * equally strict rule on the authorization side). The raw request body is
 * required for signature verification, so nothing upstream may parse it —
 * `request.text()` on a Next.js App Router Request gives the exact raw
 * bytes Stripe signed.
 */
export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET is not configured" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const rawBody = await request.text();

  const stripe = getStripeClient();
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await processStripeWebhookEvent(event);
  } catch (error) {
    // Non-2xx so Stripe retries — processStripeWebhookEvent has already
    // recorded this event as FAILED (retryable), never PROCESSED.
    console.error("Stripe webhook processing failed", event.id, event.type, error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
