import { NextResponse } from "next/server";
import {
  verifyDailyWebhookSignature,
  isBareReachabilityProbe,
  classifyDiagnosticTimestampShape,
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
 * before the body is even read: Daily's own POST /webhooks sends an
 * unsigned reachability probe to this URL before finalizing a webhook
 * subscription (see isBareReachabilityProbe's own doc comment for the
 * real-provider evidence). A request presenting NEITHER signature header
 * gets a bare 200 here and returns immediately — never reaching
 * request.text(), JSON.parse, processDailyWebhookEvent, any DB call, or
 * any provider call. This is the ONLY new behavior: a request presenting
 * exactly one header, or both but invalid, still falls through to
 * verifyDailyWebhookSignature below and is rejected exactly as before.
 */
export async function POST(request: Request) {
  const signatureHeader = request.headers.get("x-webhook-signature");
  const timestampHeader = request.headers.get("x-webhook-timestamp");
  const rawBody = await request.text();

  // VIDEO-1B — TEMPORARY diagnostic (to be removed once Daily's real
  // creation-time probe shape is confirmed; see the probe-shape mission).
  // Logs ONLY: header presence booleans, the body's top-level "type" field,
  // and a SHAPE classification of the timestamp header (numeric? integer?
  // plausible seconds vs. milliseconds range? within replay tolerance?) via
  // classifyDiagnosticTimestampShape — never the raw or parsed timestamp
  // value itself, never a header value, never the body. This is purely
  // observational — it changes no status-code behavior and precedes the
  // exact same classification/verification logic that already existed.
  //
  // Logged as ONE pre-serialized string, not an object passed as a second
  // console.log argument — a prior attempt using the object form was
  // pretty-printed across multiple lines by the runtime and fragmented by
  // Railway's log pipeline (adjacent near-simultaneous log entries lost
  // trailing lines), making one specific real-probe capture ambiguous.
  // JSON.stringify + a single string argument makes fragmentation
  // structurally impossible — there is exactly one line to fragment.
  let diagnosticEventType: string | null = null;
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (typeof parsed === "object" && parsed !== null && "type" in parsed && typeof (parsed as { type: unknown }).type === "string") {
      diagnosticEventType = (parsed as { type: string }).type;
    }
  } catch {
    // Body did not parse as JSON — diagnosticEventType stays null. Never
    // logged, never inspected further here.
  }
  console.log(
    "VIDEO-1B DIAGNOSTIC " +
      JSON.stringify({
        hasSignatureHeader: signatureHeader !== null,
        hasTimestampHeader: timestampHeader !== null,
        eventType: diagnosticEventType,
        ...classifyDiagnosticTimestampShape(timestampHeader),
      })
  );

  if (isBareReachabilityProbe(signatureHeader, timestampHeader)) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

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
