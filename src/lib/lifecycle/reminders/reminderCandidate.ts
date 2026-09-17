import type { LifecycleJourneyState } from "../types";
import { assessCadenceStep, nextDueReminderNumber } from "./cadence";
import { computeEpisodeKey, computeReminderDedupeKey } from "./episode";
import type { EpisodeKey, ReminderNumber } from "./types";

/**
 * LIFECYCLE-1B Phase 10 (schema-independent half) — the pure part of the
 * decision engine. Recipient-aware per the schema decision's MULTI-GUARDIAN
 * correction: ordering (§8 — "R2 MUST NOT send unless R1 for that
 * recipient/episode reached SENT") is scoped to the (episodeKey,
 * recipientUserId) pair, not the episode alone, since a Student with two
 * ACTIVE guardians now produces two independent deliveries with two
 * independent send histories (Guardian A's email could bounce while
 * Guardian B's succeeds — each recipient's own sequence must progress
 * independently).
 *
 * This does NOT read or write any persisted reminder history itself — the
 * caller supplies `alreadySentNumbersForRecipient`, which the DB-backed
 * decision engine (`decisionEngine.ts`) resolves by querying
 * `LifecycleReminder` rows with `status: "SENT"` for this exact
 * (episodeKey, recipientUserId) pair. "Already sent" means status ===
 * SENT specifically — a FAILED_RETRYABLE or FAILED_FINAL R1 is NOT
 * "sent," so R2 can never leapfrog a failed R1 (schema decision §8/§9).
 */
export interface ReminderCandidate {
  episodeKey: EpisodeKey;
  dedupeKey: string;
  reminderNumber: ReminderNumber;
  recipientUserId: string;
}

/**
 * Returns null whenever no reminder is currently due for this specific
 * recipient: not USER_ACTION_REQUIRED, not yet 24h inactive, no stable
 * progress anchor, or the next-in-sequence number for this recipient has
 * already been sent / is not yet cadence-eligible.
 *
 * `alreadySentNumbersForRecipient` defaults to an empty array — the
 * correct, honest behavior for a system with no persisted reminder history
 * at all (this mission's exact situation, and every subject's real
 * situation on the very first activation day): every eligible recipient's
 * first-ever candidate is always R1, never R2/R3, regardless of how long
 * the subject has already been inactive — see cadence.ts's own doc comment
 * for why this is correct, not a limitation.
 */
export function assessReminderCandidate(
  state: Pick<LifecycleJourneyState, "journey" | "subjectId" | "stage" | "status" | "lastMeaningfulProgressAt" | "inactiveDurationMs">,
  recipientUserId: string,
  alreadySentNumbersForRecipient: readonly ReminderNumber[] = []
): ReminderCandidate | null {
  if (state.status !== "USER_ACTION_REQUIRED") return null;
  if (state.inactiveDurationMs === null) return null;
  if (!recipientUserId) return null;

  const episodeKey = computeEpisodeKey(state);
  if (episodeKey === null) return null;

  const cadenceStep = assessCadenceStep(state.inactiveDurationMs);
  const reminderNumber = nextDueReminderNumber(cadenceStep, alreadySentNumbersForRecipient);
  if (reminderNumber === null) return null;

  return {
    episodeKey,
    dedupeKey: computeReminderDedupeKey(episodeKey, reminderNumber, recipientUserId),
    reminderNumber,
    recipientUserId,
  };
}
