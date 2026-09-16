import type { LifecycleJourneyState } from "../types";
import { assessCadenceStep, nextDueReminderNumber } from "./cadence";
import { computeEpisodeKey, computeReminderDedupeKey } from "./episode";
import type { EpisodeKey, ReminderNumber } from "./types";

/**
 * LIFECYCLE-1B Phase 10 (schema-independent half) — the pure part of the
 * future `assessReminderDue`. This answers "which reminder number would be
 * due right now, given ONLY the current lifecycle state and (optionally)
 * which numbers are already known-sent for the CURRENT episode" — it does
 * NOT read or write any persisted reminder history itself. The
 * history-aware, DB-backed half (looking up `alreadySentNumbers` for a
 * given episodeKey, atomically claiming the row, the pre-send recheck) is
 * design-only until the LIFECYCLE-1B schema is approved — see
 * docs/lifecycle/LIFECYCLE-1B-REMINDER-ENGINE.md §11-§13.
 */
export interface ReminderCandidate {
  episodeKey: EpisodeKey;
  dedupeKey: string;
  reminderNumber: ReminderNumber;
}

/**
 * Returns null whenever no reminder is currently due: not USER_ACTION_REQUIRED,
 * not yet 24h inactive, no stable progress anchor, or (once history is
 * wired in LIFECYCLE-1C+ of this module) the proposed number has already
 * been sent for this exact episode.
 *
 * `alreadySentNumbersForEpisode` defaults to an empty array — the correct,
 * honest behavior for a system with no persisted reminder history at all
 * (this mission's exact situation, and every subject's real situation on
 * the very first activation day): every eligible subject's first-ever
 * candidate is always R1, never R2/R3, regardless of how long they've
 * already been inactive — see cadence.ts's own doc comment for why this is
 * correct, not a limitation.
 */
export function assessReminderCandidate(
  state: Pick<LifecycleJourneyState, "journey" | "subjectId" | "stage" | "status" | "lastMeaningfulProgressAt" | "inactiveDurationMs">,
  alreadySentNumbersForEpisode: readonly ReminderNumber[] = []
): ReminderCandidate | null {
  if (state.status !== "USER_ACTION_REQUIRED") return null;
  if (state.inactiveDurationMs === null) return null;

  const episodeKey = computeEpisodeKey(state);
  if (episodeKey === null) return null;

  const cadenceStep = assessCadenceStep(state.inactiveDurationMs);
  const reminderNumber = nextDueReminderNumber(cadenceStep, alreadySentNumbersForEpisode);
  if (reminderNumber === null) return null;

  return { episodeKey, dedupeKey: computeReminderDedupeKey(episodeKey, reminderNumber), reminderNumber };
}
