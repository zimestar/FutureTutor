import "server-only";
import { db } from "@/lib/db";
import { emitAdminAlert, dispatchAdminAlerts } from "@/services/adminAlerts";
import { loadTutorPipeline } from "@/services/tutorPipelineQueue";
import { DIGEST_THRESHOLD_DAYS } from "@/lib/tutorPipeline/pipelineQueue";
import type { DigestItem } from "@/lib/email/adminAlertEmailContent";

/**
 * TUTOR-PIPELINE1 — the daily "what is waiting for the team" email.
 *
 * Lists every application the team has had to act on for at least
 * DIGEST_THRESHOLD_DAYS, oldest first. At most one digest per UTC day
 * (dedupeKey "tutorPipelineDigest:<date>"), so an extra cron run is a
 * no-op. Each run also retries admin alert emails that failed earlier.
 */

const MAX_DIGEST_ITEMS = 50;

export interface DigestRunResult {
  waitingItems: number;
  digestRecorded: boolean;
  sent: number;
  failed: number;
}

export async function runTutorPipelineDigest(now: Date = new Date()): Promise<DigestRunResult> {
  const pipeline = await loadTutorPipeline(now);
  const waiting = pipeline
    .filter((entry) => entry.owner === "admin" && entry.waitingDays >= DIGEST_THRESHOLD_DAYS)
    .sort((a, b) => b.waitingDays - a.waitingDays);

  let digestRecorded = false;
  if (waiting.length > 0) {
    const items: DigestItem[] = waiting.slice(0, MAX_DIGEST_ITEMS).map((entry) => ({
      tutorName: entry.tutorName || entry.email,
      status: entry.status,
      waitingDays: entry.waitingDays,
      nextAction: entry.nextAction,
    }));
    const day = now.toISOString().slice(0, 10);
    await db.$transaction((tx) =>
      emitAdminAlert(tx, {
        event: "TUTOR_PIPELINE_DIGEST",
        dedupeKey: `tutorPipelineDigest:${day}`,
        tutorProfileId: null,
        detail: { items: items.map((item) => ({ ...item })) },
        inAppTitle: "Applications waiting for the team",
        inAppBody: `${waiting.length} tutor application(s) have been waiting for the team for ${DIGEST_THRESHOLD_DAYS} days or more.`,
      })
    );
    digestRecorded = true;
  }

  const { sent, failed } = await dispatchAdminAlerts();
  return { waitingItems: waiting.length, digestRecorded, sent, failed };
}
