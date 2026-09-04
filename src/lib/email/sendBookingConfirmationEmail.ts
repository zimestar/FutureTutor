import "server-only";
import { consoleDevSendBookingConfirmationEmail, type SendBookingConfirmationEmail } from "@/services/bookingNotifications";
import { getEmailDeliveryMode } from "./emailDeliveryConfig";
import { resendSendBookingConfirmationEmail } from "./resendSendBookingConfirmationEmail";

/**
 * PROD-BOOKING-NOTIFICATIONS1 — the single call site
 * dispatchBookingConfirmationEmails should use to obtain the correct
 * SendBookingConfirmationEmail implementation for the current environment.
 * Mirrors resolveSendPasswordResetEmail.ts exactly — delegates the
 * decision to the same shared getEmailDeliveryMode() resolver, no delivery
 * logic of its own.
 */
export function resolveSendBookingConfirmationEmail(): SendBookingConfirmationEmail {
  const mode = getEmailDeliveryMode();
  return mode === "resend" ? resendSendBookingConfirmationEmail : consoleDevSendBookingConfirmationEmail;
}
