/**
 * LIFECYCLE-1B schema decision §9 — centralized, bounded retry policy.
 * Never an ad-hoc, implementation-time decision.
 */
export const LIFECYCLE_REMINDER_MAX_ATTEMPTS = 3;

/**
 * Bounded backoff for a transient provider failure — minutes, not an
 * unbounded/immediate retry loop. The cron's own natural tick interval
 * (expected to be hourly-or-coarser, matching every other cron in this
 * codebase) already provides real spacing between attempts; this constant
 * exists so a future implementation has one deterministic value to point
 * at rather than inventing a number per call site.
 */
export const LIFECYCLE_REMINDER_RETRY_BACKOFF_MINUTES = 30;

export type ReminderFailureClassification = "RETRYABLE" | "FINAL" | "DO_NOT_RETRY";

/**
 * Classifies why a reminder can't currently be sent. `DO_NOT_RETRY` cases
 * never even reach a delivery attempt in the first place — they're caught
 * earlier (recipient resolution, the pre-send recheck) and the row is
 * marked OBSOLETE/SUPPRESSED, never FAILED. This function exists to
 * classify an actual PROVIDER-layer outcome once a send was attempted.
 */
export function classifyProviderFailure(error: { permanent: boolean }): ReminderFailureClassification {
  return error.permanent ? "FINAL" : "RETRYABLE";
}

/** Per schema decision §9's explicit "do not retry" list — reasons a
 * candidate must never even be attempted, let alone retried. */
export type DoNotAttemptReason =
  | "INVALID_OR_MISSING_RECIPIENT"
  | "SUPPRESSED_LIFECYCLE_STATE"
  | "OBSOLETE_EPISODE"
  | "PERMANENT_PROVIDER_REJECTION"
  | "RECIPIENT_COMPLAINED_OR_BLOCKED";

export function hasExhaustedRetries(attemptCount: number): boolean {
  return attemptCount >= LIFECYCLE_REMINDER_MAX_ATTEMPTS;
}
