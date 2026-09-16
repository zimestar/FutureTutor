import type { LifecycleJourneyState } from "../types";
import type { EpisodeKey } from "./types";

/**
 * LIFECYCLE-1B Phase 2/3 — deterministic "actionable episode" identity.
 *
 * `episodeKey = journey:subjectId:stage:lastMeaningfulProgressAt`
 *
 * Why this satisfies the mission's own worked example (Tutor at DOCUMENTS,
 * R1 sent, tutor uploads documents -> old R2/R3 must never send; a later
 * new USER_ACTION_REQUIRED stage starts a fresh sequence):
 *
 *  - `stage` changing (e.g. TRAINING_REQUIRED -> EXAM_REQUIRED, or
 *    READY -> STUDENT_SETUP after a guardian revokes a relationship)
 *    always produces a new key — a genuinely new actionable stage is
 *    always a new episode.
 *  - `lastMeaningfulProgressAt` moving WITHIN the same stage (e.g. a tutor
 *    completes one of several required training modules, which is real
 *    progress per LIFECYCLE-1A's own definition but does not by itself
 *    change `stage`) also produces a new key. This is intentional: any
 *    inactivity-basis reset (Phase 1 — thresholds are measured from
 *    progress, never from a prior send) must also retire whatever reminder
 *    sequence was counting from the OLD anchor. A reminder row keyed to the
 *    old episode simply becomes permanently orphaned (its dedupeKey will
 *    never match a future candidate again); the new episode starts its own
 *    R1/R2/R3 sequence counted from the new anchor.
 *  - Merely viewing a page never changes `lastMeaningfulProgressAt` (per
 *    LIFECYCLE-1A's own login/page-view exclusion), so an episode stays
 *    stable while the user genuinely has not acted.
 *
 * Deliberately NOT random/UUID-based — the mission's own instruction
 * ("prefer stable domain evidence... do not use random episode identity
 * unless persistence genuinely requires it") is satisfied because every
 * input is already-existing, already-computed domain state; a genuinely
 * new persisted row for a genuinely new episode is a NATURAL CONSEQUENCE of
 * this key changing, not something the key needs to manufacture identity
 * for.
 *
 * `status`/suppression state is deliberately NOT part of the key — episode
 * identity answers "which stage-attempt is this," not "is it currently
 * safe to remind." Suppression (rejected/suspended/waiting-on-admin/etc.)
 * is re-checked fresh at both candidate-discovery time and immediately
 * pre-send (Phase 12) against the CURRENT LifecycleJourneyState, never
 * baked into a key that could go stale.
 */
export function computeEpisodeKey(state: Pick<LifecycleJourneyState, "journey" | "subjectId" | "stage" | "lastMeaningfulProgressAt">): EpisodeKey | null {
  if (state.lastMeaningfulProgressAt === null) return null; // MISSING_STATE_EVIDENCE — no stable anchor to key off
  return `${state.journey}:${state.subjectId}:${state.stage}:${state.lastMeaningfulProgressAt.toISOString()}`;
}

/**
 * A stored reminder row's episode is obsolete the moment the SAME subject's
 * freshly-recomputed episode key no longer matches what the row was created
 * for — covers every obsolescence trigger the mission lists (progress,
 * stage change, status change, journey completion, suspension, rejection,
 * admin becoming the blocker) in one comparison, since any of those either
 * changes `stage`, changes `lastMeaningfulProgressAt`, or (for
 * suspend/reject/complete) removes the subject from USER_ACTION_REQUIRED
 * entirely — at which point no new episode key is even computed for them
 * (see reminderCandidate.ts), so a stale stored key simply never matches
 * again.
 */
export function isEpisodeStillCurrent(storedEpisodeKey: EpisodeKey, currentState: Pick<LifecycleJourneyState, "journey" | "subjectId" | "stage" | "lastMeaningfulProgressAt">): boolean {
  return computeEpisodeKey(currentState) === storedEpisodeKey;
}

/** The deterministic dedupeKey a persisted reminder row would use — see the
 * LIFECYCLE-1B schema proposal's IDEMPOTENCY section. Exposed here (rather
 * than only in the not-yet-existing persistence module) so its shape can be
 * unit-tested now, before any schema exists. Mirrors the exact
 * `dedupeKey` + `@@unique` pattern already proven by
 * TutorApplicationNotification / SessionNotification. */
export function computeReminderDedupeKey(episodeKey: EpisodeKey, reminderNumber: 1 | 2 | 3): string {
  return `lifecycleReminder:${episodeKey}:R${reminderNumber}`;
}
