import "server-only";
import { consoleDevSendPasswordResetEmail, type SendPasswordResetEmail } from "@/services/passwordReset";
import { getEmailDeliveryMode } from "./emailDeliveryConfig";
import { resendSendPasswordResetEmail } from "./resendSendPasswordResetEmail";

/**
 * L1-01B — the single call site any caller (currently only
 * forgotPasswordAction) should use to obtain the correct
 * `SendPasswordResetEmail` implementation for the current environment.
 * Delegates the actual decision to getEmailDeliveryMode() (fail-closed in
 * production, task §12) and returns one of the two existing implementations
 * of the SendPasswordResetEmail contract — never constructs a new one here,
 * so this file has no delivery logic of its own to get wrong.
 */
export function resolveSendPasswordResetEmail(): SendPasswordResetEmail {
  const mode = getEmailDeliveryMode();
  return mode === "resend" ? resendSendPasswordResetEmail : consoleDevSendPasswordResetEmail;
}
