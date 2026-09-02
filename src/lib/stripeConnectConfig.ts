import "server-only";

/**
 * BETA-LAUNCHFIX1 — Stripe Connect operational availability gate.
 *
 * Deliberately a SEPARATE config source from both PAYMENT_MODE
 * (src/lib/paymentMode.ts) and CLOSED_BETA_MODE (src/lib/closedBetaConfig.ts)
 * — mirrors closedBetaConfig.ts's own doc comment reasoning exactly, one
 * level further: PAYMENT_MODE answers "is Stripe live or test"; CLOSED_BETA_MODE
 * answers "is the platform in a financially-gated Closed Beta"; this answers
 * a third, genuinely independent question — "is Stripe Connect onboarding
 * itself operationally available right now," which can be false even while
 * PAYMENT_MODE=live and CLOSED_BETA_MODE=inactive (e.g. a known Stripe
 * platform-configuration issue under specialist review, unrelated to beta
 * policy or payment-processing mode). Conflating this with either existing
 * flag would mean the only way to pause Connect specifically is to also
 * pause every other financial action (via CLOSED_BETA_MODE) or fake the
 * Stripe environment entirely (via PAYMENT_MODE) — both wrong-shaped tools
 * for "Connect specifically is temporarily frozen."
 *
 * Fails closed to DISABLED, unlike getValidatedPaymentMode() (which throws
 * on a missing/invalid value) and like closedBetaConfig.ts's own safe
 * default: an absent, malformed, or "false" STRIPE_CONNECT_ENABLED all
 * resolve to disabled. Only the exact literal string "true" enables it.
 * Single authoritative, uncached resolver — re-validated on every call, same
 * shape as every other config resolver in this codebase.
 */
export function stripeConnectOnboardingAvailable(): boolean {
  return process.env.STRIPE_CONNECT_ENABLED === "true";
}
