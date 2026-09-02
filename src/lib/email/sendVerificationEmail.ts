import "server-only";
import { consoleDevSendVerificationEmail, type SendVerificationEmail } from "@/services/emailVerification";
import { getEmailDeliveryMode } from "./emailDeliveryConfig";
import { resendSendVerificationEmail } from "./resendSendVerificationEmail";

/**
 * BETA-EMAILVERIFY1 — the single call site any caller (registerAction,
 * claimWithNewAccountAction, claimStudentLoginWithNewAccountAction,
 * resendVerificationEmailAction) should use to obtain the correct
 * `SendVerificationEmail` implementation for the current environment.
 * Mirrors sendPasswordResetEmail.ts's resolveSendPasswordResetEmail()
 * exactly — delegates the mode decision to the same
 * getEmailDeliveryMode() (fail-closed in production) and returns one of
 * the two existing implementations, never constructs a new one here.
 */
export function resolveSendVerificationEmail(): SendVerificationEmail {
  const mode = getEmailDeliveryMode();
  return mode === "resend" ? resendSendVerificationEmail : consoleDevSendVerificationEmail;
}
