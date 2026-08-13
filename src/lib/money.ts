/**
 * Centralized integer-cents money math. Every financial calculation in this
 * project works in minor units (cents) — never floating-point dollars —
 * and rounds in exactly one place: here.
 */

export function roundMinorUnits(amount: number): number {
  return Math.round(amount);
}

export function sumCents(...amounts: number[]): number {
  return roundMinorUnits(amounts.reduce((total, amount) => total + amount, 0));
}

/** basisPoints: 500 = 5.00% */
export function applyBasisPoints(amountCents: number, basisPoints: number): number {
  return roundMinorUnits((amountCents * basisPoints) / 10_000);
}

/** Linear pro-rating from a rule's own base duration to the requested duration. */
export function proRateCents(baseCents: number, baseDurationMinutes: number, requestedDurationMinutes: number): number {
  return roundMinorUnits((baseCents * requestedDurationMinutes) / baseDurationMinutes);
}
