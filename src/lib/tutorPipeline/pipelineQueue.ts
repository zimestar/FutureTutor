import type { TutorApplicationStatus } from "@/generated/prisma/enums";

/**
 * TUTOR-PIPELINE1 — who has to act next on a tutor application, and what.
 *
 * Pure: the caller loads the facts (see src/services/tutorPipelineQueue.ts),
 * this decides. Used by the admin pipeline board and the daily digest so
 * both always agree. `nextAction` is a translation key under
 * "adminAlertEmail.nextActions" (shared by the email and the board).
 */

export type PipelineOwner = "admin" | "candidate" | "none";

export type PipelineNextAction =
  | "completeApplication"
  | "startReview"
  | "reviewDocuments"
  | "uploadDocuments"
  | "requireInterview"
  | "scheduleInterview"
  | "attendInterview"
  | "recordInterview"
  | "requireTraining"
  | "completeTraining"
  | "requireExam"
  | "passExam"
  | "sendToFinalReview"
  | "finalDecision"
  | "none";

export interface PipelineFacts {
  status: TutorApplicationStatus;
  /** When the application last changed (TutorProfile.updatedAt). */
  lastActivityAt: Date;
  /** Upload time of the oldest document still awaiting a decision, if any. */
  oldestPendingDocumentAt: Date | null;
  hasApprovedEducationDocument: boolean;
  /** Most recent interview still in SCHEDULED state, if any. */
  scheduledInterviewAt: Date | null;
}

export interface PipelineItem {
  owner: PipelineOwner;
  nextAction: PipelineNextAction;
  /** Since when this owner has had the ball. */
  waitingSince: Date;
}

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function waitingDays(item: Pick<PipelineItem, "waitingSince">, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - item.waitingSince.getTime()) / MS_PER_DAY));
}

export function classifyPipelineItem(facts: PipelineFacts, now: Date): PipelineItem {
  const since = facts.lastActivityAt;
  const admin = (nextAction: PipelineNextAction, waitingSince: Date = since): PipelineItem => ({ owner: "admin", nextAction, waitingSince });
  const candidate = (nextAction: PipelineNextAction): PipelineItem => ({ owner: "candidate", nextAction, waitingSince: since });

  switch (facts.status) {
    case "DRAFT":
      return candidate("completeApplication");
    case "SUBMITTED":
      return admin("startReview");
    case "UNDER_REVIEW":
      if (facts.oldestPendingDocumentAt) return admin("reviewDocuments", facts.oldestPendingDocumentAt);
      if (facts.hasApprovedEducationDocument) return admin("requireInterview");
      return candidate("uploadDocuments");
    case "INTERVIEW_REQUIRED":
      if (!facts.scheduledInterviewAt) return admin("scheduleInterview");
      if (facts.scheduledInterviewAt.getTime() > now.getTime()) {
        return { owner: "none", nextAction: "attendInterview", waitingSince: since };
      }
      return admin("recordInterview", facts.scheduledInterviewAt);
    case "INTERVIEW_COMPLETED":
      return admin("requireTraining");
    case "TRAINING_REQUIRED":
      return candidate("completeTraining");
    case "TRAINING_COMPLETED":
      return admin("requireExam");
    case "EXAM_REQUIRED":
      return candidate("passExam");
    case "EXAM_COMPLETED":
      return admin("sendToFinalReview");
    case "FINAL_REVIEW":
      return admin("finalDecision");
    default:
      return { owner: "none", nextAction: "none", waitingSince: since };
  }
}

/** Board column order: the pipeline's own order, terminal states excluded. */
export const PIPELINE_STAGES: TutorApplicationStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "INTERVIEW_REQUIRED",
  "INTERVIEW_COMPLETED",
  "TRAINING_REQUIRED",
  "TRAINING_COMPLETED",
  "EXAM_REQUIRED",
  "EXAM_COMPLETED",
  "FINAL_REVIEW",
];

/** An admin-owned item waiting at least this long goes into the daily digest. */
export const DIGEST_THRESHOLD_DAYS = 2;
