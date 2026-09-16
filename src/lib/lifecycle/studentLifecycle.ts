import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import type { StudentManagementMode } from "@/generated/prisma/enums";
import { resolveStudentAccountActivationState } from "@/services/familyManagement";
import { REMINDER_ELIGIBILITY_MIN_INACTIVITY_MS } from "./config";
import type { LifecycleJourneyState } from "./types";

// ---------------------------------------------------------------------------
// STUDENT_PROFILE_READINESS — applies to every existing StudentProfile
// (SELF_MANAGED or GUARDIAN_MANAGED alike). Reuses profileFieldsFilled()'s
// exact 3-field definition from src/app/[locale]/dashboard/page.tsx (the
// only place in the product that already treats a StudentProfile as
// "needing attention") rather than inventing a second definition.
// ---------------------------------------------------------------------------

export interface StudentProfileLifecycleInput {
  id: string;
  userId: string | null;
  managementMode: StudentManagementMode;
  createdAt: Date;
  academicLevelId: string | null;
  province: string | null;
  city: string | null;
  /** Only meaningful when userId is set — a GUARDIAN_MANAGED profile with
   * no login of its own has no deactivation state to check; per
   * accountSuspension.ts, a suspended guardian's authority is revoked
   * without cascading to the child's own StudentProfile. */
  userDeactivatedAt: Date | null;
  /** max(AuditLog.createdAt) for this StudentProfile's own
   * "profile.student.updated" rows (fired for edits by either a
   * SELF_MANAGED student or an active guardian — see
   * profileManagement.ts). */
  latestProfileEditAt: Date | null;
}

function profileFieldsFilledCount(input: Pick<StudentProfileLifecycleInput, "academicLevelId" | "province" | "city">) {
  return [input.academicLevelId, input.province, input.city].filter(Boolean).length;
}

function computeLastMeaningfulProgressAt(input: StudentProfileLifecycleInput): Date {
  return input.latestProfileEditAt !== null && input.latestProfileEditAt > input.createdAt
    ? input.latestProfileEditAt
    : input.createdAt;
}

export function assessStudentProfileLifecycle(
  input: StudentProfileLifecycleInput,
  now: Date = new Date()
): LifecycleJourneyState {
  const lastMeaningfulProgressAt = computeLastMeaningfulProgressAt(input);
  const inactiveDurationMs = now.getTime() - lastMeaningfulProgressAt.getTime();
  const isReady = profileFieldsFilledCount(input) === 3;

  const base = {
    role: "STUDENT" as const,
    journey: "STUDENT_PROFILE_READINESS" as const,
    subjectId: input.id,
    lastMeaningfulProgressAt,
    inactiveDurationMs,
    // A GUARDIAN_MANAGED child with no login of their own has no directly
    // contactable User — LIFECYCLE-1B must resolve the guardian recipient
    // itself via ParentStudentRelationship (Phase 10 subject/recipient
    // split). Never guessed here.
    recipientUserId: input.userId,
  };

  if (input.userId !== null && input.userDeactivatedAt !== null) {
    return {
      ...base,
      stage: "PROFILE",
      status: "SUSPENDED",
      nextAction: null,
      userActionRequired: false,
      completedAt: null,
      reminderEligible: false,
      suppressionReason: "ACCOUNT_SUSPENDED",
    };
  }

  if (isReady) {
    return {
      ...base,
      stage: "READY",
      status: "COMPLETED",
      nextAction: null,
      userActionRequired: false,
      completedAt: input.latestProfileEditAt,
      reminderEligible: false,
      suppressionReason: "ONBOARDING_COMPLETED",
    };
  }

  const reminderEligible = inactiveDurationMs >= REMINDER_ELIGIBILITY_MIN_INACTIVITY_MS;
  return {
    ...base,
    stage: "PROFILE",
    status: "USER_ACTION_REQUIRED",
    nextAction: input.managementMode === "GUARDIAN_MANAGED" ? "/dashboard/family" : "/dashboard/profile",
    userActionRequired: true,
    completedAt: null,
    reminderEligible,
    suppressionReason: reminderEligible ? null : "INACTIVITY_BELOW_THRESHOLD",
  };
}

