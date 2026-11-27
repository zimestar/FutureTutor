import "server-only";
import { getEmailDeliveryMode } from "./emailDeliveryConfig";
import { resendSendTutorApplicationEmail, type SendTutorApplicationEmail } from "./resendSendTutorApplicationEmail";

/**
 * TUTOR-PIPELINE1 — picks the email transport for admin alerts. The Resend
 * adapter is the generic one built for tutor-application emails (plain
 * to/subject/html/text, returns Resend's message id); outside "resend"
 * delivery mode emails are only logged.
 */
const consoleDevSendAdminAlertEmail: SendTutorApplicationEmail = async ({ to, subject }) => {
  console.log(`[adminAlerts] DEV ONLY — no email provider configured. Would send "${subject}" to ${to}`);
  return { providerMessageId: null };
};

export function resolveSendAdminAlertEmail(): SendTutorApplicationEmail {
  return getEmailDeliveryMode() === "resend" ? resendSendTutorApplicationEmail : consoleDevSendAdminAlertEmail;
}
