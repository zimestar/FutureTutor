import "server-only";

/**
 * BETA-HARDEN1 — Closed Beta safety gate.
 *
 * Deliberately a SEPARATE config source from PAYMENT_MODE
 * (src/lib/paymentMode.ts) — PAYMENT_MODE answers "is Stripe live or test,"
 * this answers "is the platform currently in a financially-gated Closed
 * Beta." Conflating the two would mean the only way to ever exercise real
 * Stripe processing again (Financial E2E) would require simultaneously
 * lifting the beta restriction — two genuinely independent concerns that
 * must stay independently toggleable. Mirrors paymentMode.ts's/
 * emailDeliveryConfig.ts's own established shape: a single authoritative,
 * uncached resolver function, re-validated on every call so a value fixed
 * mid-process (e.g. in a test harness) is picked up on the next call rather
 * than sticking to a stale result.
 *
 * Fails closed in the SAFE direction, unlike getValidatedPaymentMode()
 * (which throws on a missing/invalid value, because Stripe literally cannot
 * process anything without a real, validated mode): an unset or
 * unrecognized CLOSED_BETA_MODE here defaults to "active" — the MORE
 * restrictive state. Throwing here would take the whole site down over a
 * missing beta flag; defaulting to "restrictions on" costs nothing
 * (account creation, browsing, and profile management all keep working)
 * and can never accidentally leave a paid-tutoring path open because an env
 * var was forgotten.
 */
export type ClosedBetaMode = "active" | "inactive";

const VALID_MODES: readonly ClosedBetaMode[] = ["active", "inactive"];

function isValidMode(value: string | undefined): value is ClosedBetaMode {
  return value != null && (VALID_MODES as readonly string[]).includes(value);
}

export function getClosedBetaMode(): ClosedBetaMode {
  const raw = process.env.CLOSED_BETA_MODE;
  return isValidMode(raw) ? raw : "active";
}

/**
 * True whenever real paid tutoring must stay unreachable. Every
 * financial-boundary-crossing Server Action (Stripe PaymentIntent creation,
 * booking/Quick-Match confirmation) must check this first and fail closed —
 * never inferred from the UI, always re-checked server-side.
 */
export function closedBetaFinancialGateActive(): boolean {
  return getClosedBetaMode() === "active";
}

/**
 * True whenever a Student profile / tutoring request must be restricted to
 * ONLINE mode only. Currently backed by the same CLOSED_BETA_MODE value as
 * the financial gate (both reflect one "we are in the online-only,
 * non-financial Closed Beta" state), but kept as its own named predicate so
 * the two concerns can be independently toggled later without a call-site
 * rename.
 */
export function closedBetaOnlineOnlyActive(): boolean {
  return getClosedBetaMode() === "active";
}
