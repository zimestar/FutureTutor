import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { calculateInitialTutorScore } from "@/services/tutorScoring";
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
  return db.$transaction(async (tx) => {
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

    const updated = await tx.tutorProfile.update({
      where: { id: tutorProfileId },
      data: { applicationStatus: "SUBMITTED" },
    });
    await writeAuditLog(
      { actorUserId, action: "tutor.application.submitted", entityType: "TutorProfile", entityId: tutorProfileId },
      tx
    );
    return updated;
  });
}

export async function startDocumentReview(tutorProfileId: string, actorUserId: string) {
  return db.$transaction(async (tx) => {
    await assertStatus(tx, tutorProfileId, "SUBMITTED");
    const updated = await tx.tutorProfile.update({
      where: { id: tutorProfileId },
      data: { applicationStatus: "UNDER_REVIEW" },
    });
    await writeAuditLog(
      { actorUserId, action: "tutor.documentReview.started", entityType: "TutorProfile", entityId: tutorProfileId },
      tx
    );
    return updated;
  });
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
  return db.$transaction(async (tx) => {
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
    return updated;
  });
}

export async function requireTraining(tutorProfileId: string, actorUserId: string) {
  return db.$transaction(async (tx) => {
    await assertStatus(tx, tutorProfileId, "INTERVIEW_COMPLETED");
    const updated = await tx.tutorProfile.update({
      where: { id: tutorProfileId },
      data: { applicationStatus: "TRAINING_REQUIRED" },
    });
    await writeAuditLog(
      { actorUserId, action: "tutor.trainingStage.entered", entityType: "TutorProfile", entityId: tutorProfileId },
      tx
    );
    return updated;
  });
}

export async function completeTraining(tutorProfileId: string, actorUserId: string) {
  return db.$transaction(async (tx) => {
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
    return updated;
  });
}

export async function requireExam(tutorProfileId: string, actorUserId: string) {
  return db.$transaction(async (tx) => {
    await assertStatus(tx, tutorProfileId, "TRAINING_COMPLETED");
    const updated = await tx.tutorProfile.update({
      where: { id: tutorProfileId },
      data: { applicationStatus: "EXAM_REQUIRED" },
    });
    await writeAuditLog(
      { actorUserId, action: "tutor.examStage.entered", entityType: "TutorProfile", entityId: tutorProfileId },
      tx
    );
    return updated;
  });
}

export async function completeExam(tutorProfileId: string, actorUserId: string) {
  return db.$transaction(async (tx) => {
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
    return updated;
  });
}

export async function sendToFinalReview(tutorProfileId: string, actorUserId: string) {
  return db.$transaction(async (tx) => {
    await assertStatus(tx, tutorProfileId, "EXAM_COMPLETED");
    const updated = await tx.tutorProfile.update({
      where: { id: tutorProfileId },
      data: { applicationStatus: "FINAL_REVIEW" },
    });
    await writeAuditLog(
      { actorUserId, action: "tutor.sentToFinalReview", entityType: "TutorProfile", entityId: tutorProfileId },
      tx
    );
    return updated;
  });
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
    return updated;
  });

  await calculateInitialTutorScore(tutorProfileId);
  return result;
}

export async function rejectTutor(tutorProfileId: string, actorUserId: string, reason: string) {
  return db.$transaction(async (tx) => {
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
    return updated;
  });
}

export async function suspendTutor(tutorProfileId: string, actorUserId: string, reason: string) {
  return db.$transaction(async (tx) => {
    await assertStatus(tx, tutorProfileId, "APPROVED");
    const updated = await tx.tutorProfile.update({
      where: { id: tutorProfileId },
      data: { applicationStatus: "SUSPENDED" },
    });
    await writeAuditLog(
      {
        actorUserId,
        action: "tutor.suspended",
        entityType: "TutorProfile",
        entityId: tutorProfileId,
        metadata: { reason },
      },
      tx
    );
    return updated;
  });
}

export async function reactivateTutor(tutorProfileId: string, actorUserId: string, reason: string) {
  return db.$transaction(async (tx) => {
    await assertStatus(tx, tutorProfileId, "SUSPENDED");
    const updated = await tx.tutorProfile.update({
      where: { id: tutorProfileId },
      data: { applicationStatus: "APPROVED" },
    });
    await writeAuditLog(
      {
        actorUserId,
        action: "tutor.reactivated",
        entityType: "TutorProfile",
        entityId: tutorProfileId,
        metadata: { reason },
      },
      tx
    );
    return updated;
  });
}

// --- Document-level actions (do not themselves change applicationStatus) --

export async function approveDocument(documentId: string, actorUserId: string, adminNotes?: string) {
  return db.$transaction(async (tx) => {
    const updated = await tx.tutorDocument.update({
      where: { id: documentId },
      data: { status: "APPROVED", reviewedAt: new Date(), reviewedByUserId: actorUserId, adminNotes },
    });
    await writeAuditLog(
      { actorUserId, action: "tutor.document.approved", entityType: "TutorDocument", entityId: documentId },
      tx
    );
    return updated;
  });
}

export async function rejectDocument(documentId: string, actorUserId: string, reason: string) {
  return db.$transaction(async (tx) => {
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
    return updated;
  });
}

export async function requestDocumentReplacement(documentId: string, actorUserId: string, reason: string) {
  return db.$transaction(async (tx) => {
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
    return updated;
  });
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
  return db.$transaction(async (tx) => {
    await assertStatus(tx, tutorProfileId, "INTERVIEW_REQUIRED");
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
    return interview;
  });
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
  return db.$transaction(async (tx) => {
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
    return attempt;
  });
}
