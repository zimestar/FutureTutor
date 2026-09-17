import { NextResponse } from "next/server";
import { discoverAndClaimDueReminders, processPendingReminder } from "@/services/lifecycleReminders";
import { resolveSendLifecycleReminderEmail } from "@/lib/email/sendLifecycleReminderEmail";

/**
 * LIFECYCLE-1B — same shared-secret liveness-sweep pattern as every other
 * cron route in this codebase (session-notifications-tick, session-noshow-
 * tick, quick-match-tick, payments-tick). This repo has no built-in
 * scheduler — this route must be invoked periodically by an external
 * trigger.
 *
 * MISSION SAFETY (LIFECYCLE-1B): per the mission's absolute production
 * safety constraints, this route is deployed strictly UNSCHEDULED — no
 * Railway cron trigger is wired to it, and LIFECYCLE_REMINDERS_CRON_SECRET
 * is deliberately left UNSET in every Railway environment as an additional
 * fail-closed layer beyond "unscheduled": even a stray manual invocation
 * without the secret returns 500 and touches nothing. Activation (setting
 * the secret AND wiring a schedule) requires a separate, explicit, future
 * owner authorization — not part of this mission.
 *
 * Fail-safe / bounded / idempotent by construction: discoverAndClaimDueReminders
 * takes a bounded `limit` (default 50), each claim is a single-row atomic
 * insert guarded by LifecycleReminder's own unique dedupeKey (a concurrent/
 * duplicate tick's second claim attempt is a safe no-op, not an error), and
 * each processPendingReminder call is independently fail-safe (one
 * subject's failure never aborts the rest of the batch — see
 * lifecycleReminders.ts's own per-row try/catch).
 */
export async function POST(request: Request) {
  const secret = process.env.LIFECYCLE_REMINDERS_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "LIFECYCLE_REMINDERS_CRON_SECRET is not configured" }, { status: 500 });
  }

  const provided = request.headers.get("x-cron-secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const claimed = await discoverAndClaimDueReminders(50);

  const sendEmail = resolveSendLifecycleReminderEmail();
  const outcomes = { SENT: 0, OBSOLETE: 0, FAILED_RETRYABLE: 0, FAILED_FINAL: 0 };
  for (const reminder of claimed) {
    try {
      const outcome = await processPendingReminder(reminder.id, sendEmail);
      outcomes[outcome]++;
    } catch (error) {
      // One reminder's unexpected failure must never abort the batch.
      console.error("[lifecycle-reminders-tick] processPendingReminder failed", reminder.id, error instanceof Error ? error.message : String(error));
    }
  }

  return NextResponse.json({ ok: true, claimed: claimed.length, outcomes });
}