export async function loadStudentProfileLifecycleInput(
  client: PrismaClient,
  studentProfileId: string
): Promise<StudentProfileLifecycleInput | null> {
  const studentProfile = await client.studentProfile.findUnique({
    where: { id: studentProfileId },
    select: {
      id: true,
      userId: true,
      managementMode: true,
      createdAt: true,
      academicLevelId: true,
      province: true,
      city: true,
      user: { select: { deactivatedAt: true } },
    },
  });
  if (!studentProfile) return null;

  const latestProfileEdit = await client.auditLog.findFirst({
    where: { entityType: "StudentProfile", entityId: studentProfileId, action: "profile.student.updated" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  return {
    id: studentProfile.id,
    userId: studentProfile.userId,
    managementMode: studentProfile.managementMode,
    createdAt: studentProfile.createdAt,
    academicLevelId: studentProfile.academicLevelId,
    province: studentProfile.province,
    city: studentProfile.city,
    userDeactivatedAt: studentProfile.user?.deactivatedAt ?? null,
    latestProfileEditAt: latestProfileEdit?.createdAt ?? null,
  };
}

export async function getStudentProfileLifecycle(
  client: PrismaClient,
  studentProfileId: string,
  now: Date = new Date()
): Promise<LifecycleJourneyState | null> {
  const input = await loadStudentProfileLifecycleInput(client, studentProfileId);
  if (!input) return null;
  return assessStudentProfileLifecycle(input, now);
}

// ---------------------------------------------------------------------------
// STUDENT_LOGIN_LINKING — a distinct sub-journey for a User (role STUDENT)
// who has NO linked StudentProfile of their own yet. This is the
// FamilyInvitation(type: STUDENT_LOGIN) claim flow (Phase H.5): a
// GUARDIAN_MANAGED child claiming their own login, which only grants real
// access once a guardian approves it (PENDING_GUARDIAN_APPROVAL ->
// ACCEPTED). Deliberately reuses resolveStudentAccountActivationState
// (familyManagement.ts) rather than re-deriving its precedence rules —
// LIFECYCLE-1A must observe, never fork, that state machine.
// ---------------------------------------------------------------------------

export interface StudentLoginLinkingInput {
  userId: string;
  createdAt: Date;
  userDeactivatedAt: Date | null;
  activationState: "UNLINKED" | "PENDING_GUARDIAN_APPROVAL" | "REJECTED_OR_REVOKED" | "EXPIRED";
  /** The relevant invitation's claimedAt, when one exists. Null only for
   * UNLINKED (no claim was ever made). */
  activationStateAt: Date | null;
}

function computeLoginLinkingProgressAt(input: StudentLoginLinkingInput): Date {
  return input.activationStateAt !== null && input.activationStateAt > input.createdAt
    ? input.activationStateAt
    : input.createdAt;
}

export function assessStudentLoginLinking(input: StudentLoginLinkingInput, now: Date = new Date()): LifecycleJourneyState {
  const lastMeaningfulProgressAt = computeLoginLinkingProgressAt(input);
  const inactiveDurationMs = now.getTime() - lastMeaningfulProgressAt.getTime();

  const base = {
    role: "STUDENT" as const,
    journey: "STUDENT_LOGIN_LINKING" as const,
    subjectId: input.userId,
    lastMeaningfulProgressAt,
    inactiveDurationMs,
    recipientUserId: input.userId,
  };

  if (input.userDeactivatedAt !== null) {
    return {
      ...base,
      stage: input.activationState,
      status: "SUSPENDED",
      nextAction: null,
      userActionRequired: false,
      completedAt: null,
      reminderEligible: false,
      suppressionReason: "ACCOUNT_SUSPENDED",
    };
  }

  switch (input.activationState) {
    case "PENDING_GUARDIAN_APPROVAL":
      // The mission's own worked example: a student waiting on a guardian
      // decision must never be nudged as if the ball were in their court.
      return {
        ...base,
        stage: "PENDING_GUARDIAN_APPROVAL",
        status: "WAITING_ON_GUARDIAN",
        nextAction: null,
        userActionRequired: false,
        completedAt: null,
        reminderEligible: false,
        suppressionReason: "WAITING_ON_GUARDIAN",
      };
    case "REJECTED_OR_REVOKED":
      return {
        ...base,
        stage: "REJECTED_OR_REVOKED",
        status: "REJECTED",
        nextAction: null,
        userActionRequired: false,
        completedAt: null,
        reminderEligible: false,
        suppressionReason: "APPLICATION_REJECTED",
      };
    case "EXPIRED":
      return {
        ...base,
        stage: "EXPIRED",
        status: "INELIGIBLE",
        nextAction: null,
        userActionRequired: false,
        completedAt: null,
        reminderEligible: false,
        suppressionReason: "CLAIM_EXPIRED",
      };
    case "UNLINKED":
    default:
      // A STUDENT-role User with no profile and no claim of any kind at
      // all is a state the product has no self-service recovery UI for —
      // fail closed rather than invent a next action that doesn't exist.
      return {
        ...base,
        stage: "UNLINKED",
        status: "UNKNOWN",
        nextAction: null,
        userActionRequired: false,
        completedAt: null,
        reminderEligible: false,
        suppressionReason: "MISSING_STATE_EVIDENCE",
      };
  }
}

export async function loadStudentLoginLinkingInput(
  client: PrismaClient,
  userId: string
): Promise<StudentLoginLinkingInput | null> {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, createdAt: true, deactivatedAt: true },
  });
  if (!user || user.role !== "STUDENT") return null;

  const activation = await resolveStudentAccountActivationState(client, userId);
  if (activation.state === "ACTIVE") return null; // linked — STUDENT_PROFILE_READINESS applies instead

  let activationStateAt: Date | null = null;
  if (activation.state !== "UNLINKED") {
    const invitation = await client.familyInvitation.findUnique({
      where: { id: activation.invitationId },
      select: { claimedAt: true },
    });
    activationStateAt = invitation?.claimedAt ?? null;
  }

  return {
    userId: user.id,
    createdAt: user.createdAt,
    userDeactivatedAt: user.deactivatedAt,
    activationState: activation.state,
    activationStateAt,
  };
}

export async function getStudentLoginLinkingLifecycle(
  client: PrismaClient,
  userId: string,
  now: Date = new Date()
): Promise<LifecycleJourneyState | null> {
  const input = await loadStudentLoginLinkingInput(client, userId);
  if (!input) return null;
  return assessStudentLoginLinking(input, now);
}
