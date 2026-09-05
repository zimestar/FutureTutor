import "server-only";
import { consoleDevSendSessionNotificationEmail } from "@/services/sessionNotifications";
import { getEmailDeliveryMode } from "./emailDeliveryConfig";
import { resendSendSessionNotificationEmail } from "./resendSendSessionNotificationEmail";
import type { SendSessionNotificationEmail } from "./resendSendSessionNotificationEmail";

/**
 * PROD-SESSION-NOTIFICATIONS1 — the single call site
 * dispatchSessionNotifications should use to obtain the correct
 * SendSessionNotificationEmail implementation for the current
 * environment. Mirrors resolveSendTutorApplicationEmail.ts exactly.
 */
export function resolveSendSessionNotificationEmail(): SendSessionNotificationEmail {
  const mode = getEmailDeliveryMode();
  return mode === "resend" ? resendSendSessionNotificationEmail : consoleDevSendSessionNotificationEmail;
}
