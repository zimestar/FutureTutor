/**
 * Fails closed in production — the single place that decides whether
 * paid-booking creation is allowed to proceed. Only an explicit,
 * verified-non-production `disabled_dev` bypasses real Stripe processing
 * (creates a CONFIRMED booking directly, exactly like pre-Phase-G
 * behavior — used for local dev before real Stripe test keys are wired
 * up, and for automated tests). Anything else — "live", unset, a typo —
 * requires real payment processing. If `disabled_dev` is somehow set in a
 * production environment, it is ignored (never honored) and a warning is
 * logged: this must never silently create an unpaid CONFIRMED booking
 * once payments are the real path. Webhook/reconciliation/refund/transfer
 * processing for already-existing payments is never gated by this flag —
 * only creation of *new* paid bookings is affected.
 */
export type PaymentMode = "live" | "disabled_dev";

export function getPaymentMode(): PaymentMode {
  const raw = process.env.PAYMENT_MODE;
  const isProduction = process.env.NODE_ENV === "production";

  if (raw === "disabled_dev") {
    if (isProduction) {
      console.warn(
        "PAYMENT_MODE=disabled_dev is set but NODE_ENV=production — ignoring it. " +
          "Paid booking creation requires real Stripe processing in production."
      );
      return "live";
    }
    return "disabled_dev";
  }

  return "live";
}

export function paymentsAreLive(): boolean {
  return getPaymentMode() === "live";
}
