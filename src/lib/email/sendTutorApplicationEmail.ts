import "server-only";
import { consoleDevSendTutorApplicationEmail } from "@/services/tutorApplicationNotifications";
import { getEmailDeliveryMode } from "./emailDeliveryConfig";
import { resendSendTutorApplicationEmail } from "./resendSendTutorApplicationEmail";
import type { SendTutorApplicationEmail } from "./resendSendTutorApplicationEmail";

/**
 * PROD-TUTOR-APPLICATION-NOTIFICATIONS1 — the single call site
 * dispatchTutorApplicationNotifications should use to obtain the correct
 * SendTutorApplicationEmail implementation for the current environment.
 * Mirrors resolveSendBookingConfirmationEmail.ts exactly — delegates to
 * the same shared getEmailDeliveryMode() resolver, no delivery logic of
 * its own.
 */
export function resolveSendTutorApplicationEmail(): SendTutorApplicationEmail {
  const mode = getEmailDeliveryMode();
  return mode === "resend" ? resendSendTutorApplicationEmail : consoleDevSendTutorApplicationEmail;
}
