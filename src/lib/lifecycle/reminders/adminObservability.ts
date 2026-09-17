import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import type { LifecycleJourney } from "../types";
import { summarizeEmailEvents } from "./emailEventSummary";
import type { LifecycleReminderRow } from "@/components/admin/LifecycleSummaryCard";

/**
 * LIFECYCLE-1C — shared loader for the three admin detail pages (Tutor/
 * Parent/Student), so all three fetch and shape LifecycleReminder +
 * LifecycleEmailEvent rows identically rather than triplicating the query.
 * Read-only; no mutation path.
 */
export async function loadAdminReminderRows(client: PrismaClient, subjectId: string, journey: LifecycleJourney): Promise<LifecycleReminderRow[]> {
  const reminders = await client.lifecycleReminder.findMany({
    where: { subjectId, journey },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { emailEvents: { select: { type: true, occurredAt: true } } },
  });

  return reminders.map((r) => ({
    id: r.id,
    reminderNumber: r.reminderNumber,
    status: r.status,
    relationship: r.relationship,
    sentAt: r.sentAt,
    lastAttemptAt: r.lastAttemptAt,
    createdAt: r.createdAt,
    emailEvents: summarizeEmailEvents(r.emailEvents),
  }));
}
