/**
 * LIFECYCLE-1A — centralized abandonment/reminder-cadence thresholds.
 *
 * These describe ELIGIBILITY only ("would a reminder be due at this point")
 * — LIFECYCLE-1A never sends anything. LIFECYCLE-1B is expected to consume
 * these same constants for its actual cadence (24h / 72h / 7d), rather than
 * redefining them, so eligibility and send-cadence can never drift apart.
 */
export const LIFECYCLE_INACTIVITY_THRESHOLDS_MS = {
  FIRST_REMINDER: 24 * 60 * 60 * 1000,
  SECOND_REMINDER: 72 * 60 * 60 * 1000,
  THIRD_REMINDER: 7 * 24 * 60 * 60 * 1000,
} as const;

/** The minimum inactivity a USER_ACTION_REQUIRED subject must have accrued
 * before LIFECYCLE-1A reports them as reminder-eligible at all. Kept
 * separate from the named cadence steps above so this single constant can
 * gate "would ANY reminder be due yet" without hard-coding which cadence
 * step LIFECYCLE-1B will actually choose to fire first. */
export const REMINDER_ELIGIBILITY_MIN_INACTIVITY_MS = LIFECYCLE_INACTIVITY_THRESHOLDS_MS.FIRST_REMINDER;
