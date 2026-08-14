import "server-only";

/**
 * Three explicit, mutually exclusive modes — deliberately NOT "disabled_dev
 * vs. everything else means live" (that conflated Stripe test mode and
 * Stripe live mode into the same code path, so a test-mode deployment and a
 * misconfigured production deployment were indistinguishable). Each mode's
 * required credentials are validated by key-prefix before it is ever
 * considered active — see validateStripeCredentials below.
 */
export type PaymentMode = "disabled_dev" | "stripe_test" | "live";

const VALID_MODES: readonly PaymentMode[] = ["disabled_dev", "stripe_test", "live"];

/** Thrown for any invalid PAYMENT_MODE/credential combination. Never
 * includes a secret key value or any substring of one. */
export class PaymentModeConfigurationError extends Error {}

function isValidMode(value: string | undefined): value is PaymentMode {
  return value != null && (VALID_MODES as readonly string[]).includes(value);
}

/**
 * Prefix-only check — never logs, returns, or embeds the key itself.
 * `kind` selects which Stripe key family's prefix to check against.
 */
function keyHasExpectedPrefix(key: string, kind: "secret" | "publishable", expected: "test" | "live"): boolean {
  const prefix = kind === "secret" ? `sk_${expected}_` : `pk_${expected}_`;
  return key.startsWith(prefix);
}

/** Validates STRIPE_SECRET_KEY/STRIPE_PUBLISHABLE_KEY exist and match the
 * expected test/live prefix. Throws a sanitized error (no key values) on
 * any mismatch, absence, or cross-mode mixing (e.g. a test secret key
 * paired with a live publishable key) — every failure here fails closed,
 * never falls back to a guessed mode. */
function validateStripeCredentials(expected: "test" | "live"): void {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;

  if (!secretKey) {
    throw new PaymentModeConfigurationError(
      `STRIPE_SECRET_KEY is required for Stripe ${expected} mode but is not set.`
    );
  }
  if (!publishableKey) {
    throw new PaymentModeConfigurationError(
      `STRIPE_PUBLISHABLE_KEY is required for Stripe ${expected} mode but is not set.`
    );
  }
  if (!keyHasExpectedPrefix(secretKey, "secret", expected)) {
    throw new PaymentModeConfigurationError(
      `STRIPE_SECRET_KEY does not look like a Stripe ${expected}-mode secret key ` +
        `(expected the "sk_${expected}_" prefix). Refusing to start in this configuration.`
    );
  }
  if (!keyHasExpectedPrefix(publishableKey, "publishable", expected)) {
    throw new PaymentModeConfigurationError(
      `STRIPE_PUBLISHABLE_KEY does not look like a Stripe ${expected}-mode publishable key ` +
        `(expected the "pk_${expected}_" prefix). Refusing to start in this configuration.`
    );
  }
}

/**
 * The single source of truth for which payment mode is active, with
 * credentials validated before the mode is ever returned as usable. Fails
 * closed in every direction:
 *  - an unset or unrecognized PAYMENT_MODE throws rather than defaulting
 *    to any mode (never silently interpreted as live, per the G.1 safety
 *    correction);
 *  - stripe_test/live each require their own matching key pair, rejecting
 *    a missing key, a wrong-mode key, or a mixed test/live pair;
 *  - disabled_dev requires no Stripe credentials at all, but is never
 *    honored in production (see below) — production must always resolve
 *    to a real, credential-validated mode.
 *
 * Cheap to call on every check (string comparisons only) — deliberately
 * not cached, so a credential fixed mid-process (e.g. in a test harness)
 * is picked up on the next call rather than sticking to a stale result.
 */
export function getValidatedPaymentMode(): PaymentMode {
  const raw = process.env.PAYMENT_MODE;

  if (!isValidMode(raw)) {
    throw new PaymentModeConfigurationError(
      raw === undefined
        ? `PAYMENT_MODE is not set. Set it to one of: ${VALID_MODES.map((m) => `"${m}"`).join(", ")}.`
        : `PAYMENT_MODE="${raw}" is not a recognized value. Allowed values: ${VALID_MODES.map((m) => `"${m}"`).join(", ")}.`
    );
  }

  if (raw === "disabled_dev") {
    if (process.env.NODE_ENV === "production") {
      // Never honored in production — paid booking creation must never
      // silently bypass Stripe once payments are the real path. Falls
      // through to requiring real live credentials instead of returning
      // disabled_dev; if those aren't configured, this throws below,
      // which is the correct fail-closed outcome (a production deploy
      // with no live Stripe keys correctly cannot create paid bookings).
      console.warn(
        "PAYMENT_MODE=disabled_dev is set but NODE_ENV=production — ignoring it. " +
          "Paid booking creation requires real Stripe live-mode processing in production."
      );
      validateStripeCredentials("live");
      return "live";
    }
    return "disabled_dev";
  }

  if (raw === "stripe_test") {
    validateStripeCredentials("test");
    return "stripe_test";
  }

  // raw === "live"
  validateStripeCredentials("live");
  return "live";
}

/** PAYMENT_MODE=disabled_dev (and not overridden by the production
 * fail-closed rule above) — no Stripe involvement at all. */
export function paymentsAreDisabled(): boolean {
  return getValidatedPaymentMode() === "disabled_dev";
}

/** PAYMENT_MODE=stripe_test — real Stripe SDK calls, sandbox credentials
 * only. This is the mode Phase G.1 sandbox verification runs under. */
export function paymentsAreStripeTest(): boolean {
  return getValidatedPaymentMode() === "stripe_test";
}

/** True only for genuine production/live Stripe — PAYMENT_MODE="live"
 * with validated live credentials. Do NOT use this to decide "should I
 * call Stripe" (stripe_test must call Stripe too); use
 * paymentsUseStripe() for that. */
export function paymentsAreLive(): boolean {
  return getValidatedPaymentMode() === "live";
}

/** True for both Stripe-backed modes (stripe_test and live) — the check
 * every call site that means "should I call the real Stripe API, as
 * opposed to the disabled_dev bypass" should use. This is what nearly
 * every existing call site in this codebase actually means; see the G.1
 * safety correction's audit of prior paymentsAreLive() usages. */
export function paymentsUseStripe(): boolean {
  return getValidatedPaymentMode() !== "disabled_dev";
}
