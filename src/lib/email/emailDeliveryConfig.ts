import "server-only";

/**
 * L1-01B — Production Password-Reset Email Delivery.
 *
 * Mirrors src/lib/paymentMode.ts's own established shape exactly: a single
 * authoritative, fail-closed resolver function, re-validated on every call
 * (deliberately not cached, so a credential fixed mid-process — e.g. in a
 * test harness — is picked up on the next call rather than sticking to a
 * stale result), never silently defaulting to a "safe-looking" mode.
 *
 * Only two modes exist here (unlike PaymentMode's three) because email
 * delivery has no test/live credential-prefix distinction the way Stripe
 * keys do — "resend" covers both a real Resend account used in
 * staging/production AND a developer who has deliberately opted into
 * exercising real delivery locally (see getEmailDeliveryMode's own doc
 * comment below).
 */
export type EmailDeliveryMode = "console_dev" | "resend";

/** Thrown for any invalid/missing production email configuration. Never
 * includes the API key value or any substring of one — mirrors
 * PaymentModeConfigurationError's own contract. */
export class EmailConfigurationError extends Error {}

const RESEND_API_KEY_ENV = "RESEND_API_KEY";
const EMAIL_FROM_ENV = "EMAIL_FROM";

function hasResendCredentials(): boolean {
  return Boolean(process.env[RESEND_API_KEY_ENV]) && Boolean(process.env[EMAIL_FROM_ENV]);
}

/**
 * The single source of truth for which password-reset email delivery
 * mechanism is active:
 *
 *  - NODE_ENV=production: ALWAYS resolves to "resend", and throws
 *    EmailConfigurationError (fail closed) if RESEND_API_KEY or EMAIL_FROM
 *    is missing — production must never silently fall back to console
 *    delivery (task §12).
 *  - Any other environment (dev/test/staging-without-NODE_ENV=production):
 *    resolves to "resend" ONLY if both RESEND_API_KEY and EMAIL_FROM are
 *    explicitly set (e.g. a developer or CI job deliberately smoke-testing
 *    real delivery), otherwise "console_dev" — running the unit/integration
 *    suite, or any local dev flow, never requires a real Resend account
 *    (task §12's "development must not require a paid/real provider merely
 *    to run tests").
 *
 * Cheap to call on every request (env var reads + string checks only) —
 * same "not cached" reasoning as getValidatedPaymentMode().
 */
export function getEmailDeliveryMode(): EmailDeliveryMode {
  if (process.env.NODE_ENV === "production") {
    if (!process.env[RESEND_API_KEY_ENV]) {
      throw new EmailConfigurationError(
        `${RESEND_API_KEY_ENV} is required in production but is not set — refusing to start password-reset ` +
          `email delivery in this configuration.`
      );
    }
    if (!process.env[EMAIL_FROM_ENV]) {
      throw new EmailConfigurationError(
        `${EMAIL_FROM_ENV} is required in production but is not set — refusing to start password-reset ` +
          `email delivery in this configuration.`
      );
    }
    return "resend";
  }

  return hasResendCredentials() ? "resend" : "console_dev";
}

/** Validated, non-empty EMAIL_FROM value. Only ever called once
 * getEmailDeliveryMode() has already resolved to "resend" (so this re-read
 * is a formality, not the primary validation point), mirroring
 * getStripeClient()'s own "already validated above, re-read only to
 * construct/use the value" pattern. */
export function getEmailFromAddress(): string {
  const from = process.env[EMAIL_FROM_ENV];
  if (!from) {
    throw new EmailConfigurationError(`${EMAIL_FROM_ENV} is not set.`);
  }
  return from;
}
