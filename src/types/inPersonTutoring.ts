/**
 * Presentation shapes for the in-person location UI components
 * (InPersonTutoringLocation.tsx). BETA-IP1-C reconciled these against the
 * authoritative backend contract in src/services/bookingLocationAccess.ts
 * (ApproximateLocationDto / ExactLocationDto) — these types stay UI-only
 * adapters (adding presentation-only fields like areaLabel/distanceKm that
 * the backend has no concept of) rather than a competing source of truth.
 * No geocoding provider is configured, so distanceKm is always omitted by
 * every real caller today; the field stays optional for when one exists.
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
