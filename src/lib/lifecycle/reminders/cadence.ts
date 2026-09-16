import { LIFECYCLE_INACTIVITY_THRESHOLDS_MS } from "../config";
import type { ReminderNumber } from "./types";

/**
 * LIFECYCLE-1B Phase 1/8 — pure cadence math. Thresholds are measured from
 * LIFECYCLE-1A's own `lastMeaningfulProgressAt` anchor (via
 * `inactiveDurationMs`), NEVER from a previous reminder's send time — per
 * the mission's explicit worked example (Monday 10:00 progress -> R1
 * Tuesday 10:00, R2 Thursday 10:00, R3 the following Monday 10:00, all
 * measured from the SAME Monday anchor, not chained 24h/72h/etc. after each
 * other's send).
 */

/** The highest cadence step reached by elapsed inactivity alone, ignoring
 * send history entirely. This is NOT "the reminder that should be sent" —
 * see nextDueReminderNumber below for the history-aware, monotonic version
 * a real dispatcher must use. */
export function assessCadenceStep(inactiveDurationMs: number): ReminderNumber | null {
  if (inactiveDurationMs >= LIFECYCLE_INACTIVITY_THRESHOLDS_MS.THIRD_REMINDER) return 3;
  if (inactiveDurationMs >= LIFECYCLE_INACTIVITY_THRESHOLDS_MS.SECOND_REMINDER) return 2;
  if (inactiveDurationMs >= LIFECYCLE_INACTIVITY_THRESHOLDS_MS.FIRST_REMINDER) return 1;
  return null;
}

/**
 * The reminder number that should actually go out next, given which
 * reminder numbers have already been recorded as SENT for the CURRENT
 * actionable episode (see episode.ts — a stale episode's history must never
 * be passed in here; the caller is responsible for only supplying sent
 * numbers that belong to the episode identified by the current episodeKey).
 *
 * Enforces the mission's explicit sequencing rule — "R2 cannot precede R1"
 * / "R3 cannot precede R2" — by always proposing exactly one step past the
 * highest already-sent number, never jumping ahead just because elapsed
 * time alone would justify a later step. A cron that starts ticking again
 * after 9 days of downtime still sends R1 first to an episode with no
 * history, then (on a LATER tick, once R1 is durably recorded SENT) R2, and
 * so on — this is what makes the sequence deterministic and auditable
 * rather than a function of exactly when the cron happened to run.
 */
export function nextDueReminderNumber(
  cadenceStep: ReminderNumber | null,
  alreadySentNumbersForEpisode: readonly ReminderNumber[]
): ReminderNumber | null {
  if (cadenceStep === null) return null;
  const maxSent = alreadySentNumbersForEpisode.length > 0 ? Math.max(...alreadySentNumbersForEpisode) : 0;
  const nextInSequence = maxSent + 1;
  if (nextInSequence > 3) return null; // sequence exhausted — no 4th reminder
  return nextInSequence <= cadenceStep ? (nextInSequence as ReminderNumber) : null;
}
