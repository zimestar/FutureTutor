import "server-only";
import type { WebhookEventPayload } from "resend";
import { getResendClient } from "./resendClient";

/**
 * LIFECYCLE-1C Phase 5/15 — mirrors src/lib/dailyWebhookSignature.ts's
 * established shape exactly (typed error classes, a config-check helper
 * the route checks before even reading the body, fail closed on a missing
 * secret). Uses Resend's own OFFICIAL, already-installed verification
 * mechanism (`resend.webhooks.verify`, built on the Standard Webhooks spec
 * via the `standardwebhooks` package already present as a resend
 * dependency) — no hand-rolled HMAC.
 */

export class ResendWebhookSecretMissingError extends Error {}
export class ResendWebhookSignatureInvalidError extends Error {}

export function isResendWebhookSecretConfigured(): boolean {
  return Boolean(process.env.RESEND_WEBHOOK_SECRET);
}

/**
 * `resend.webhooks.verify()`'s `headers` option is NOT the DOM `Headers`
 * class — the SDK defines its own same-named `{ id, timestamp, signature }`
 * shape (see node_modules/resend/dist/src/webhooks/webhooks.d.ts) plucked
 * from the Standard Webhooks `webhook-id`/`webhook-timestamp`/
 * `webhook-signature` headers. The caller passes the real, standard
 * `Headers` instance from the incoming Request; this function extracts the
 * three required values itself.
 */
export function verifyResendWebhookSignature(params: { rawBody: string; headers: Headers }): WebhookEventPayload {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    throw new ResendWebhookSecretMissingError("RESEND_WEBHOOK_SECRET is not configured");
  }

  const id = params.headers.get("webhook-id");
  const timestamp = params.headers.get("webhook-timestamp");
  const signature = params.headers.get("webhook-signature");
  if (!id || !timestamp || !signature) {
    throw new ResendWebhookSignatureInvalidError("Missing required webhook signature headers");
  }

  const resend = getResendClient();
  try {
    return resend.webhooks.verify({ payload: params.rawBody, headers: { id, timestamp, signature }, webhookSecret: secret });
  } catch (error) {
    throw new ResendWebhookSignatureInvalidError(error instanceof Error ? error.message : "Invalid webhook signature");
  }
}
