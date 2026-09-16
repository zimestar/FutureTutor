import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import type { TutorApplicationStatus } from "@/generated/prisma/enums";
import { getTutorExperience } from "@/lib/tutorExperience";
import { REMINDER_ELIGIBILITY_MIN_INACTIVITY_MS } from "./config";
import type { LifecycleJourneyState, LifecycleStatus, SuppressionReason, TutorStage } from "./types";


/** A single admin decision is the sole remaining blocker for these two
 * stages (an admin must schedule/conduct the interview, or render the
 * final approve/reject verdict) — see types.ts's WAITING_ON_ADMIN doc
 * comment for why every other admin-pipeline stage stays
 * WAITING_ON_FUTURETUTOR instead. */
const ADMIN_DECISION_STAGES: TutorApplicationStatus[] = ["INTERVIEW_REQUIRED", "FINAL_REVIEW"];

export interface TutorLifecycleInput {
  id: string;
  userId: string;
  applicationStatus: TutorApplicationStatus;
  createdAt: Date;
  userDeactivatedAt: Date | null;
  /** Latest TutorDocument.uploadedAt — the only genuine, timestamped
   * pre-submission (DRAFT) progress signal available in the schema; adding
   * a TutorSubject/TutorLevel/TutorEducation row carries no createdAt field
   * to observe (a documented, honest gap — see LIFECYCLE-1A doc §9). */
  latestDocumentUploadedAt: Date | null;
  /** max(TutorApplicationNotification.createdAt) for this tutor — every
   * meaningful post-submission workflow transition (admin- or
   * tutor-caused) fires one of these inside the same transaction as the
   * state change it describes, so this is a faithful, already-durable
   * progress timestamp with zero new schema. */
  latestApplicationEventAt: Date | null;
  /** max(TutorTrainingProgress.completedAt ?? startedAt) — acknowledging a
   * training module does not itself fire a TutorApplicationNotification
   * (see tutorApplicationWorkflow.ts's own "deliberately NOT wired" list),
   * so without this a tutor who completes modules without finishing all of
   * them would incorrectly look inactive since TRAINING_UNLOCKED. */
  latestTrainingProgressAt: Date | null;
  /** max(TutorExamAttempt.submittedAt ?? startedAt) — same reasoning as
   * training: a failed attempt still fires EXAM_FAILED (covered by
   * latestApplicationEventAt), but this is kept as an explicit, independent
   * signal so exam progress is never solely dependent on the notification
   * outbox succeeding. */
  latestExamAttemptAt: Date | null;
}

function computeLastMeaningfulProgressAt(input: TutorLifecycleInput): Date {
  const candidates = [
    input.latestApplicationEventAt,
    input.latestDocumentUploadedAt,
    input.latestTrainingProgressAt,
    input.latestExamAttemptAt,
  ].filter((d): d is Date => d !== null);
  const latestSignal = candidates.reduce<Date | null>((max, d) => (max === null || d > max ? d : max), null);
  return latestSignal !== null && latestSignal > input.createdAt ? latestSignal : input.createdAt;
}

