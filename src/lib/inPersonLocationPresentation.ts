import type { ApproximateTutoringLocation, ConfirmedTutoringLocation } from "@/types/inPersonTutoring";
import type { ApproximateLocationDto, ExactLocationDto } from "@/services/bookingLocationAccess";

/**
 * BETA-IP1-C — adapters reconciling the authoritative backend contract
 * (ApproximateLocationDto / ExactLocationDto, bookingLocationAccess.ts) with
 * the presentation-only UI shapes InPersonTutoringLocation.tsx's components
 * expect. Field names are already near-identical; these only add the
 * UI-derived fields the backend has no concept of (areaLabel/distanceKm —
 * always omitted here, since no geocoding provider is configured) and
 * satisfy ConfirmedTutoringLocation's required-string fields from the
 * booking snapshot (which is nullable in the schema but always populated
 * in practice — every IN_PERSON booking's snapshot is written at claim
 * time before this can ever be read).
 */
export function toApproximateTutoringLocation(dto: ApproximateLocationDto): ApproximateTutoringLocation {
  return {
    city: dto.city,
    province: dto.province,
    postalCodePrefix: dto.postalCodePrefix,
  };
}

export function toConfirmedTutoringLocation(dto: ExactLocationDto): ConfirmedTutoringLocation {
  return {
    addressLine1: dto.addressLine1 ?? "",
    addressLine2: dto.addressLine2,
    city: dto.city ?? "",
    province: dto.province ?? "",
    postalCode: dto.postalCode ?? "",
    arrivalInstructions: dto.arrivalInstructions,
  };
}

/** Builds a swappable maps boundary from an already-authorized exact DTO. */
export function buildDirectionsHref(location: ConfirmedTutoringLocation): string {
  const query = [
    location.addressLine1,
    location.addressLine2,
    location.city,
    location.province,
    location.postalCode,
  ].filter(Boolean).join(", ");

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
