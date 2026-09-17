import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  verifyResendWebhookSignature,
  isResendWebhookSecretConfigured,
  ResendWebhookSecretMissingError,
  ResendWebhookSignatureInvalidError,
} from "@/lib/email/resendWebhookSignature";
import { processResendWebhookEvent } from "@/lib/lifecycle/reminders/emailEventCorrelation";

/**
 * LIFECYCLE-1C — Resend webhook receiver. Mirrors the established shape of
 * every other webhook route in this codebase (stripe/route.ts, daily/
 * route.ts): read the raw body (required for signature verification —
 * nothing upstream may parse it first), verify BEFORE any processing, fail
 * closed on missing config, never leak which specific check failed, never
 * echo any part of the raw provider payload back to the caller.
 *
 * This endpoint receives webhooks for EVERY email the account sends
 * (booking confirmations, password resets, tutor-application emails
 * included) — events that don't correlate to a LifecycleReminder are a
 * normal, expected no-op, not an error (see emailEventCorrelation.ts).
 *
 * Not scheduled/registered with Resend as part of this mission — see
 * docs/lifecycle/LIFECYCLE-1C-EMAIL-ATTRIBUTION.md §27 for the exact
 * manual dashboard steps required before Resend will ever call this route.
 */
const MAX_BODY_BYTES = 1_000_000; // 1MB — generous for a JSON webhook event, bounded per Phase 5's requirement

export async function POST(request: Request) {
  if (!isResendWebhookSecretConfigured()) {
    return NextResponse.json({ error: "RESEND_WEBHOOK_SECRET is not configured" }, { status: 500 });
  }

  const webhookId = request.headers.get("webhook-id");
  const webhookTimestamp = request.headers.get("webhook-timestamp");
  const webhookSignature = request.headers.get("webhook-signature");
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return NextResponse.json({ error: "Invalid webhook request" }, { status: 400 });
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let payload;
  try {
    payload = verifyResendWebhookSignature({ rawBody, headers: request.headers });
  } catch (error) {
    if (error instanceof ResendWebhookSecretMissingError) {
      // Defense in depth only — isResendWebhookSecretConfigured() above
      // already routes this case away; unreachable in normal operation.
      return NextResponse.json({ error: "Webhook receiver is not configured" }, { status: 500 });
    }
    if (error instanceof ResendWebhookSignatureInvalidError) {
      return NextResponse.json({ error: "Invalid webhook request" }, { status: 400 });
    }
    throw error;
  }

  try {
    const result = await processResendWebhookEvent(db, webhookId, payload);
    return NextResponse.json({ received: true, persisted: result.persisted });
  } catch (error) {
    console.error("Resend webhook processing failed", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
