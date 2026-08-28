/**
 * Frontend-only integration shapes for BETA-IP1-B.
 *
 * These are deliberately presentation DTOs, not canonical persistence
 * models. BETA-IP1-C must align them with the authoritative backend contract
 * before exact-location data is wired into a page.
 */
export interface ApproximateTutoringLocation {
  areaLabel?: string | null;
  city?: string | null;
  province?: string | null;
  postalCodePrefix?: string | null;
  distanceKm?: number | null;
}

export interface ConfirmedTutoringLocation {
  label?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  province: string;
  postalCode: string;
  arrivalInstructions?: string | null;
}

export interface SavedTutoringLocationOption {
  id: string;
  label: string;
  summary: string;
}
