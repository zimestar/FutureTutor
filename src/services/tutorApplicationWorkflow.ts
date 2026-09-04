import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { calculateInitialTutorScore } from "@/services/tutorScoring";
import { emitTutorApplicationEvent, dispatchTutorApplicationNotifications } from "@/services/tutorApplicationNotifications";
import { Prisma } from "@/generated/prisma/client";
import type {
  TutorApplicationStatus,
  TutorDocumentType,
  TutorInterviewCriterion,
} from "@/generated/prisma/enums";

/**
 * The only module allowed to write TutorProfile.applicationStatus. Every
 * function re-validates its own precondition (the "from" status) and any
 * additional gate against the database directly — never trusting a caller's
 * claim about what state a tutor is in — so a forged Server Action call
 * can't skip a step in the pipeline.
 *
 * PROD-TUTOR-APPLICATION-NOTIFICATIONS1 — this is also the sole,
 * centralized trigger point for tutor-application-lifecycle notifications
 * (email + in-app): every function that represents a meaningful,
 * tutor-visible business event calls emitTutorApplicationEvent(tx, ...)
 * inside its own transaction (so the notification's durable outbox row
 * commits atomically with the workflow change it describes), then, after
 * the transaction commits, calls dispatchTutorApplicationNotifications(...)
 * (fire-and-forget, errors never rethrown — a Resend outage can never
 * roll back or block a document review, interview result, training/exam
 * progress, or approval/rejection). Because this module is the *only*
 * place applicationStatus is written, and because every document/
 * interview/training/exam action already funnels through here too, no
 * Server Action anywhere can mutate tutor-visible lifecycle state without
 * the corresponding notification logic running.
 *
 * Deliberately NOT wired to a notification: requireInterview (no
 * standalone candidate event names "entered the interview-required stage
 * with no date yet" — the tutor-actionable event is INTERVIEW_SCHEDULED,
 * fired separately once a real date exists), recordInterviewEvaluation
 * (a single rubric criterion score is exactly the "hidden scoring change"
 * the mission's notification policy excludes — only the fully-scored
 * completeInterview fires), verifyEducation/verifyCertification (internal
 * qualification bookkeeping, no tutor-visible consequence on its own).
 */

export class IllegalTransitionError extends Error {}
export class TransitionGateError extends Error {}

const REQUIRED_EDUCATION_DOCUMENT_TYPES: TutorDocumentType[] = ["TRANSCRIPT", "DIPLOMA", "DEGREE"];
const INTERVIEW_CRITERIA: TutorInterviewCriterion[] = [
  "COMMUNICATION",
  "PEDAGOGY",
  "PROFESSIONALISM",
  "SUBJECT_CONFIDENCE",
  "STUDENT_INTERACTION",
  "MOTIVATION_ALIGNMENT",
];
const NON_TERMINAL_STATUSES: TutorApplicationStatus[] = [
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

// Plain-English, in-app-only labels (matches notify.ts's own "no per-user
// locale at write time" convention — the email side uses the real
// translated tutorDocuments.types.<TYPE> namespace instead).
const DOCUMENT_TYPE_IN_APP_LABELS: Record<TutorDocumentType, string> = {
  TRANSCRIPT: "transcript",
  DIPLOMA: "diploma",
  DEGREE: "degree",
  CERTIFICATE: "certificate",
  ENROLLMENT_PROOF: "proof of enrollment",
  OTHER: "document",
};

function dispatchAfterCommit(tutorProfileId: string): Promise<void> {
  return dispatchTutorApplicationNotifications(tutorProfileId).catch((error) => {
    console.error(
      "[tutorApplicationNotifications] dispatch failed",
      error instanceof Error ? error.message : String(error)
    );
  });
}

async function assertStatus(
  tx: Prisma.TransactionClient,
  tutorProfileId: string,
  expected: TutorApplicationStatus | TutorApplicationStatus[]
) {
  const tutor = await tx.tutorProfile.findUniqueOrThrow({ where: { id: tutorProfileId } });
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(tutor.applicationStatus)) {
    throw new IllegalTransitionError(
      `Cannot perform this transition from status ${tutor.applicationStatus} (expected one of: ${allowed.join(", ")})`
    );
  }
  return tutor;
}

// --- Gate checks (also re-run from scratch inside approveTutor; exported
// so the admin UI can display the same gate status it's enforced by) -----

