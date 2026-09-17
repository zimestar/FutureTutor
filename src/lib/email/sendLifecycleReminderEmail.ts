import "server-only";
import { getEmailDeliveryMode } from "./emailDeliveryConfig";
import { resendSendLifecycleReminderEmail } from "./resendSendLifecycleReminderEmail";
import type { SendLifecycleReminderEmail } from "@/services/lifecycleReminders";

/**
 * LIFECYCLE-1B — mirrors resolveSendTutorApplicationEmail.ts exactly: the
 * single call site the (still-unscheduled) cron route should use to obtain
 * the correct sender for the current environment. Delegates entirely to
 * the existing, already-proven getEmailDeliveryMode() resolver — no new
 * delivery-mode logic.
 *
 * The console_dev fallback logs to stdout only — never sends anything —
 * matching consoleDevSendTutorApplicationEmail's own established shape.
 */
const consoleDevSendLifecycleReminderEmail: SendLifecycleReminderEmail = async ({ to, subject }) => {
  console.log(`[lifecycleReminders] DEV ONLY — no email provider configured. Would send "${subject}" to ${to}`);
  return { providerMessageId: null };
};

export function resolveSendLifecycleReminderEmail(): SendLifecycleReminderEmail {
  const mode = getEmailDeliveryMode();
  return mode === "resend" ? resendSendLifecycleReminderEmail : consoleDevSendLifecycleReminderEmail;
}
