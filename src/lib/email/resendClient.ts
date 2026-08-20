import "server-only";
import { Resend } from "resend";
import { EmailConfigurationError } from "./emailDeliveryConfig";

let cachedClient: Resend | null = null;

/**
 * Lazily constructed, server-only Resend client — mirrors
 * src/lib/stripe.ts's getStripeClient() pattern exactly: constructed once,
 * cached, and never constructed while a real API key isn't configured.
 *
 * Every call site must resolve delivery mode via getEmailDeliveryMode()
 * (src/lib/email/emailDeliveryConfig.ts) first — this is defense-in-depth
 * for a call site that skips that check.
 */
export function getResendClient(): Resend {
  if (cachedClient) return cachedClient;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new EmailConfigurationError(
      "getResendClient() was called without RESEND_API_KEY configured — every call site must resolve " +
        "getEmailDeliveryMode() before reaching here."
    );
  }

  cachedClient = new Resend(apiKey);
  return cachedClient;
}
