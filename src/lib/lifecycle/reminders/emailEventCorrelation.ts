import "server-only";
import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import type { LifecycleEmailEventType } from "@/generated/prisma/enums";
import type { WebhookEvent, WebhookEventPayload } from "resend";
import { validateClickLink } from "./clickLinkValidation";

/**
 * LIFECYCLE-1C — deterministic provider-event correlation and processing.
 * Resend fires webhooks for EVERY email the account sends (booking
 * confirmations, password resets, tutor-application emails included), not
 * just lifecycle reminders — an event that doesn't correlate to a
 * LifecycleReminder is simply not this table's concern, not an error.
 */

/** Only these six Resend event types are ever persisted. Every other
 * WebhookEvent value (email.scheduled, email.delivery_delayed,
 * email.received, email.failed, email.suppressed, every contact-, domain-,
 * and suppression-prefixed event) is recognized-but-out-of-scope — safely
 * ignored, never thrown on, never a schema-breaking surprise when Resend
 * adds a new event type. */
const RESEND_EVENT_TYPE_MAP: Partial<Record<WebhookEvent, LifecycleEmailEventType>> = {
  "email.sent": "SENT",
  "email.delivered": "DELIVERED",
  "email.opened": "OPENED",
  "email.clicked": "CLICKED",
  "email.bounced": "BOUNCED",
  "email.complained": "COMPLAINED",
};

export function mapResendEventType(type: WebhookEvent): LifecycleEmailEventType | null {
  return RESEND_EVENT_TYPE_MAP[type] ?? null;
}

export type CorrelationResult =
  | { matched: true; lifecycleReminderId: string }
  | { matched: false; reason: "NO_MATCH" | "AMBIGUOUS_MATCH" };

/**
 * `event.data.email_id` -> `LifecycleReminder.providerMessageId`. Uses
 * `findMany`, never `findFirst`/`findUnique` — the index on
 * `providerMessageId` supports the lookup but enforces no uniqueness
 * (deliberately not added without evidence — see the schema decision's
 * PROVIDER MESSAGE ID UNIQUENESS AUDIT). More than one match is ambiguous
 * and is never arbitrarily resolved by picking a row — it fails closed,
 * identically to zero matches.
 */
export async function correlateProviderMessage(client: PrismaClient, providerMessageId: string): Promise<CorrelationResult> {
  const matches = await client.lifecycleReminder.findMany({ where: { providerMessageId }, select: { id: true } });
  if (matches.length === 0) return { matched: false, reason: "NO_MATCH" };
  if (matches.length > 1) return { matched: false, reason: "AMBIGUOUS_MATCH" };
  return { matched: true, lifecycleReminderId: matches[0].id };
}

/**
 * Narrow, explicitly-allowlisted metadata ONLY — never a raw payload dump,
 * never email/name/IP/user-agent/subject/from address. CLICKED keeps only
 * a validated link (omitted entirely if validation fails — the unsafe
 * value itself is never stored, though the CLICKED fact still is, via the
 * caller). BOUNCED keeps only the two categorical fields, never the
 * free-text `message`. Every other type carries no metadata.
 */
export function buildEventMetadata(type: LifecycleEmailEventType, payload: WebhookEventPayload): Prisma.InputJsonValue | undefined {
  if (type === "CLICKED" && payload.type === "email.clicked") {
    const link = payload.data.click?.link;
    const validated = link ? validateClickLink(link) : null;
    return validated ? { link: validated } : undefined;
  }
  if (type === "BOUNCED" && payload.type === "email.bounced") {
    const bounce = payload.data.bounce;
    return bounce ? { bounceType: bounce.type, bounceSubType: bounce.subType } : undefined;
  }
  return undefined;
}

export interface ProcessResendWebhookEventResult {
  persisted: boolean;
  reason?: "UNKNOWN_EVENT_TYPE" | "NO_MATCH" | "AMBIGUOUS_MATCH" | "DUPLICATE";
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}

/**
 * The single entry point the webhook route calls after signature
 * verification. `providerEventId` is the Standard Webhooks "webhook-id"
 * header — the sole idempotency key (`@@unique([providerEventId])` on
 * LifecycleEmailEvent). A retried/concurrent delivery of the exact same
 * event hits the unique constraint and is treated as success, never a
 * duplicate row — mirrors the already-proven insert-then-catch-P2002-as-
 * already-handled webhook-idempotency pattern already used elsewhere in
 * this codebase's own webhook receivers (never "check then insert").
 */
export async function processResendWebhookEvent(client: PrismaClient, providerEventId: string, payload: WebhookEventPayload): Promise<ProcessResendWebhookEventResult> {
  const internalType = mapResendEventType(payload.type);
  if (!internalType) return { persisted: false, reason: "UNKNOWN_EVENT_TYPE" };

  // Narrows payload.data to the BaseEmailEventData-shaped branch — every
  // mapped internalType corresponds to an "email.*" event (mapResendEventType's
  // own map only ever returns non-null for those), but TypeScript can't
  // correlate that across the two functions, so this runtime check does
  // double duty: real safety (contact.*/domain.*/suppression.* events never
  // reach here with a mapped internalType, but the check is cheap
  // insurance) and type narrowing.
  if (!("email_id" in payload.data)) return { persisted: false, reason: "UNKNOWN_EVENT_TYPE" };
  const emailId = payload.data.email_id;
  const correlation = await correlateProviderMessage(client, emailId);
  if (!correlation.matched) return { persisted: false, reason: correlation.reason };

  const metadata = buildEventMetadata(internalType, payload);

  try {
    await client.lifecycleEmailEvent.create({
      data: {
        lifecycleReminderId: correlation.lifecycleReminderId,
        providerEventId,
        providerMessageId: emailId,
        type: internalType,
        occurredAt: new Date(payload.created_at),
        metadata,
      },
    });
    return { persisted: true };
  } catch (error) {
    if (isUniqueConstraintViolation(error)) return { persisted: false, reason: "DUPLICATE" };
    throw error;
  }
}
