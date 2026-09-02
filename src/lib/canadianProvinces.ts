/**
 * BETA-AGE1 — the single canonical list of Canadian provinces/territories.
 *
 * Extracted from the values already hardcoded in
 * src/components/dashboard/InPersonTutoringLocation.tsx's LocationForm
 * (`<Select id="province" name="province">`) — the only place this exact
 * 13-item, 2-letter-code list previously existed in the codebase. This
 * module promotes that pre-existing implicit list to an explicit, shared,
 * canonical source of truth; it does not create a second, competing list.
 * That component now imports from here instead of its own inline array —
 * same runtime values, same order, no visual change.
 *
 * Deliberately NOT `"server-only"` — this is a pure, zero-I/O constant/type
 * module, safe to import from both server and client code (the signup
 * form's province `<select>` needs it client-side; studentAgePolicy.ts
 * needs it server-side), mirroring parseStrictCalendarDate's own
 * framework-agnostic precedent in src/schemas/auth.ts.
 */
export const CANADIAN_PROVINCES_AND_TERRITORIES = [
  "AB",
  "BC",
  "MB",
  "NB",
  "NL",
  "NS",
  "NT",
  "NU",
  "ON",
  "PE",
  "QC",
  "SK",
  "YT",
] as const;

export type CanadianProvinceCode = (typeof CANADIAN_PROVINCES_AND_TERRITORIES)[number];

export function isCanadianProvinceCode(value: string): value is CanadianProvinceCode {
  return (CANADIAN_PROVINCES_AND_TERRITORIES as readonly string[]).includes(value);
}
