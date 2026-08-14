import "server-only";
import Stripe from "stripe";
import { getValidatedPaymentMode } from "@/lib/paymentMode";

let cachedClient: Stripe | null = null;

/**
 * Lazily constructed, server-only Stripe client — mirrors the `server-only`
 * import-guard pattern already used for `examAnswerKey.server.ts` (Phase D)
 * and every Phase F/G quote/booking service, so an accidental client import
 * fails at build time, not silently in production.
 *
 * Every call site must first check `paymentsUseStripe()`
 * (src/lib/paymentMode.ts) — this is defense-in-depth for a call site that
 * skips that check: getValidatedPaymentMode() re-validates the full
 * mode/credential configuration (throwing PaymentModeConfigurationError on
 * any mismatch, e.g. a live key present while PAYMENT_MODE=stripe_test) and
 * this function additionally refuses to construct a client at all while
 * disabled_dev is active.
 */
export function getStripeClient(): Stripe {
  if (cachedClient) return cachedClient;

  const mode = getValidatedPaymentMode();
  if (mode === "disabled_dev") {
    throw new Error(
      "getStripeClient() was called while payments are disabled (PAYMENT_MODE=disabled_dev) — " +
        "every call site must check paymentsUseStripe() before reaching here."
    );
  }

  // Already validated by getValidatedPaymentMode() above — re-read here
  // only to construct the client, not to re-check its shape.
  const secretKey = process.env.STRIPE_SECRET_KEY!;
  cachedClient = new Stripe(secretKey);
  return cachedClient;
}
