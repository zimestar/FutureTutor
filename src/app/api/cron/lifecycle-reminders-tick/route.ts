import { NextResponse } from "next/server";
import { discoverAndClaimDueReminders, processPendingReminder, findResumableReminderIds } from "@/services/lifecycleReminders";
import { resolveReminderActivationPolicy } from "@/lib/lifecycle/reminders/activationMode";
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

  // Second, independent safety key (LIFECYCLE-ACTIVATION-1): even with a
  // valid secret, nothing is scanned, claimed, or sent unless
  // LIFECYCLE_REMINDERS_MODE is explicitly "canary" or "live".
  const policy = resolveReminderActivationPolicy();
  if (policy.mode === "disabled") {
    return NextResponse.json({ ok: true, mode: "disabled", claimed: 0, resumed: 0 });
  }

  const claimed = await discoverAndClaimDueReminders({ policy, limit: 50 });
  const resumableIds = await findResumableReminderIds(50);

  const sendEmail = resolveSendLifecycleReminderEmail();
  const outcomes = { SENT: 0, OBSOLETE: 0, FAILED_RETRYABLE: 0, FAILED_FINAL: 0, SKIPPED: 0 };
  // Fresh claims first, then the retry sweep. processPendingReminder's own
  // atomic claim makes any overlap between the two lists harmless.
  const ids = [...claimed.map((c) => c.id), ...resumableIds];
  for (const id of ids) {
    try {
      const outcome = await processPendingReminder(id, sendEmail, policy);
      outcomes[outcome]++;
    } catch (error) {
      // One reminder's unexpected failure must never abort the batch.
      console.error("[lifecycle-reminders-tick] processPendingReminder failed", id, error instanceof Error ? error.message : String(error));
    }
  }

  return NextResponse.json({ ok: true, mode: policy.mode, claimed: claimed.length, resumed: resumableIds.length, outcomes });
}
