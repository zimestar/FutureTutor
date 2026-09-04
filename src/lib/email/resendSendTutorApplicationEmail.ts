import "server-only";
import { getResendClient } from "./resendClient";
import { getEmailFromAddress } from "./emailDeliveryConfig";

/**
 * PROD-TUTOR-APPLICATION-NOTIFICATIONS1 — same Resend call as
 * resendSendBookingConfirmationEmail.ts, with one deliberate difference:
 * this adapter captures and returns Resend's `data.id` (the observability
 * gap PROD-BOOKING-NOTIFICATIONS1's own certification identified —
 * booking-confirmation emails never captured it). Only a safe, opaque
 * message identifier is returned — never any other field from Resend's
 * response, and never a provider secret. `providerMessageId` is `null`
 * whenever Resend's response doesn't include one, which is never treated
 * as a failure by itself (the send already succeeded if no `error` came
 * back) — see tutorApplicationNotifications.ts's dispatch loop.
 */

export interface SendTutorApplicationEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendTutorApplicationEmailResult {
  providerMessageId: string | null;
}

export type SendTutorApplicationEmail = (
  params: SendTutorApplicationEmailParams
) => Promise<SendTutorApplicationEmailResult>;

export const resendSendTutorApplicationEmail: SendTutorApplicationEmail = async ({ to, subject, html, text }) => {
  const client = getResendClient();
  const from = getEmailFromAddress();

  const { data, error } = await client.emails.send({ from, to, subject, html, text });
  if (error) {
    throw new Error(`Resend tutor-application email delivery failed: ${error.name}`);
  }
  return { providerMessageId: data?.id ?? null };
};
