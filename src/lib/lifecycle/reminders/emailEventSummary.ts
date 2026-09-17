import type { LifecycleEmailEventType } from "@/generated/prisma/enums";

/**
 * LIFECYCLE-1C schema decision §12 — pure summarizer for admin
 * observability. Repeated events of the same type (multiple OPENED/CLICKED
 * occurrences) are legitimate and never deduplicated in the database
 * (LifecycleEmailEvent is strictly append-only) — this function derives
 * first/last timestamps for DISPLAY only, from an already-fetched event
 * list; it never mutates or discards anything.
 */
export interface EmailEventSummary {
  deliveredAt: Date | null;
  firstOpenedAt: Date | null;
  lastOpenedAt: Date | null;
  firstClickedAt: Date | null;
  lastClickedAt: Date | null;
  bouncedAt: Date | null;
  complainedAt: Date | null;
}

export function summarizeEmailEvents(events: readonly { type: LifecycleEmailEventType; occurredAt: Date }[]): EmailEventSummary {
  const summary: EmailEventSummary = {
    deliveredAt: null,
    firstOpenedAt: null,
    lastOpenedAt: null,
    firstClickedAt: null,
    lastClickedAt: null,
    bouncedAt: null,
    complainedAt: null,
  };

  for (const event of events) {
    switch (event.type) {
      case "DELIVERED":
        if (!summary.deliveredAt || event.occurredAt < summary.deliveredAt) summary.deliveredAt = event.occurredAt;
        break;
      case "OPENED":
        if (!summary.firstOpenedAt || event.occurredAt < summary.firstOpenedAt) summary.firstOpenedAt = event.occurredAt;
        if (!summary.lastOpenedAt || event.occurredAt > summary.lastOpenedAt) summary.lastOpenedAt = event.occurredAt;
        break;
      case "CLICKED":
        if (!summary.firstClickedAt || event.occurredAt < summary.firstClickedAt) summary.firstClickedAt = event.occurredAt;
        if (!summary.lastClickedAt || event.occurredAt > summary.lastClickedAt) summary.lastClickedAt = event.occurredAt;
        break;
      case "BOUNCED":
        if (!summary.bouncedAt || event.occurredAt < summary.bouncedAt) summary.bouncedAt = event.occurredAt;
        break;
      case "COMPLAINED":
        if (!summary.complainedAt || event.occurredAt < summary.complainedAt) summary.complainedAt = event.occurredAt;
        break;
      case "SENT":
        break; // already represented by LifecycleReminder.sentAt — no separate summary field
    }
  }

  return summary;
}
