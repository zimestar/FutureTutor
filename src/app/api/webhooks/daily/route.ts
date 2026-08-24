import { NextResponse } from "next/server";
import {
  verifyDailyWebhookSignature,
  isLivenessProbe,
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
 *
 * VIDEO-1B probe-compatibility fix — checked FIRST, on headers alone,
 * before the body is even read: Daily's own POST /webhooks sends a
 * reachability probe to this URL before finalizing a webhook subscription,
 * with a signature envelope that can never be a real signed event (see
 * isLivenessProbe's own doc comment for the full real-provider evidence
 * and exact classification rules). A request classified as a liveness
 * probe gets a bare 200 here and returns immediately — never reaching
 * request.text(), JSON.parse, verifyDailyWebhookSignature,
 * processDailyWebhookEvent, any DB call, or any provider call. Everything
 * else (a genuinely seconds-shaped timestamp, whether validly signed,
 * stale, or forged) falls through unchanged to full verification below.
 */
/**
 * TEMPORARY — VIDEO-1B route-level diagnostic. Real Student/Tutor joins were
 * proven to produce real, correctly-signed Daily webhook deliveries (200
 * responses, confirmed via Railway HTTP logs), yet processDailyWebhookEvent
 * was never reached (no correlation-diagnostic output, no AuditLog entry) —
 * the only known path that returns 200 without ever calling it is
 * isLivenessProbe(...) === true. This logs a single atomic line, BEFORE the
 * branch below, capturing only header presence + the liveness classifier's
 * own boolean result + a coarse timestamp shape label — never a raw header
 * value, never the body, never any payload/room/user_id/token/secret. To be
 * removed once root cause is confirmed.
 */
type DiagnosticTimestampShape = "seconds" | "milliseconds" | "other" | "unknown";

const DIAGNOSTIC_PLAUSIBLE_SECONDS_MIN = 946684800; // 2000-01-01T00:00:00Z
const DIAGNOSTIC_PLAUSIBLE_SECONDS_MAX = 4102444800; // 2100-01-01T00:00:00Z

function classifyDiagnosticTimestampShape(timestampHeader: string | null): DiagnosticTimestampShape {
  if (timestampHeader === null || timestampHeader.length === 0) return "unknown";
  const value = Number(timestampHeader);
  if (!Number.isFinite(value) || !Number.isInteger(value)) return "other";
  if (value >= DIAGNOSTIC_PLAUSIBLE_SECONDS_MIN && value <= DIAGNOSTIC_PLAUSIBLE_SECONDS_MAX) return "seconds";
  if (value >= DIAGNOSTIC_PLAUSIBLE_SECONDS_MIN * 1000 && value <= DIAGNOSTIC_PLAUSIBLE_SECONDS_MAX * 1000) return "milliseconds";
  return "other";
}

export async function POST(request: Request) {
  const signatureHeader = request.headers.get("x-webhook-signature");
  const timestampHeader = request.headers.get("x-webhook-timestamp");

  const livenessProbeResult = isLivenessProbe(signatureHeader, timestampHeader);
  console.log(
    "VIDEO-1B ROUTE DIAGNOSTIC " +
      JSON.stringify({
        hasSignatureHeader: signatureHeader !== null,
        hasTimestampHeader: timestampHeader !== null,
        livenessProbe: livenessProbeResult,
        timestampShape: classifyDiagnosticTimestampShape(timestampHeader),
      })
  );

  if (livenessProbeResult) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const rawBody = await request.text();

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
