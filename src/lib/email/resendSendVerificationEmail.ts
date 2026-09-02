import "server-only";
import type { SendVerificationEmail } from "@/services/emailVerification";
import { getResendClient } from "./resendClient";
import { getEmailFromAddress } from "./emailDeliveryConfig";
import { buildVerificationEmailContent } from "./verificationEmailContent";

/**
 * BETA-EMAILVERIFY1 — production adapter implementing the SAME
 * `SendVerificationEmail` contract emailVerification.ts already defines and
 * consoleDevSendVerificationEmail already implements. Mirrors
 * resendSendPasswordResetEmail.ts exactly, including never logging the raw
 * verification URL/token — only Resend's own sanitized error shape
 * (name/message/status) is ever logged on failure.
 */
export const resendSendVerificationEmail: SendVerificationEmail = async ({ email, verifyUrl, locale }) => {
  const client = getResendClient();
  const from = getEmailFromAddress();
  const { subject, html, text } = await buildVerificationEmailContent({ locale, verifyUrl });

  const { error } = await client.emails.send({
    from,
    to: email,
    subject,
    html,
    text,
  });

  if (error) {
    // Same normalization as resendSendPasswordResetEmail.ts — Resend's SDK
    // returns a { data, error } union rather than throwing; normalized to a
    // thrown error so callers' "a genuine infrastructure failure DOES
    // throw" contract applies uniformly.
    throw new Error(`Resend verification email delivery failed: ${error.name}`);
  }
};
