/**
 * Deliberately minimal normalization for city-string eligibility matching
 * (Quick Match in-person requests, see tutorEligibility.ts) — trims,
 * lowercases, and collapses repeated internal whitespace. Not an address-
 * normalization system: no fuzzy matching, no alias table, no accent
 * folding. Fixes the realistic case of "Montreal" vs "Montréal " vs
 * "montreal" failing to match on raw equality, without pretending to solve
 * real geocoding (see the Phase F plan's tutor.city vs. service-area
 * discussion for why nothing more precise is attempted here).
 */
export function normalizeCity(city: string | null | undefined): string {
  if (!city) return "";
  return city.trim().toLowerCase().replace(/\s+/g, " ");
}
