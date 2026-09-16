import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { getTutorLifecycle } from "./tutorLifecycle";
import { getParentLifecycle } from "./parentLifecycle";
import { getStudentProfileLifecycle, getStudentLoginLinkingLifecycle } from "./studentLifecycle";
import type { LifecycleJourneyState } from "./types";

export * from "./types";
export { LIFECYCLE_INACTIVITY_THRESHOLDS_MS, REMINDER_ELIGIBILITY_MIN_INACTIVITY_MS } from "./config";
export {
  assessTutorLifecycle,
  loadTutorLifecycleInput,
  getTutorLifecycle,
  type TutorLifecycleInput,
} from "./tutorLifecycle";
export {
  assessParentLifecycle,
  loadParentLifecycleInput,
  getParentLifecycle,
  type ParentLifecycleInput,
} from "./parentLifecycle";
export {
  assessStudentProfileLifecycle,
  loadStudentProfileLifecycleInput,
  getStudentProfileLifecycle,
  assessStudentLoginLinking,
  loadStudentLoginLinkingInput,
  getStudentLoginLinkingLifecycle,
  type StudentProfileLifecycleInput,
  type StudentLoginLinkingInput,
} from "./studentLifecycle";

/**
 * A STUDENT User is evaluated under STUDENT_LOGIN_LINKING while they have no
 * linked StudentProfile of their own, and under STUDENT_PROFILE_READINESS
 * once they do (mirrors resolveStudentAccountActivationState's own ACTIVE /
 * not-ACTIVE split in familyManagement.ts — see studentLifecycle.ts).
 */
export async function getLifecycleJourneyForStudentUser(
  client: PrismaClient,
  userId: string,
  now: Date = new Date()
): Promise<LifecycleJourneyState | null> {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { studentProfile: { select: { id: true } } },
  });
  if (!user) return null;

  if (user.studentProfile) {
    return getStudentProfileLifecycle(client, user.studentProfile.id, now);
  }
  return getStudentLoginLinkingLifecycle(client, userId, now);
}

export type LifecycleSubjectRef =
  | { kind: "TUTOR_PROFILE"; tutorProfileId: string }
  | { kind: "PARENT_PROFILE"; parentProfileId: string }
  | { kind: "STUDENT_PROFILE"; studentProfileId: string }
  | { kind: "STUDENT_USER"; userId: string };

/**
 * Single deterministic entry point, matching the mission's own
 * `assessLifecycleJourney(...)` naming. Thin dispatch only — every real
 * decision lives in the per-role evaluator it calls into, so this function
 * never becomes a second copy of that logic.
 */
export async function assessLifecycleJourney(
  client: PrismaClient,
  ref: LifecycleSubjectRef,
  now: Date = new Date()
): Promise<LifecycleJourneyState | null> {
  switch (ref.kind) {
    case "TUTOR_PROFILE":
      return getTutorLifecycle(client, ref.tutorProfileId, now);
    case "PARENT_PROFILE":
      return getParentLifecycle(client, ref.parentProfileId, now);
    case "STUDENT_PROFILE":
      return getStudentProfileLifecycle(client, ref.studentProfileId, now);
    case "STUDENT_USER":
      return getLifecycleJourneyForStudentUser(client, ref.userId, now);
  }
}
