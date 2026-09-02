/**
 * BETA-PRICINGFIX1 — the exact rule deciding what academic level a pricing
 * form (BookingWidget.tsx, QuickMatchRequestForm.tsx) should preselect,
 * isolated from React so it's unit-testable without a DOM/jsdom dependency
 * (same reasoning as bookingAutoFinalize.ts / paymentPreparation.ts).
 *
 * Per FutureTutor_BETA_PRICINGGAP_AUDIT1_REPORT.md, production pricing
 * configuration only covers exact subject+academic-level combinations — an
 * unresolved ("Any level" / null) academic level has zero coverage for
 * every subject. A pricing form must therefore never default to that state:
 * it either preselects the student's own real academic level (when that
 * level is actually one of the levels this form currently offers), or it
 * requires an explicit choice, exactly as if the student had no academic
 * level on file at all. This function is the single shared definition of
 * that rule — both forms call it instead of each re-implementing the same
 * "is this id actually in the offered list" check.
 */
export interface AcademicLevelOption {
  id: string;
}

export function resolveInitialAcademicLevel(
  studentAcademicLevelId: string | null | undefined,
  availableLevels: readonly AcademicLevelOption[]
): string {
  if (!studentAcademicLevelId) return "";
  return availableLevels.some((level) => level.id === studentAcademicLevelId) ? studentAcademicLevelId : "";
}
