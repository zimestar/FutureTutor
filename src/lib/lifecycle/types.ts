import type { TutorApplicationStatus } from "@/generated/prisma/enums";

/**
 * LIFECYCLE-1A — the normalized, cross-role onboarding-state representation.
 *
 * This is a READ-ONLY, DERIVED view over the real domain state machines that
 * already exist in this codebase (TutorProfile.applicationStatus + its
 * workflow in src/services/tutorApplicationWorkflow.ts / src/lib/
 * tutorExperience.ts; StudentAccountActivationState in
 * src/services/familyManagement.ts; ParentStudentRelationship; User.
 * deactivatedAt). It never writes to those tables and never becomes a
 * second, competing source of truth — every LifecycleJourneyState is
 * recomputed fresh from the authoritative rows each time it's requested.
 */

export type LifecycleRole = "TUTOR" | "PARENT" | "STUDENT";

/** Which normalized journey this assessment describes. A STUDENT subject can
 * be evaluated under either journey depending on what's actually in
 * progress for them — see studentLifecycle.ts's doc comment. */
export type LifecycleJourney =
  | "TUTOR_CERTIFICATION"
  | "PARENT_ACTIVATION"
  | "STUDENT_PROFILE_READINESS"
  | "STUDENT_LOGIN_LINKING";

/**
 * Bounded status taxonomy (mission §"IMPORTANT PRODUCT PRINCIPLE" /
 * Phase 6). Deliberately not a boolean — "incomplete" always resolves to
 * exactly one of these, never collapsed.
 *
 * WAITING_ON_FUTURETUTOR vs WAITING_ON_ADMIN: the Tutor pipeline is almost
 * entirely admin-operated (see tutorExperience.ts's own `responsibleParty:
 * "futureTutor"` for every non-tutor-facing stage) with no source-evidenced
 * distinction between "routine ops queue" and "named admin decision" for
 * most of it. This evaluator only promotes a stage to WAITING_ON_ADMIN when
 * source code shows a single, specific, discrete admin decision is the sole
 * remaining blocker (INTERVIEW_REQUIRED — an admin must schedule/conduct the
 * interview; FINAL_REVIEW — an admin must render approve/reject). Every
 * other admin-pipeline stage is WAITING_ON_FUTURETUTOR. Both are always
 * REMINDER_ELIGIBLE = false, so this distinction is informational, not
 * behavior-changing, in LIFECYCLE-1A.
 */
export type LifecycleStatus =
  | "USER_ACTION_REQUIRED"
  | "WAITING_ON_FUTURETUTOR"
  | "WAITING_ON_ADMIN"
  | "WAITING_ON_GUARDIAN"
  | "COMPLETED"
  | "REJECTED"
  | "SUSPENDED"
  | "INELIGIBLE"
  | "UNKNOWN";

/** Tutor stage taxonomy is the literal, existing TutorApplicationStatus enum
 * — the smallest truthful taxonomy is the one the domain already uses; a
 * parallel invented enum would only be able to drift from it. */
export type TutorStage = TutorApplicationStatus;

/** Parent has no distinct "PROFILE incomplete" stage: firstName/lastName
 * are the only ParentProfile fields and both are mandatory, atomically set
 * at signup (src/services/signup.ts) — there is no source-evidenced
 * intermediate incomplete-profile state to model. */
export type ParentStage = "STUDENT_SETUP" | "READY";

/** profileFieldsFilled() in src/app/[locale]/dashboard/page.tsx is the
 * existing, real product signal for "this StudentProfile needs attention" —
 * reused here rather than inventing a second definition. */
export type StudentProfileStage = "PROFILE" | "READY";

/** Mirrors StudentAccountActivationState in familyManagement.ts, minus its
 * ACTIVE case (which means this sub-journey no longer applies — the User is
 * linked and STUDENT_PROFILE_READINESS takes over instead). */
export type StudentLoginLinkingStage = "UNLINKED" | "PENDING_GUARDIAN_APPROVAL" | "REJECTED_OR_REVOKED" | "EXPIRED";

export type LifecycleStage = TutorStage | ParentStage | StudentProfileStage | StudentLoginLinkingStage;

export type SuppressionReason =
  | "APPLICATION_APPROVED"
  | "APPLICATION_REJECTED"
  | "APPLICATION_SUSPENDED"
  | "ACCOUNT_SUSPENDED"
  | "ADMIN_ACCOUNT"
  | "WAITING_ON_FUTURETUTOR"
  | "WAITING_ON_ADMIN"
  | "WAITING_ON_GUARDIAN"
  | "ONBOARDING_COMPLETED"
  | "INACTIVITY_BELOW_THRESHOLD"
  | "INELIGIBLE_ROLE_OR_STATE"
  | "CLAIM_EXPIRED"
  | "UNKNOWN_STATE"
  | "MISSING_STATE_EVIDENCE";

/**
 * Conceptual shape from the mission text, adapted to this codebase.
 * `subjectId`/`subjectLabel` identify WHO the journey is about (the Phase 10
 * "journey subject"), which is not always who a future reminder would be
 * sent to (the Phase 10 "reminder recipient") — see recipientUserId.
 */
export interface LifecycleJourneyState {
  role: LifecycleRole;
  journey: LifecycleJourney;
  /** The id of the row this assessment is about — TutorProfile.id,
   * ParentProfile.id, or StudentProfile.id (STUDENT_PROFILE_READINESS) /
   * User.id (STUDENT_LOGIN_LINKING, before any StudentProfile exists). */
  subjectId: string;
  stage: LifecycleStage;
  status: LifecycleStatus;
  /** A relative app path the subject (or recipient) should be sent to next,
   * or null when there is no single-action next step (e.g. while waiting on
   * FutureTutor/admin/guardian, or once complete). */
  nextAction: string | null;
  userActionRequired: boolean;
  lastMeaningfulProgressAt: Date | null;
  /** Milliseconds since lastMeaningfulProgressAt, or null if that is null
   * (MISSING_STATE_EVIDENCE — never treated as "infinitely inactive"). */
  inactiveDurationMs: number | null;
  completedAt: Date | null;
  reminderEligible: boolean;
  suppressionReason: SuppressionReason | null;
  /** Phase 10 — who a future reminder would go to, distinct from the
   * journey subject. Null when undetermined (e.g. a GUARDIAN_MANAGED child
   * with no linked User of their own — LIFECYCLE-1B must resolve the
   * guardian recipient itself; this field deliberately does not guess a
   * User to email). Populated whenever the subject IS a directly
   * contactable User (Tutor, Parent, SELF_MANAGED/linked Student). */
  recipientUserId: string | null;
}
