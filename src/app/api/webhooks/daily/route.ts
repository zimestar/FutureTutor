import { NextResponse } from "next/server";
import {
  verifyDailyWebhookSignature,
  isDailyWebhookSecretConfigured,
  DailyWebhookSecretMissingError,
  DailyWebhookSignatureInvalidError,
  DailyWebhookTimestampInvalidError,
} from "@/lib/dailyWebhookSignature";
import {
  processDailyWebhookEvent,
  isSupportedDailyWebhookEventShape,
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
 * never which specific check failed — and never echoes any part of the raw
 * provider payload back to the caller.
 *
 * VIDEO-1B webhook authentication redesign — a real, genuinely-signed
 * participant.joined delivery was directly observed in staging carrying a
 * Unix-MILLISECONDS X-Webhook-Timestamp (see dailyWebhookSignature.ts's own
 * doc comment for the full evidence trail). An earlier version of this
 * route treated any plausible-milliseconds timestamp as an unconditional
 * liveness no-op, which silently swallowed those real events before they
 * ever reached verification. Authenticity is now decided ONLY by HMAC
 * verification, which accepts either unit — never by timestamp shape alone.
 * Two narrower cases remain, both handled without ever trusting body shape
 * as authorization:
 *   - A bare request (no signature envelope at all) can never carry a real
 *     event under any interpretation — a safe 200 no-op, body never read.
 *   - Daily's own webhook-creation-time reachability probe fires before
 *     this deployment's DAILY_WEBHOOK_SECRET has been configured (the
 *     secret is only revealed in the creation call's own response, taken
 *     and configured here as a separate manual step afterward) — with no
 *     secret, no cryptographic verification is possible, so body SHAPE is
 *     used ONLY to tell a harmless probe from an attempted real event while
 *     unconfigured; a shape that looks like a real event in that state is a
 *     genuine misconfiguration, surfaced as a failure, never processed.
 */
export async function POST(request: Request) {
  const signatureHeader = request.headers.get("x-webhook-signature");
  const timestampHeader = request.headers.get("x-webhook-timestamp");

  // Bare request — no signature envelope at all. The one classification
  // safely made on headers alone, since it can never carry a real event
  // under any interpretation.
  if (signatureHeader === null && timestampHeader === null) {
    return NextResponse.json({ received: true }, { status: 200 });
  }
  // Exactly one header present is never a valid envelope, real or
  // otherwise — reject before reading the body.
  if (signatureHeader === null || timestampHeader === null) {
    return NextResponse.json({ error: "Invalid webhook request" }, { status: 400 });
  }

  const rawBody = await request.text();

  if (!isDailyWebhookSecretConfigured()) {
    let event: unknown;
    try {
      event = JSON.parse(rawBody);
    } catch {
      // Unparseable body while unconfigured — treat as harmless
      // reachability traffic, not an error; nothing here could be a real
      // event if we can't even parse it as JSON.
      return NextResponse.json({ received: true }, { status: 200 });
    }
    if (isSupportedDailyWebhookEventShape(event)) {
      console.error("Daily webhook received but DAILY_WEBHOOK_SECRET is not configured");
      return NextResponse.json({ error: "Webhook receiver is not configured" }, { status: 500 });
    }
    return NextResponse.json({ received: true }, { status: 200 });
  }

  try {
    verifyDailyWebhookSignature({ rawBody, signatureHeader, timestampHeader });
  } catch (error) {
    if (error instanceof DailyWebhookSecretMissingError) {
      // Defense in depth only — isDailyWebhookSecretConfigured() above
      // already routes this case away; unreachable in normal operation.
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
