import { NextResponse } from "next/server";
import {
  verifyDailyWebhookSignature,
  DailyWebhookSecretMissingError,
  DailyWebhookSignatureInvalidError,
  DailyWebhookTimestampInvalidError,
} from "@/lib/dailyWebhookSignature";
import {
  processDailyWebhookEvent,
  MalformedDailyWebhookPayloadError,
  UnsupportedDailyWebhookEventError,
} from "@/services/dailyWebhooks";

/**
 * VIDEO-1B — Daily webhook receiver, subscribed to participant.joined only.
 * Mirrors src/app/api/webhooks/stripe/route.ts's own established shape: a
 * thin handler that reads the raw body (required for signature
 * verification — nothing upstream may parse it, or the signed bytes would
 * no longer match), verifies, then delegates all business logic to a
 * service function. Every rejection path returns a GENERIC error message —
 * never which specific check failed (missing/invalid signature vs. stale
 * timestamp vs. malformed payload are all indistinguishable from the
 * outside) — and never echoes any part of the raw provider payload back to
 * the caller.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-webhook-signature");
  const timestampHeader = request.headers.get("x-webhook-timestamp");

  try {
    verifyDailyWebhookSignature({ rawBody, signatureHeader, timestampHeader });
  } catch (error) {
    if (error instanceof DailyWebhookSecretMissingError) {
      console.error("Daily webhook received but DAILY_WEBHOOK_SECRET is not configured");
      return NextResponse.json({ error: "Webhook receiver is not configured" }, { status: 500 });
    }
    if (error instanceof DailyWebhookSignatureInvalidError || error instanceof DailyWebhookTimestampInvalidError) {
      return NextResponse.json({ error: "Invalid webhook request" }, { status: 400 });
    }
    throw error;
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid webhook request" }, { status: 400 });
  }

  try {
    const result = await processDailyWebhookEvent(event);
    return NextResponse.json({ received: true, handled: result.handled });
  } catch (error) {
    if (error instanceof MalformedDailyWebhookPayloadError || error instanceof UnsupportedDailyWebhookEventError) {
      return NextResponse.json({ error: "Invalid webhook request" }, { status: 400 });
    }
    console.error("Daily webhook processing failed", error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
