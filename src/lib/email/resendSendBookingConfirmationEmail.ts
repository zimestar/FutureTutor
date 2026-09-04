import "server-only";
import type { SendBookingConfirmationEmail } from "@/services/bookingNotifications";
import { getResendClient } from "./resendClient";
import { getEmailFromAddress } from "./emailDeliveryConfig";

/**
 * PROD-BOOKING-NOTIFICATIONS1 — production adapter. Unlike
 * resendSendPasswordResetEmail.ts, content is already built by the caller
 * (buildTutorBookingEmailContent / buildPayerBookingEmailContent) — this
 * function's only job is the actual Resend network call, since it's shared
 * by two different templates rather than owned by one.
 *
 * Never logs the email body — the only thing logged on failure is Resend's
 * own sanitized error shape (name only), mirroring the password-reset
 * adapter's exact discipline.
 */
export const resendSendBookingConfirmationEmail: SendBookingConfirmationEmail = async ({ to, subject, html, text }) => {
  const client = getResendClient();
  const from = getEmailFromAddress();

  const { error } = await client.emails.send({ from, to, subject, html, text });

  if (error) {
    throw new Error(`Resend booking-confirmation email delivery failed: ${error.name}`);
  }
};
