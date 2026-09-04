/**
 * PROD-DIRECT-BOOKING-MODEFIX1 — the single shared rule turning a tutor's
 * CAPABILITY (TutorProfile.learningMode / TutorAvailability.mode — ONLINE,
 * IN_PERSON, or BOTH, i.e. "what this tutor is willing to offer") into the
 * ACTUAL requested session mode for one concrete booking (ONLINE or
 * IN_PERSON — never BOTH; a real session happens exactly one way). Direct
 * booking previously copied the capability value straight onto
 * CustomerPriceQuote.tutoringMode / Booking.mode, which meant a BOTH-capable
 * tutor produced a BOTH-mode quote/booking — an ambiguous value neither
 * field is meant to hold. This function is the one place that conversion
 * happens; every caller (createPriceQuoteAction, createBookingAction) uses
 * it instead of re-deriving the mode independently, so both sides of a
 * given flow can never disagree with each other about what "the mode" means.
 *
 * Pure, no I/O — deliberately isolated from Zod/formData/env so it stays
 * trivially unit-testable and reusable from both server actions without
 * either one owning the rule.
 */
export type EffectiveTutoringMode = "ONLINE" | "IN_PERSON";

export function resolveRequestedTutoringMode(params: {
  tutorCapability: "ONLINE" | "IN_PERSON" | "BOTH";
  /** Untrusted input — a raw client-submitted value (or absent). Only the
   * exact strings "ONLINE"/"IN_PERSON" are ever legal; anything else
   * (including the literal "BOTH", empty string, or a malformed value)
   * fails closed. */
  requestedMode: string | null | undefined;
}): EffectiveTutoringMode | null {
  const { tutorCapability, requestedMode } = params;

  if (requestedMode != null && requestedMode !== "ONLINE" && requestedMode !== "IN_PERSON") {
    return null;
  }

  if (tutorCapability === "ONLINE") {
    if (requestedMode == null) return "ONLINE"; // unambiguous — nothing to ask about
    return requestedMode === "ONLINE" ? "ONLINE" : null;
  }

  if (tutorCapability === "IN_PERSON") {
    if (requestedMode == null) return "IN_PERSON"; // unambiguous
    return requestedMode === "IN_PERSON" ? "IN_PERSON" : null;
  }

  // tutorCapability === "BOTH" — genuinely ambiguous. Never silently
  // inferred; the customer must explicitly choose.
  return requestedMode ?? null;
}