export async function hasApprovedEducationDocument(tx: Prisma.TransactionClient, tutorProfileId: string) {
  const count = await tx.tutorDocument.count({
    where: { tutorProfileId, status: "APPROVED", type: { in: REQUIRED_EDUCATION_DOCUMENT_TYPES } },
  });
  return count > 0;
}

export async function interviewIsFullyScored(tx: Prisma.TransactionClient, tutorProfileId: string) {
  const interview = await tx.tutorInterview.findFirst({
    where: { tutorProfileId },
    orderBy: { scheduledAt: "desc" },
    include: { evaluations: true },
  });
  if (!interview) return false;
  const scoredCriteria = new Set(interview.evaluations.map((e) => e.criterion));
  return INTERVIEW_CRITERIA.every((c) => scoredCriteria.has(c));
}

export async function allRequiredTrainingComplete(tx: Prisma.TransactionClient, tutorProfileId: string) {
  const requiredModules = await tx.trainingModule.findMany({ where: { isRequired: true, isActive: true } });
  if (requiredModules.length === 0) return true;
  const progress = await tx.tutorTrainingProgress.findMany({
    where: { tutorProfileId, trainingModuleId: { in: requiredModules.map((m) => m.id) }, completedAt: { not: null } },
  });
  return progress.length === requiredModules.length;
}

export async function hasPassedExam(tx: Prisma.TransactionClient, tutorProfileId: string) {
  const latest = await tx.tutorExamAttempt.findFirst({
    where: { tutorProfileId },
    orderBy: { attemptNumber: "desc" },
  });
  return latest?.passed === true;
}

// --- Application-status transitions --------------------------------------

export async function submitApplication(tutorProfileId: string, actorUserId: string) {
  const updated = await db.$transaction(async (tx) => {
    const tutor = await assertStatus(tx, tutorProfileId, "DRAFT");
    if (!tutor.headline || !tutor.bio) {
      throw new TransitionGateError("Profile must have a headline and bio before submitting");
    }
    const [subjectCount, levelCount] = await Promise.all([
      tx.tutorSubject.count({ where: { tutorProfileId } }),
      tx.tutorLevel.count({ where: { tutorProfileId } }),
    ]);
    if (subjectCount === 0 || levelCount === 0) {
      throw new TransitionGateError("Profile must have at least one subject and one level before submitting");
    }
    // FG-LEGAL2 — re-checked here, not just in the calling Server Action, so a
    // forged call can't skip acceptance. The caller (updateTutorProfileAction)
    // writes tutorAgreementAcceptedAt in the same transaction just before
    // calling this, so a genuine submission always has it set by this point.
    if (!tutor.tutorAgreementAcceptedAt) {
      throw new TransitionGateError("Tutor Independent Service Provider Agreement must be accepted before submitting");
    }

    const updated = await tx.tutorProfile.update({
      where: { id: tutorProfileId },
      data: { applicationStatus: "SUBMITTED" },
    });
    await writeAuditLog(
      { actorUserId, action: "tutor.application.submitted", entityType: "TutorProfile", entityId: tutorProfileId },
      tx
    );
    await emitTutorApplicationEvent(tx, {
      tutorProfileId,
      recipientUserId: updated.userId,
      event: "APPLICATION_SUBMITTED",
      dedupeKey: `tutorProfile:${tutorProfileId}:APPLICATION_SUBMITTED`,
      applicationStatus: updated.applicationStatus,
      inAppTitle: "Application submitted",
      inAppBody: "We received your FutureTutor tutor application — it's now in our review queue.",
    });
    return updated;
  });
  await dispatchAfterCommit(tutorProfileId);
  return updated;
}

export async function startDocumentReview(tutorProfileId: string, actorUserId: string) {
  const updated = await db.$transaction(async (tx) => {
    await assertStatus(tx, tutorProfileId, "SUBMITTED");
    const updated = await tx.tutorProfile.update({
      where: { id: tutorProfileId },
      data: { applicationStatus: "UNDER_REVIEW" },
    });
    await writeAuditLog(
      { actorUserId, action: "tutor.documentReview.started", entityType: "TutorProfile", entityId: tutorProfileId },
      tx
    );
    await emitTutorApplicationEvent(tx, {
      tutorProfileId,
      recipientUserId: updated.userId,
      event: "APPLICATION_UNDER_REVIEW",
      dedupeKey: `tutorProfile:${tutorProfileId}:APPLICATION_UNDER_REVIEW`,
      applicationStatus: updated.applicationStatus,
      inAppTitle: "Application under review",
      inAppBody: "Our team has started reviewing your submitted information and documents.",
    });
    return updated;
  });
  await dispatchAfterCommit(tutorProfileId);
  return updated;
}

