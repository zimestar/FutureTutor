import type { ConfirmedTutoringLocation } from "@/types/inPersonTutoring";

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
