import "server-only";
import type { SendPasswordResetEmail } from "@/services/passwordReset";
import { getResendClient } from "./resendClient";
import { getEmailFromAddress } from "./emailDeliveryConfig";
import { buildPasswordResetEmailContent } from "./passwordResetEmailContent";

/**
 * L1-01B — production adapter implementing the SAME `SendPasswordResetEmail`
 * contract passwordReset.ts already defines and consoleDevSendPasswordResetEmail
 * already implements. passwordReset.ts's own domain logic is completely
 * unaware this exists — it only ever calls whatever function is injected as
 * `deps.sendEmail` (task §3's adapter architecture).
 *
 * Never logs the raw reset URL/token (task §9/§13) — the only thing logged
 * on failure is Resend's own sanitized error shape (name/message/status),
 * which never contains the email body or token.
 */
export const resendSendPasswordResetEmail: SendPasswordResetEmail = async ({ email, resetUrl, locale }) => {
  const client = getResendClient();
  const from = getEmailFromAddress();
  const { subject, html, text } = await buildPasswordResetEmailContent({ locale, resetUrl });

  const { error } = await client.emails.send({
    from,
    to: email,
    subject,
    html,
    text,
  });

  if (error) {
    // Resend's SDK returns a { data, error } discriminated union for
    // API-level failures rather than throwing — normalized into a thrown
    // error here so requestPasswordReset's existing "a genuine
    // infrastructure failure DOES throw" contract (see passwordReset.ts's
    // own doc comment) applies uniformly regardless of whether the
    // underlying SDK call throws (network failure) or returns an error
    // object (API-level rejection). The caller (forgotPasswordAction)
    // already catches this, logs it safely (name/code only, via
    // logAuthFailure), and still returns the same generic {submitted:true}
    // outcome — task §9's enumeration-safety requirement.
    throw new Error(`Resend password-reset email delivery failed: ${error.name}`);
  }
};
