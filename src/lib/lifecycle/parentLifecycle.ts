import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { REMINDER_ELIGIBILITY_MIN_INACTIVITY_MS } from "./config";
import type { LifecycleJourneyState } from "./types";


/**
 * Parent has no distinct "profile incomplete" stage — firstName/lastName
 * are the only ParentProfile fields and both are mandatory, set atomically
 * at signup (src/services/signup.ts). The one real, source-evidenced
 * onboarding action left for a Parent is adding at least one child (the
 * dashboard's own "learners.emptyDescription" / "addCta" — see
 * src/app/[locale]/dashboard/page.tsx). A child's OWN profile completeness
 * (academic level / city / etc.) is that child's StudentProfile's own
 * journey (STUDENT_PROFILE_READINESS, see studentLifecycle.ts) — evaluated
 * separately per child rather than folded into the Parent's own state, so
 * "the parent has no action left" and "one of their children's profiles is
 * incomplete" stay distinguishable, per the mission's explicit instruction
 * not to falsely classify a Parent with no real action remaining.
 */
export interface ParentLifecycleInput {
  id: string;
  userId: string;
  createdAt: Date;
  userDeactivatedAt: Date | null;
  activeChildrenCount: number;
  /** max(ParentStudentRelationship.createdAt) across every relationship
   * this parent has ever created (active or revoked) — a real, timestamped
   * action even if the relationship was later revoked. */
  latestChildActionAt: Date | null;
  /** max(AuditLog.createdAt) for this ParentProfile's own
   * "profile.parent.updated" rows. */
  latestProfileEditAt: Date | null;
  /** The earliest still-ACTIVE relationship's createdAt — used as a
   * best-effort "became ready" timestamp. Not exact if the first-ever
   * child was later revoked and replaced by a different one, but the
   * closest available signal without inventing a new persisted field. */
  earliestActiveRelationshipCreatedAt: Date | null;
}

function computeLastMeaningfulProgressAt(input: ParentLifecycleInput): Date {
  const candidates = [input.latestChildActionAt, input.latestProfileEditAt].filter((d): d is Date => d !== null);
  const latestSignal = candidates.reduce<Date | null>((max, d) => (max === null || d > max ? d : max), null);
  return latestSignal !== null && latestSignal > input.createdAt ? latestSignal : input.createdAt;
}

export function assessParentLifecycle(input: ParentLifecycleInput, now: Date = new Date()): LifecycleJourneyState {
  const lastMeaningfulProgressAt = computeLastMeaningfulProgressAt(input);
  const inactiveDurationMs = now.getTime() - lastMeaningfulProgressAt.getTime();

  const base = {
    role: "PARENT" as const,
    journey: "PARENT_ACTIVATION" as const,
    subjectId: input.id,
    lastMeaningfulProgressAt,
    inactiveDurationMs,
    recipientUserId: input.userId,
  };

  if (input.userDeactivatedAt !== null) {
    return {
      ...base,
      stage: "STUDENT_SETUP",
      status: "SUSPENDED",
      nextAction: null,
      userActionRequired: false,
      completedAt: null,
      reminderEligible: false,
      suppressionReason: "ACCOUNT_SUSPENDED",
    };
  }

  if (input.activeChildrenCount > 0) {
    return {
      ...base,
      stage: "READY",
      status: "COMPLETED",
      nextAction: null,
      userActionRequired: false,
      completedAt: input.earliestActiveRelationshipCreatedAt,
      reminderEligible: false,
      suppressionReason: "ONBOARDING_COMPLETED",
    };
  }

  const reminderEligible = inactiveDurationMs >= REMINDER_ELIGIBILITY_MIN_INACTIVITY_MS;
  return {
    ...base,
    stage: "STUDENT_SETUP",
    status: "USER_ACTION_REQUIRED",
    nextAction: "/dashboard/family",
    userActionRequired: true,
    completedAt: null,
    reminderEligible,
    suppressionReason: reminderEligible ? null : "INACTIVITY_BELOW_THRESHOLD",
  };
}

export async function loadParentLifecycleInput(
  client: PrismaClient,
  parentProfileId: string
): Promise<ParentLifecycleInput | null> {
  const parentProfile = await client.parentProfile.findUnique({
    where: { id: parentProfileId },
    select: { id: true, userId: true, createdAt: true, user: { select: { deactivatedAt: true } } },
  });
  if (!parentProfile) return null;

  const [activeChildrenCount, relationships, latestProfileEdit] = await Promise.all([
    client.parentStudentRelationship.count({ where: { parentProfileId, status: "ACTIVE" } }),
    client.parentStudentRelationship.findMany({
      where: { parentProfileId },
      select: { createdAt: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
    client.auditLog.findFirst({
      where: { entityType: "ParentProfile", entityId: parentProfileId, action: "profile.parent.updated" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  const latestChildActionAt =
    relationships.length > 0 ? relationships.reduce((max, r) => (r.createdAt > max ? r.createdAt : max), relationships[0].createdAt) : null;
  const earliestActiveRelationshipCreatedAt = relationships.find((r) => r.status === "ACTIVE")?.createdAt ?? null;

  return {
    id: parentProfile.id,
    userId: parentProfile.userId,
    createdAt: parentProfile.createdAt,
    userDeactivatedAt: parentProfile.user.deactivatedAt,
    activeChildrenCount,
    latestChildActionAt,
    latestProfileEditAt: latestProfileEdit?.createdAt ?? null,
    earliestActiveRelationshipCreatedAt,
  };
}

export async function getParentLifecycle(
  client: PrismaClient,
  parentProfileId: string,
  now: Date = new Date()
): Promise<LifecycleJourneyState | null> {
  const input = await loadParentLifecycleInput(client, parentProfileId);
  if (!input) return null;
  return assessParentLifecycle(input, now);
}
