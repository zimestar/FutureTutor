import "server-only";
import Stripe from "stripe";

let cachedClient: Stripe | null = null;

/**
 * Lazily constructed, server-only Stripe client — mirrors the `server-only`
 * import-guard pattern already used for `examAnswerKey.server.ts` (Phase D)
 * and every Phase F/G quote/booking service, so an accidental client import
 * fails at build time, not silently in production.
 *
 * Throws if STRIPE_SECRET_KEY is unset. Every call site must first check
 * `paymentsAreLive()` (src/lib/paymentMode.ts) — this function is never
 * reached at all while PAYMENT_MODE=disabled_dev, so a missing key in that
 * mode is expected and harmless, not a bug to work around here.
 */
export function getStripeClient(): Stripe {
  if (cachedClient) return cachedClient;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured — payments are not available in this environment.");
  }
  cachedClient = new Stripe(secretKey);
  return cachedClient;
}
