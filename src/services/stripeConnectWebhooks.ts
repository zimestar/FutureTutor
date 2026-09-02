import "server-only";
import type Stripe from "stripe";
import { claimAndProcessWebhookEvent } from "@/services/stripeWebhooks";
import { syncTutorConnectStatusFromAccountId } from "@/services/stripeConnect";

/**
 * PROD-CONNECT-WEBHOOKV2-1 — the exact, minimal Accounts v2 Connect event
 * allowlist FutureTutor's Connect readiness derivation actually depends on.
 *
 * v2.core.account.updated is deliberately excluded: Stripe's own SDK
 * documentation states it fires "only for updates to top-level properties,
 * such as dashboard or display_name, that don't trigger one of the more
 * specific update events" (docs.stripe.com/connect/accounts-v2/migrate-integration)
 * — neither of which deriveTutorStripeConnectStatus reads.
 *
 * Person, identity, customer-configuration, merchant-configuration, and
 * defaults events are excluded for the same reason: FutureTutor's
 * recipient/payout readiness derivation never reads any field they
 * represent — subscribing to them would only widen the event surface and
 * data collected for no readiness benefit.
 *
 * The three kept events are exactly what changes when a tutor's payout
 * readiness genuinely changes: the recipient configuration itself, its
 * capability status specifically (the most direct signal for
 * capabilities.transfers), and requirements (currently_due/past_due).
 */
export const CONNECT_EVENT_ALLOWLIST: ReadonlySet<string> = new Set([
  "v2.core.account[configuration.recipient].updated",
  "v2.core.account[configuration.recipient].capability_status_updated",
  "v2.core.account[requirements].updated",
]);

/**
 * These three notification types are the only ones this module ever acts
 * on (CONNECT_EVENT_ALLOWLIST above), and all three are confirmed — by
 * reading the installed Stripe SDK's own type definitions
 * (node_modules/stripe/cjs/resources/V2/Core/Events.d.ts) directly, not
 * assumed — to carry `related_object: { id, type, url }` pointing at the
 * v2 Account the event concerns. Accounts v2 thin events carry no embedded
 * resource data (unlike v1's snapshot payload) — this id is the only thing
 * safely extractable from the notification itself; the actual account
 * state must always be separately fetched (syncTutorConnectStatusFromAccountId).
 */
function extractRelatedAccountId(notification: Stripe.V2.Core.EventNotification): string | null {
  if (!CONNECT_EVENT_ALLOWLIST.has(notification.type)) return null;
  const relatedObject = (notification as unknown as { related_object?: { id?: unknown } }).related_object;
  return typeof relatedObject?.id === "string" ? relatedObject.id : null;
}

/**
 * The Accounts v2 Connect webhook's entry point — called only after the
 * route handler has verified the notification's signature against the
 * dedicated STRIPE_CONNECT_WEBHOOK_SECRET. Reuses the exact same claim/
 * idempotency machinery as the platform webhook (claimAndProcessWebhookEvent)
 * and the exact same certified fetch+derive+persist primitive
 * (syncTutorConnectStatusFromAccountId) — no second, divergent definition
 * of Connect readiness is introduced here.
 *
 * Unapproved event types and malformed/unresolvable related_object ids are
 * both safe no-ops (never throw, never mutate) — an event this module
 * doesn't act on is acknowledged, not treated as an error, matching the
 * platform webhook's own `default: return;` convention for event types it
 * doesn't subscribe to.
 */
export async function processStripeConnectWebhookEvent(notification: Stripe.V2.Core.EventNotification): Promise<void> {
  const accountId = extractRelatedAccountId(notification);
  if (!accountId) return;

  await claimAndProcessWebhookEvent(notification.id, notification.type, async () => {
    await syncTutorConnectStatusFromAccountId(accountId);
  });
}
