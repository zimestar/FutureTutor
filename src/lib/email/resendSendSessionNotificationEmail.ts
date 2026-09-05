import "server-only";
import { getResendClient } from "./resendClient";
import { getEmailFromAddress } from "./emailDeliveryConfig";

/**
 * PROD-SESSION-NOTIFICATIONS1 — same Resend call as
 * resendSendTutorApplicationEmail.ts, including that adapter's
 * providerMessageId capture (the observability improvement introduced in
 * PROD-TUTOR-APPLICATION-NOTIFICATIONS1, reused here rather than the
 * older booking-confirmation adapter that still discards it).
 */

export interface SendSessionNotificationEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendSessionNotificationEmailResult {
  providerMessageId: string | null;
}

export type SendSessionNotificationEmail = (
  params: SendSessionNotificationEmailParams
) => Promise<SendSessionNotificationEmailResult>;

export const resendSendSessionNotificationEmail: SendSessionNotificationEmail = async ({ to, subject, html, text }) => {
  const client = getResendClient();
  const from = getEmailFromAddress();

  const { data, error } = await client.emails.send({ from, to, subject, html, text });
  if (error) {
    throw new Error(`Resend session-notification email delivery failed: ${error.name}`);
  }
  return { providerMessageId: data?.id ?? null };
};
