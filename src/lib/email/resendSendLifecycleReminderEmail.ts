import "server-only";
import { getResendClient } from "./resendClient";
import { getEmailFromAddress } from "./emailDeliveryConfig";
import type { SendLifecycleReminderEmail } from "@/services/lifecycleReminders";

/**
 * LIFECYCLE-1B — mirrors resendSendTutorApplicationEmail.ts exactly. Only a
 * safe, opaque message identifier is captured — never any other Resend
 * response field, never a provider secret.
 */
export const resendSendLifecycleReminderEmail: SendLifecycleReminderEmail = async ({ to, subject, html, text }) => {
  const client = getResendClient();
  const from = getEmailFromAddress();

  const { data, error } = await client.emails.send({ from, to, subject, html, text });
  if (error) {
    throw new Error(`Resend lifecycle-reminder email delivery failed: ${error.name}`);
  }
  return { providerMessageId: data?.id ?? null };
};