export function assessTutorLifecycle(input: TutorLifecycleInput, now: Date = new Date()): LifecycleJourneyState {
  const stage: TutorStage = input.applicationStatus;
  const lastMeaningfulProgressAt = computeLastMeaningfulProgressAt(input);
  const inactiveDurationMs = now.getTime() - lastMeaningfulProgressAt.getTime();

  const base = {
    role: "TUTOR" as const,
    journey: "TUTOR_CERTIFICATION" as const,
    subjectId: input.id,
    stage,
    lastMeaningfulProgressAt,
    inactiveDurationMs,
    recipientUserId: input.userId,
  };

  // Fail closed: a suspended account (universal User.deactivatedAt kill
  // switch) or a suspended application (Tutor-specific) never gets a
  // reminder, regardless of any other signal.
  const isAccountSuspended = input.userDeactivatedAt !== null;
  const isApplicationSuspended = input.applicationStatus === "SUSPENDED";
  if (isAccountSuspended || isApplicationSuspended) {
    return {
      ...base,
      status: "SUSPENDED",
      nextAction: null,
      userActionRequired: false,
      completedAt: null,
      reminderEligible: false,
      suppressionReason: isAccountSuspended ? "ACCOUNT_SUSPENDED" : "APPLICATION_SUSPENDED",
    };
  }

  if (input.applicationStatus === "REJECTED") {
    return {
      ...base,
      status: "REJECTED",
      nextAction: null,
      userActionRequired: false,
      completedAt: null,
      reminderEligible: false,
      suppressionReason: "APPLICATION_REJECTED",
    };
  }

  if (input.applicationStatus === "APPROVED") {
    return {
      ...base,
      status: "COMPLETED",
      nextAction: null,
      userActionRequired: false,
      // Best-available approval timestamp: the APPLICATION_APPROVED
      // notification row is created in the same transaction as the
      // applicationStatus write itself (approveTutor).
      completedAt: input.latestApplicationEventAt,
      reminderEligible: false,
      suppressionReason: "ONBOARDING_COMPLETED",
    };
  }

  const experience = getTutorExperience(input.applicationStatus);

  if (experience.responsibleParty === "tutor") {
    const reminderEligible = inactiveDurationMs >= REMINDER_ELIGIBILITY_MIN_INACTIVITY_MS;
    return {
      ...base,
      status: "USER_ACTION_REQUIRED",
      nextAction: experience.nextActionHref ?? null,
      userActionRequired: true,
      completedAt: null,
      reminderEligible,
      suppressionReason: reminderEligible ? null : "INACTIVITY_BELOW_THRESHOLD",
    };
  }

  const status: LifecycleStatus = ADMIN_DECISION_STAGES.includes(input.applicationStatus)
    ? "WAITING_ON_ADMIN"
    : "WAITING_ON_FUTURETUTOR";
  return {
    ...base,
    status,
    nextAction: null,
    userActionRequired: false,
    completedAt: null,
    reminderEligible: false,
    suppressionReason: status as SuppressionReason,
  };
}

export async function loadTutorLifecycleInput(
  client: PrismaClient,
  tutorProfileId: string
): Promise<TutorLifecycleInput | null> {
  const tutorProfile = await client.tutorProfile.findUnique({
    where: { id: tutorProfileId },
    select: {
      id: true,
      userId: true,
      applicationStatus: true,
      createdAt: true,
      user: { select: { deactivatedAt: true } },
    },
  });
  if (!tutorProfile) return null;

  const [latestDocument, latestEvent, latestTraining, latestExam] = await Promise.all([
    client.tutorDocument.findFirst({
      where: { tutorProfileId },
      orderBy: { uploadedAt: "desc" },
      select: { uploadedAt: true },
    }),
    client.tutorApplicationNotification.findFirst({
      where: { tutorProfileId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    client.tutorTrainingProgress.findMany({
      where: { tutorProfileId },
      select: { startedAt: true, completedAt: true },
    }),
    client.tutorExamAttempt.findFirst({
      where: { tutorProfileId },
      orderBy: { attemptNumber: "desc" },
      select: { startedAt: true, submittedAt: true },
    }),
  ]);

  const trainingTimestamps = latestTraining.flatMap((p) => [p.startedAt, p.completedAt]).filter((d): d is Date => d !== null);
  const latestTrainingProgressAt =
    trainingTimestamps.length > 0
      ? trainingTimestamps.reduce((max, d) => (d > max ? d : max))
      : null;

  return {
    id: tutorProfile.id,
    userId: tutorProfile.userId,
    applicationStatus: tutorProfile.applicationStatus,
    createdAt: tutorProfile.createdAt,
    userDeactivatedAt: tutorProfile.user.deactivatedAt,
    latestDocumentUploadedAt: latestDocument?.uploadedAt ?? null,
    latestApplicationEventAt: latestEvent?.createdAt ?? null,
    latestTrainingProgressAt,
    latestExamAttemptAt: latestExam?.submittedAt ?? latestExam?.startedAt ?? null,
  };
}

export async function getTutorLifecycle(
  client: PrismaClient,
  tutorProfileId: string,
  now: Date = new Date()
): Promise<LifecycleJourneyState | null> {
  const input = await loadTutorLifecycleInput(client, tutorProfileId);
  if (!input) return null;
  return assessTutorLifecycle(input, now);
}