export async function requireInterview(tutorProfileId: string, actorUserId: string) {
  return db.$transaction(async (tx) => {
    await assertStatus(tx, tutorProfileId, "UNDER_REVIEW");
    if (!(await hasApprovedEducationDocument(tx, tutorProfileId))) {
      throw new TransitionGateError("Tutor needs at least one approved transcript/diploma/degree document");
    }
    const updated = await tx.tutorProfile.update({
      where: { id: tutorProfileId },
      data: { applicationStatus: "INTERVIEW_REQUIRED" },
    });
    await writeAuditLog(
      { actorUserId, action: "tutor.interviewStage.entered", entityType: "TutorProfile", entityId: tutorProfileId },
      tx
    );
    return updated;
  });
}

export async function completeInterview(tutorProfileId: string, actorUserId: string) {
  const updated = await db.$transaction(async (tx) => {
    await assertStatus(tx, tutorProfileId, "INTERVIEW_REQUIRED");
    if (!(await interviewIsFullyScored(tx, tutorProfileId))) {
      throw new TransitionGateError("Interview is missing one or more of the six rubric criteria");
    }
    const interview = await tx.tutorInterview.findFirstOrThrow({
      where: { tutorProfileId },
      orderBy: { scheduledAt: "desc" },
    });
    await tx.tutorInterview.update({
      where: { id: interview.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    const updated = await tx.tutorProfile.update({
      where: { id: tutorProfileId },
      data: { applicationStatus: "INTERVIEW_COMPLETED" },
    });
    await writeAuditLog(
      { actorUserId, action: "tutor.interview.completed", entityType: "TutorInterview", entityId: interview.id },
      tx
    );
    await emitTutorApplicationEvent(tx, {
      tutorProfileId,
      recipientUserId: updated.userId,
      event: "INTERVIEW_COMPLETED",
      dedupeKey: `interview:${interview.id}:COMPLETED`,
      applicationStatus: updated.applicationStatus,
      inAppTitle: "Interview completed",
      inAppBody: "Thanks for completing your interview — we're preparing your next step.",
    });
    return updated;
  });
  await dispatchAfterCommit(tutorProfileId);
  return updated;
}

export async function requireTraining(tutorProfileId: string, actorUserId: string) {
  const updated = await db.$transaction(async (tx) => {
    await assertStatus(tx, tutorProfileId, "INTERVIEW_COMPLETED");
    const updated = await tx.tutorProfile.update({
      where: { id: tutorProfileId },
      data: { applicationStatus: "TRAINING_REQUIRED" },
    });
    await writeAuditLog(
      { actorUserId, action: "tutor.trainingStage.entered", entityType: "TutorProfile", entityId: tutorProfileId },
      tx
    );
    await emitTutorApplicationEvent(tx, {
      tutorProfileId,
      recipientUserId: updated.userId,
      event: "TRAINING_UNLOCKED",
      dedupeKey: `tutorProfile:${tutorProfileId}:TRAINING_UNLOCKED`,
      applicationStatus: updated.applicationStatus,
      inAppTitle: "Training unlocked",
      inAppBody: "Your training modules are now available to complete.",
    });
    return updated;
  });
  await dispatchAfterCommit(tutorProfileId);
  return updated;
}

export async function completeTraining(tutorProfileId: string, actorUserId: string) {
  const updated = await db.$transaction(async (tx) => {
    await assertStatus(tx, tutorProfileId, "TRAINING_REQUIRED");
    if (!(await allRequiredTrainingComplete(tx, tutorProfileId))) {
      throw new TransitionGateError("Not all required training modules have been completed");
    }
    const updated = await tx.tutorProfile.update({
      where: { id: tutorProfileId },
      data: { applicationStatus: "TRAINING_COMPLETED" },
    });
    await writeAuditLog(
      { actorUserId, action: "tutor.training.completed", entityType: "TutorProfile", entityId: tutorProfileId },
      tx
    );
    await emitTutorApplicationEvent(tx, {
      tutorProfileId,
      recipientUserId: updated.userId,
      event: "TRAINING_COMPLETED",
      dedupeKey: `tutorProfile:${tutorProfileId}:TRAINING_COMPLETED`,
      applicationStatus: updated.applicationStatus,
      inAppTitle: "Training completed",
      inAppBody: "You've completed all required training modules.",
    });
    return updated;
  });
  await dispatchAfterCommit(tutorProfileId);
  return updated;
}

export async function requireExam(tutorProfileId: string, actorUserId: string) {
  const updated = await db.$transaction(async (tx) => {
    await assertStatus(tx, tutorProfileId, "TRAINING_COMPLETED");
    const updated = await tx.tutorProfile.update({
      where: { id: tutorProfileId },
      data: { applicationStatus: "EXAM_REQUIRED" },
    });
    await writeAuditLog(
      { actorUserId, action: "tutor.examStage.entered", entityType: "TutorProfile", entityId: tutorProfileId },
      tx
    );
    await emitTutorApplicationEvent(tx, {
      tutorProfileId,
      recipientUserId: updated.userId,
      event: "EXAM_UNLOCKED",
      dedupeKey: `tutorProfile:${tutorProfileId}:EXAM_UNLOCKED`,
      applicationStatus: updated.applicationStatus,
      inAppTitle: "Exam unlocked",
      inAppBody: "The platform exam is now open for you to take.",
    });
    return updated;
  });
  await dispatchAfterCommit(tutorProfileId);
  return updated;
}

export async function completeExam(tutorProfileId: string, actorUserId: string) {
  const updated = await db.$transaction(async (tx) => {
    await assertStatus(tx, tutorProfileId, "EXAM_REQUIRED");
    if (!(await hasPassedExam(tx, tutorProfileId))) {
      throw new TransitionGateError("Tutor has not passed the required exam");
    }
    const updated = await tx.tutorProfile.update({
      where: { id: tutorProfileId },
      data: { applicationStatus: "EXAM_COMPLETED" },
    });
    await writeAuditLog(
      { actorUserId, action: "tutor.exam.stageCompleted", entityType: "TutorProfile", entityId: tutorProfileId },
      tx
    );
    await emitTutorApplicationEvent(tx, {
      tutorProfileId,
      recipientUserId: updated.userId,
      event: "EXAM_PASSED",
      dedupeKey: `tutorProfile:${tutorProfileId}:EXAM_PASSED`,
      applicationStatus: updated.applicationStatus,
      inAppTitle: "Exam passed",
      inAppBody: "Congratulations — you passed the platform exam.",
    });
    return updated;
  });
  await dispatchAfterCommit(tutorProfileId);
  return updated;
}

export async function sendToFinalReview(tutorProfileId: string, actorUserId: string) {
  const updated = await db.$transaction(async (tx) => {
    await assertStatus(tx, tutorProfileId, "EXAM_COMPLETED");
    const updated = await tx.tutorProfile.update({
      where: { id: tutorProfileId },
      data: { applicationStatus: "FINAL_REVIEW" },
    });
    await writeAuditLog(
      { actorUserId, action: "tutor.sentToFinalReview", entityType: "TutorProfile", entityId: tutorProfileId },
      tx
    );
    await emitTutorApplicationEvent(tx, {
      tutorProfileId,
      recipientUserId: updated.userId,
      event: "FINAL_REVIEW_STARTED",
      dedupeKey: `tutorProfile:${tutorProfileId}:FINAL_REVIEW_STARTED`,
      applicationStatus: updated.applicationStatus,
      inAppTitle: "Final review",
      inAppBody: "Your application has moved to final review.",
    });
    return updated;
  });
  await dispatchAfterCommit(tutorProfileId);
  return updated;
}

export async function approveTutor(tutorProfileId: string, actorUserId: string) {
  const result = await db.$transaction(async (tx) => {
    await assertStatus(tx, tutorProfileId, "FINAL_REVIEW");

    // Defense in depth: re-check every prior gate from scratch, regardless
    // of how the tutor reached FINAL_REVIEW.
    const [docsOk, interviewOk, trainingOk, examOk] = await Promise.all([
      hasApprovedEducationDocument(tx, tutorProfileId),
      interviewIsFullyScored(tx, tutorProfileId),
      allRequiredTrainingComplete(tx, tutorProfileId),
      hasPassedExam(tx, tutorProfileId),
    ]);
    if (!docsOk || !interviewOk || !trainingOk || !examOk) {
      throw new TransitionGateError(
        `Cannot approve — unmet requirement(s): ${[
          !docsOk && "documents",
          !interviewOk && "interview",
          !trainingOk && "training",
          !examOk && "exam",
        ]
          .filter(Boolean)
          .join(", ")}`
      );
    }

    const updated = await tx.tutorProfile.update({
      where: { id: tutorProfileId },
      data: { applicationStatus: "APPROVED", validationVersion: 2 },
    });
    await writeAuditLog(
      { actorUserId, action: "tutor.approved", entityType: "TutorProfile", entityId: tutorProfileId },
      tx
    );
    await emitTutorApplicationEvent(tx, {
      tutorProfileId,
      recipientUserId: updated.userId,
      event: "APPLICATION_APPROVED",
      dedupeKey: `tutorProfile:${tutorProfileId}:APPLICATION_APPROVED`,
      applicationStatus: updated.applicationStatus,
      inAppTitle: "You're approved!",
      inAppBody: "Congratulations — your FutureTutor tutor application has been approved.",
    });
    return updated;
  });

  await calculateInitialTutorScore(tutorProfileId);
  await dispatchAfterCommit(tutorProfileId);
  return result;
}

export async function rejectTutor(tutorProfileId: string, actorUserId: string, reason: string) {
  const updated = await db.$transaction(async (tx) => {
    await assertStatus(tx, tutorProfileId, NON_TERMINAL_STATUSES);
    const updated = await tx.tutorProfile.update({
      where: { id: tutorProfileId },
      data: { applicationStatus: "REJECTED" },
    });
    await writeAuditLog(
      {
        actorUserId,
        action: "tutor.rejected",
        entityType: "TutorProfile",
        entityId: tutorProfileId,
        metadata: { reason },
      },
      tx
    );
    await emitTutorApplicationEvent(tx, {
      tutorProfileId,
      recipientUserId: updated.userId,
      event: "APPLICATION_REJECTED",
      dedupeKey: `tutorProfile:${tutorProfileId}:APPLICATION_REJECTED`,
      applicationStatus: updated.applicationStatus,
      detail: { reason },
      inAppTitle: "Application decision",
      inAppBody: `We're not able to move forward with your application at this time. Reason: ${reason}`,
    });
    return updated;
  });
  await dispatchAfterCommit(tutorProfileId);
  return updated;
}

export async function suspendTutor(tutorProfileId: string, actorUserId: string, reason: string) {
  const updated = await db.$transaction(async (tx) => {
    await assertStatus(tx, tutorProfileId, "APPROVED");
    const updated = await tx.tutorProfile.update({
      where: { id: tutorProfileId },
      data: { applicationStatus: "SUSPENDED" },
    });
    const auditRow = await writeAuditLogReturningRow(
      {
        actorUserId,
        action: "tutor.suspended",
        entityType: "TutorProfile",
        entityId: tutorProfileId,
        metadata: { reason },
      },
      tx
    );
    await emitTutorApplicationEvent(tx, {
      tutorProfileId,
      recipientUserId: updated.userId,
      // A tutor can be suspended and reactivated more than once — the
      // just-written AuditLog row's own fresh id is the per-occurrence
      // discriminator (a genuine second suspend cycle always gets a new
      // AuditLog row; a retried, still-uncommitted attempt never reaches
      // here at all, since the whole transaction would roll back first).
      event: "APPLICATION_SUSPENDED",
      dedupeKey: `auditLog:${auditRow.id}`,
      applicationStatus: updated.applicationStatus,
      detail: { reason },
      inAppTitle: "Account suspended",
      inAppBody: `Your tutor account has been suspended. Reason: ${reason}`,
    });
    return updated;
  });
  await dispatchAfterCommit(tutorProfileId);
  return updated;
}

export async function reactivateTutor(tutorProfileId: string, actorUserId: string, reason: string) {
  const updated = await db.$transaction(async (tx) => {
    await assertStatus(tx, tutorProfileId, "SUSPENDED");
    const updated = await tx.tutorProfile.update({
      where: { id: tutorProfileId },
      data: { applicationStatus: "APPROVED" },
    });
    const auditRow = await writeAuditLogReturningRow(
      {
        actorUserId,
        action: "tutor.reactivated",
        entityType: "TutorProfile",
        entityId: tutorProfileId,
        metadata: { reason },
      },
      tx
    );
    await emitTutorApplicationEvent(tx, {
      tutorProfileId,
      recipientUserId: updated.userId,
      // Same reasoning as suspendTutor above — cyclable, so the fresh
      // AuditLog row id is the occurrence discriminator.
      event: "APPLICATION_REACTIVATED",
      dedupeKey: `auditLog:${auditRow.id}`,
      applicationStatus: updated.applicationStatus,
      detail: { reason },
      inAppTitle: "Account reactivated",
      inAppBody: "Your tutor account has been reactivated and is active again.",
    });
    return updated;
  });
  await dispatchAfterCommit(tutorProfileId);
  return updated;
}

// --- Document-level actions (do not themselves change applicationStatus) --

export async function approveDocument(documentId: string, actorUserId: string, adminNotes?: string) {
  const updated = await db.$transaction(async (tx) => {
    const updated = await tx.tutorDocument.update({
      where: { id: documentId },
      data: { status: "APPROVED", reviewedAt: new Date(), reviewedByUserId: actorUserId, adminNotes },
    });
    await writeAuditLog(
      { actorUserId, action: "tutor.document.approved", entityType: "TutorDocument", entityId: documentId },
      tx
    );
    const tutorProfile = await tx.tutorProfile.findUniqueOrThrow({
      where: { id: updated.tutorProfileId },
      select: { userId: true, applicationStatus: true },
    });
    await emitTutorApplicationEvent(tx, {
      tutorProfileId: updated.tutorProfileId,
      recipientUserId: tutorProfile.userId,
      event: "DOCUMENT_APPROVED",
      dedupeKey: `document:${documentId}:APPROVED`,
      applicationStatus: tutorProfile.applicationStatus,
      detail: { documentType: updated.type },
      inAppTitle: "Document approved",
      inAppBody: `Your ${DOCUMENT_TYPE_IN_APP_LABELS[updated.type]} was approved.`,
    });
    return updated;
  });
  await dispatchAfterCommit(updated.tutorProfileId);
  return updated;
}

export async function rejectDocument(documentId: string, actorUserId: string, reason: string) {
  const updated = await db.$transaction(async (tx) => {
    const updated = await tx.tutorDocument.update({
      where: { id: documentId },
      data: { status: "REJECTED", reviewedAt: new Date(), reviewedByUserId: actorUserId, rejectionReason: reason },
    });
    await writeAuditLog(
      {
        actorUserId,
        action: "tutor.document.rejected",
        entityType: "TutorDocument",
        entityId: documentId,
        metadata: { reason },
      },
      tx
    );
    const tutorProfile = await tx.tutorProfile.findUniqueOrThrow({
      where: { id: updated.tutorProfileId },
      select: { userId: true, applicationStatus: true },
    });
    await emitTutorApplicationEvent(tx, {
      tutorProfileId: updated.tutorProfileId,
      recipientUserId: tutorProfile.userId,
      event: "DOCUMENT_REJECTED",
      dedupeKey: `document:${documentId}:REJECTED`,
      applicationStatus: tutorProfile.applicationStatus,
      detail: { documentType: updated.type, reason },
      inAppTitle: "Document needs attention",
      inAppBody: `Your ${DOCUMENT_TYPE_IN_APP_LABELS[updated.type]} was not accepted. Reason: ${reason}`,
    });
    return updated;
  });
  await dispatchAfterCommit(updated.tutorProfileId);
  return updated;
}

export async function requestDocumentReplacement(documentId: string, actorUserId: string, reason: string) {
  const updated = await db.$transaction(async (tx) => {
    const updated = await tx.tutorDocument.update({
      where: { id: documentId },
      data: {
        status: "REPLACEMENT_REQUIRED",
        reviewedAt: new Date(),
        reviewedByUserId: actorUserId,
        rejectionReason: reason,
      },
    });
    await writeAuditLog(
      {
        actorUserId,
        action: "tutor.document.replacementRequested",
        entityType: "TutorDocument",
        entityId: documentId,
        metadata: { reason },
      },
      tx
    );
    const tutorProfile = await tx.tutorProfile.findUniqueOrThrow({
      where: { id: updated.tutorProfileId },
      select: { userId: true, applicationStatus: true },
    });
    await emitTutorApplicationEvent(tx, {
      tutorProfileId: updated.tutorProfileId,
      recipientUserId: tutorProfile.userId,
      event: "ADDITIONAL_INFORMATION_REQUIRED",
      dedupeKey: `document:${documentId}:REPLACEMENT_REQUIRED`,
      applicationStatus: tutorProfile.applicationStatus,
      detail: { documentType: updated.type, reason },
      inAppTitle: "Updated document needed",
      inAppBody: `Please resubmit your ${DOCUMENT_TYPE_IN_APP_LABELS[updated.type]}. Reason: ${reason}`,
    });
    return updated;
  });
  await dispatchAfterCommit(updated.tutorProfileId);
  return updated;
}

// --- Qualification verification (admin links a document to what it proves) -

export async function verifyEducation(
  educationId: string,
  documentId: string,
  actorUserId: string,
  isRelevantToSubjects: boolean
) {
  return db.$transaction(async (tx) => {
    const updated = await tx.tutorEducation.update({
      where: { id: educationId },
      data: { verificationStatus: "VERIFIED", verifiedByDocumentId: documentId, isRelevantToSubjects },
    });
    await writeAuditLog(
      {
        actorUserId,
        action: "tutor.education.verified",
        entityType: "TutorEducation",
        entityId: educationId,
        metadata: { documentId, isRelevantToSubjects },
      },
      tx
    );
    return updated;
  });
}

export async function verifyCertification(
  certificationId: string,
  documentId: string,
  actorUserId: string,
  isRelevantToSubjects: boolean
) {
  return db.$transaction(async (tx) => {
    const updated = await tx.tutorCertification.update({
      where: { id: certificationId },
      data: { verificationStatus: "VERIFIED", verifiedByDocumentId: documentId, isRelevantToSubjects },
    });
    await writeAuditLog(
      {
        actorUserId,
        action: "tutor.certification.verified",
        entityType: "TutorCertification",
        entityId: certificationId,
        metadata: { documentId, isRelevantToSubjects },
      },
      tx
    );
    return updated;
  });
}

// --- Interview scheduling / rubric ----------------------------------------

export async function scheduleInterview(
  tutorProfileId: string,
  actorUserId: string,
  input: { scheduledAt: Date; interviewerUserId?: string }
) {
  const interview = await db.$transaction(async (tx) => {
    const tutor = await assertStatus(tx, tutorProfileId, "INTERVIEW_REQUIRED");
    const existing = await tx.tutorInterview.findFirst({
      where: { tutorProfileId },
      orderBy: { scheduledAt: "desc" },
    });
    const interview = existing
      ? await tx.tutorInterview.update({
          where: { id: existing.id },
          data: { scheduledAt: input.scheduledAt, interviewerUserId: input.interviewerUserId, status: "SCHEDULED" },
        })
      : await tx.tutorInterview.create({
          data: {
            tutorProfileId,
            scheduledAt: input.scheduledAt,
            interviewerUserId: input.interviewerUserId,
            status: "SCHEDULED",
          },
        });
    await writeAuditLog(
      { actorUserId, action: "tutor.interview.scheduled", entityType: "TutorInterview", entityId: interview.id },
      tx
    );

    // `existing === null` means this is genuinely the first time an
    // interview record was created for this tutor (SCHEDULED); a truthy
    // `existing` means an interview record already existed and its time
    // is being changed (RESCHEDULED) — reuses the exact branch this
    // function already computes, no separate detection logic needed.
    const scheduledAtMs = input.scheduledAt.getTime();
    await emitTutorApplicationEvent(tx, {
      tutorProfileId,
      recipientUserId: tutor.userId,
      event: existing ? "INTERVIEW_RESCHEDULED" : "INTERVIEW_SCHEDULED",
      dedupeKey: `interview:${interview.id}:scheduled:${scheduledAtMs}`,
      applicationStatus: tutor.applicationStatus,
      detail: { scheduledAtIso: input.scheduledAt.toISOString() },
      inAppTitle: existing ? "Interview rescheduled" : "Interview scheduled",
      inAppBody: existing
        ? "Your FutureTutor interview time has changed. Check your email for the new date and time."
        : "Your FutureTutor interview has been scheduled. Check your email for the date and time.",
    });
    return interview;
  });
  await dispatchAfterCommit(tutorProfileId);
  return interview;
}

export async function recordInterviewEvaluation(
  tutorInterviewId: string,
  actorUserId: string,
  criterion: TutorInterviewCriterion,
  score: number,
  notes?: string
) {
  if (score < 1 || score > 5) throw new TransitionGateError("Interview criterion score must be between 1 and 5");
  return db.$transaction(async (tx) => {
    const evaluation = await tx.tutorInterviewEvaluation.upsert({
      where: { tutorInterviewId_criterion: { tutorInterviewId, criterion } },
      create: { tutorInterviewId, criterion, score, notes },
      update: { score, notes },
    });
    await writeAuditLog(
      {
        actorUserId,
        action: "tutor.interview.evaluationRecorded",
        entityType: "TutorInterviewEvaluation",
        entityId: evaluation.id,
        metadata: { criterion, score },
      },
      tx
    );
    return evaluation;
  });
}

// --- Training acknowledgment (tutor-facing) --------------------------------

export async function acknowledgeTrainingModule(tutorProfileId: string, trainingModuleId: string) {
  return db.$transaction(async (tx) => {
    const progress = await tx.tutorTrainingProgress.upsert({
      where: { tutorProfileId_trainingModuleId: { tutorProfileId, trainingModuleId } },
      create: { tutorProfileId, trainingModuleId, startedAt: new Date(), completedAt: new Date(), progressPercent: 100 },
      update: { completedAt: new Date(), progressPercent: 100 },
    });
    await writeAuditLog(
      {
        actorUserId: null,
        action: "tutor.training.moduleCompleted",
        entityType: "TutorTrainingProgress",
        entityId: progress.id,
        metadata: { tutorProfileId, trainingModuleId },
      },
      tx
    );
    return progress;
  });
}

// --- Exam attempt recording --------------------------------------------

export async function recordExamAttempt(
  tutorProfileId: string,
  tutorExamId: string,
  score: number,
  passed: boolean,
  startedAt: Date
) {
  const attempt = await db.$transaction(async (tx) => {
    const last = await tx.tutorExamAttempt.findFirst({
      where: { tutorProfileId, tutorExamId },
      orderBy: { attemptNumber: "desc" },
    });
    const attempt = await tx.tutorExamAttempt.create({
      data: {
        tutorProfileId,
        tutorExamId,
        attemptNumber: (last?.attemptNumber ?? 0) + 1,
        score,
        passed,
        startedAt,
        submittedAt: new Date(),
      },
    });
    await writeAuditLog(
      {
        actorUserId: null,
        action: "tutor.exam.attemptRecorded",
        entityType: "TutorExamAttempt",
        entityId: attempt.id,
        metadata: { tutorExamId, score, passed, attemptNumber: attempt.attemptNumber },
      },
      tx
    );

    // Only a failed attempt is its own notification-worthy event — a
    // passing attempt is instead communicated via completeExam's
    // EXAM_PASSED event (fired by the caller immediately after this, once
    // it advances EXAM_REQUIRED -> EXAM_COMPLETED), so a single successful
    // exam never produces two separate "you passed" style emails.
    if (!passed) {
      const tutorProfile = await tx.tutorProfile.findUniqueOrThrow({
        where: { id: tutorProfileId },
        select: { userId: true, applicationStatus: true },
      });
      await emitTutorApplicationEvent(tx, {
        tutorProfileId,
        recipientUserId: tutorProfile.userId,
        event: "EXAM_FAILED",
        dedupeKey: `examAttempt:${attempt.id}:FAILED`,
        applicationStatus: tutorProfile.applicationStatus,
        detail: { score },
        inAppTitle: "Exam attempt result",
        inAppBody: "Your most recent exam attempt did not reach the passing score. You can try again.",
      });
    }
    return attempt;
  });
  if (!passed) {
    await dispatchAfterCommit(tutorProfileId);
  }
  return attempt;
}

// Small local helper — writeAuditLog (src/lib/audit.ts) doesn't return the
// created row, but suspendTutor/reactivateTutor need the fresh row's own
// id as their notification dedupeKey's occurrence discriminator (see
// their call sites above). Rather than changing writeAuditLog's signature
///return type for every existing caller, this reads the row back inside
// the same transaction immediately after writing it — negligible cost,
// zero behavior change to writeAuditLog itself.
async function writeAuditLogReturningRow(
  params: Parameters<typeof writeAuditLog>[0],
  tx: Prisma.TransactionClient
) {
  await writeAuditLog(params, tx);
  return tx.auditLog.findFirstOrThrow({
    where: { entityType: params.entityType, entityId: params.entityId ?? undefined, action: params.action },
    orderBy: { createdAt: "desc" },
  });
}
