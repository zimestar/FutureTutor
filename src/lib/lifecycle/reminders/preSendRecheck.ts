import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { getTutorLifecycle } from "../tutorLifecycle";
import { getParentLifecycle } from "../parentLifecycle";
import { getStudentProfileLifecycle } from "../studentLifecycle";
import { isEpisodeStillCurrent } from "./episode";
import { resolveSelfReminderRecipient, resolveStudentReminderRecipients } from "./recipient";
import type { LifecycleJourneyState } from "../types";
import type { EpisodeKey, LifecycleRole } from "./types";

/**
 * LIFECYCLE-1B Phase 12 + schema-decision §9 — the mandatory immediate
 * pre-send recheck. Reloads EVERYTHING authoritative fresh (never trusts
 * anything computed at candidate-discovery time, however recent) and
 * returns `safe: false` the instant any of the following has changed:
 *
 *  - the subject's episode is no longer current (stage changed, progress
 *    happened, status left USER_ACTION_REQUIRED, subject became suspended/
 *    rejected/completed/admin-blocked — isEpisodeStillCurrent covers all of
 *    these in one comparison, per episode.ts's own doc comment)
 *  - the SPECIFIC recipient this candidate was computed for is no longer a
 *    safe recipient — this is a genuinely separate check from episode
 *    currency: a guardian's ParentStudentRelationship can be revoked
 *    without the CHILD's own episodeKey changing at all (the child's stage/
 *    progress anchor are untouched), so episode-currency alone would miss
 *    this. Re-resolving the recipient list fresh and checking the specific
 *    recipientUserId is still present with contactAllowed: true is the only
 *    way to catch it (schema decision §9's explicit
 *    "guardian relationship changes before send" case).
 *
 * Never mutates anything — read-only, safe to call as many times as needed.
 */

export interface ReminderIntentRef {
  role: LifecycleRole;
  /** TutorProfile.id | ParentProfile.id | StudentProfile.id */
  subjectId: string;
  episodeKey: EpisodeKey;
  recipientUserId: string;
}

export type PreSendRecheckResult =
  | { safe: true; freshState: LifecycleJourneyState }
  | { safe: false; reason: "SUBJECT_NOT_FOUND" | "EPISODE_OBSOLETE" | "RECIPIENT_NO_LONGER_VALID" };

async function loadFreshState(client: PrismaClient, role: LifecycleRole, subjectId: string, now: Date): Promise<LifecycleJourneyState | null> {
  if (role === "TUTOR") return getTutorLifecycle(client, subjectId, now);
  if (role === "PARENT") return getParentLifecycle(client, subjectId, now);
  return getStudentProfileLifecycle(client, subjectId, now);
}

export async function revalidateReminderIntent(client: PrismaClient, ref: ReminderIntentRef, now: Date = new Date()): Promise<PreSendRecheckResult> {
  const freshState = await loadFreshState(client, ref.role, ref.subjectId, now);
  if (!freshState) return { safe: false, reason: "SUBJECT_NOT_FOUND" };

  if (!isEpisodeStillCurrent(ref.episodeKey, freshState)) {
    return { safe: false, reason: "EPISODE_OBSOLETE" };
  }

  const freshRecipients =
    ref.role === "STUDENT" ? await resolveStudentReminderRecipients(client, freshState) : await resolveSelfReminderRecipient(client, freshState, null);

  const stillValid = freshRecipients.some((r) => r.recipientUserId === ref.recipientUserId && r.contactAllowed);
  if (!stillValid) return { safe: false, reason: "RECIPIENT_NO_LONGER_VALID" };

  return { safe: true, freshState };
}
