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

// RW-22 — two independent gates, each with its own variable:
//   CLOSED_BETA_FINANCIAL_GATE  "active" | "inactive"  (paid tutoring)
//   CLOSED_BETA_ONLINE_ONLY     "active" | "inactive"  (ONLINE-only sessions)
// CLOSED_BETA_MODE (deprecated) remains the fallback for whichever of the
// two is unset, so a deployment that sets neither behaves exactly as before.

const VALID_MODES: readonly ClosedBetaMode[] = ["active", "inactive"];

function isValidMode(value: string | undefined): value is ClosedBetaMode {
  return value != null && (VALID_MODES as readonly string[]).includes(value);
}

/**
 * @deprecated RW-22 — the legacy single-switch value. Kept only as the
 * backward-compatible FALLBACK for the two independent gates below (and for
 * any caller that still reads it). New code must use
 * closedBetaFinancialGateActive() / closedBetaOnlineOnlyActive() (or
 * getEffectiveClosedBetaGates() for display), never this.
 */
export function getClosedBetaMode(): ClosedBetaMode {
  const raw = process.env.CLOSED_BETA_MODE;
  return isValidMode(raw) ? raw : "active";
}

/**
 * RW-22 — resolves ONE independent gate. Precedence, failing closed:
 *  1. Its own variable is present (any value, including empty string):
 *     exactly "active" / "inactive" is used as-is; ANYTHING else (typo,
 *     different case, surrounding whitespace, empty) resolves to "active".
 *     An invalid explicit value NEVER falls through to the legacy variable,
 *     so a typo can never silently inherit a permissive legacy "inactive".
 *  2. Its own variable is absent (undefined): the legacy CLOSED_BETA_MODE
 *     resolution, exactly as before RW-22 (valid value, else "active").
 * Uncached — re-read on every call, like the rest of this module.
 */
function resolveGate(explicitRaw: string | undefined): ClosedBetaMode {
  if (explicitRaw !== undefined) return isValidMode(explicitRaw) ? explicitRaw : "active";
  return getClosedBetaMode();
}

/** RW-22 — effective financial-gate mode (CLOSED_BETA_FINANCIAL_GATE, then
 * the legacy CLOSED_BETA_MODE fallback). */
export function getClosedBetaFinancialGateMode(): ClosedBetaMode {
  return resolveGate(process.env.CLOSED_BETA_FINANCIAL_GATE);
}

/** RW-22 — effective online-only mode (CLOSED_BETA_ONLINE_ONLY, then the
 * legacy CLOSED_BETA_MODE fallback). */
export function getClosedBetaOnlineOnlyMode(): ClosedBetaMode {
  return resolveGate(process.env.CLOSED_BETA_ONLINE_ONLY);
}

/** RW-22 — the two RESOLVED gate values, for read-only admin display
 * (/admin/financial-ops). Never returns raw environment strings. */
export function getEffectiveClosedBetaGates(): { financialGate: ClosedBetaMode; onlineOnly: ClosedBetaMode } {
  return { financialGate: getClosedBetaFinancialGateMode(), onlineOnly: getClosedBetaOnlineOnlyMode() };
}

/**
 * True whenever real paid tutoring must stay unreachable. Every
 * financial-boundary-crossing Server Action (Stripe PaymentIntent creation,
 * booking/Quick-Match confirmation) must check this first and fail closed —
 * never inferred from the UI, always re-checked server-side.
 */
export function closedBetaFinancialGateActive(): boolean {
  return getClosedBetaFinancialGateMode() === "active";
}

/**
 * True whenever a Student profile / tutoring request must be restricted to
 * ONLINE mode only. RW-22 — now independently controlled by
 * CLOSED_BETA_ONLINE_ONLY (falling back to the legacy CLOSED_BETA_MODE when
 * unset), so paid ONLINE sessions can open (financial gate inactive) while
 * IN_PERSON stays restricted. Same predicate name/signature as before, so no
 * call site changes.
 */
export function closedBetaOnlineOnlyActive(): boolean {
  return getClosedBetaOnlineOnlyMode() === "active";
}
