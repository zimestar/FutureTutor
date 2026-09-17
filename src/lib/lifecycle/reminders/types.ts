import type { LifecycleJourneyState, LifecycleRole } from "../types";

export type { LifecycleRole };

/**
 * LIFECYCLE-1B — reminder-engine design layer, built strictly on top of the
 * LIFECYCLE-1A evaluators (src/lib/lifecycle/*Lifecycle.ts). Everything in
 * this directory that touches a database reads EXISTING tables only
 * (TutorProfile/ParentProfile/StudentProfile family, ParentStudentRelationship,
 * NotificationPreference, User) — nothing here creates or depends on new
 * persistence. The parts that genuinely require durable reminder-history
 * persistence (idempotent send-tracking, the cron worker, pre-send recheck
 * against a claimed row) are DESIGN ONLY, specified in
 * docs/lifecycle/LIFECYCLE-1B-REMINDER-ENGINE.md and the schema proposal —
 * not implemented here, per the mission's mandatory schema gate.
 */

export type ReminderNumber = 1 | 2 | 3;

/**
 * A deterministic identity for "the actionable episode currently in
 * progress for this subject." Two evaluations of the same still-in-progress
 * episode always produce the same key; any of stage-change or
 * progress-anchor-change (which LIFECYCLE-1A already computes as
 * `lastMeaningfulProgressAt`) produces a different key — see episode.ts's
 * doc comment for the full reasoning.
 */
export type EpisodeKey = string;

export type ReminderRelationship = "SELF" | "GUARDIAN";

export type RecipientSuppressionReason =
  | "NO_SAFE_RECIPIENT"
  | "EMAIL_DISABLED_BY_PREFERENCE"
  | "MISSING_EMAIL"
  | "NOT_USER_ACTION_REQUIRED";

export interface ReminderRecipient {
  subjectId: string;
  recipientUserId: string;
  recipientEmail: string;
  relationship: ReminderRelationship;
  locale: "en" | "fr";
  contactAllowed: boolean;
  suppressionReason: RecipientSuppressionReason | null;
}

/** What content.ts needs to select and render one reminder — deliberately
 * excludes anything DB-shaped (ids, emails) beyond what's needed to render
 * copy and a link. */
export interface ReminderContentContext {
  locale: "en" | "fr";
  recipientFirstName: string;
  relationship: ReminderRelationship;
  role: LifecycleJourneyState["role"];
  stage: LifecycleJourneyState["stage"];
  reminderNumber: ReminderNumber;
  deepLinkUrl: string;
}

export interface ReminderEmailContent {
  subject: string;
  html: string;
  text: string;
}
