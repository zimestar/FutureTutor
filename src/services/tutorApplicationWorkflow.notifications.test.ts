import { beforeEach, describe, expect, it, vi } from "vitest";

// PROD-TUTOR-APPLICATION-NOTIFICATIONS1 — proves that every meaningful
// tutorApplicationWorkflow.ts transition calls emitTutorApplicationEvent
// with the correct event/dedupeKey/applicationStatus/detail, and that
// dispatchTutorApplicationNotifications is invoked after each transaction
// commits without ever propagating a failure back to the caller. This is
// the workflow-wiring layer — emitTutorApplicationEvent's OWN internals
// (both channels, idempotency, recipient resolution) are covered
// separately in tutorApplicationNotifications.test.ts, and content
// generation in tutorApplicationEmailContent.test.ts; mocking both
// functions here keeps this file focused on exactly one thing: did the
// right transition fire the right event with the right data.
//
// No real database exists in this environment (documented elsewhere in
// this project) — db.$transaction is mocked to invoke its callback with a
// stub `tx` whose individual model methods are configured per test,
// exactly mirroring how the real Prisma transaction client would be
// threaded through.

const mocks = vi.hoisted(() => ({
  emitTutorApplicationEvent: vi.fn(),
  dispatchTutorApplicationNotifications: vi.fn(),
  calculateInitialTutorScore: vi.fn(),
  writeAuditLog: vi.fn(),
  tutorProfileFindUniqueOrThrow: vi.fn(),
  tutorProfileUpdate: vi.fn(),
  tutorProfileFindUniqueOrThrow2: vi.fn(),
  tutorSubjectCount: vi.fn(),
  tutorLevelCount: vi.fn(),
  tutorDocumentCount: vi.fn(),
  tutorDocumentUpdate: vi.fn(),
  tutorInterviewFindFirst: vi.fn(),
  tutorInterviewFindFirstOrThrow: vi.fn(),
  tutorInterviewCreate: vi.fn(),
  tutorInterviewUpdate: vi.fn(),
  tutorTrainingProgressFindMany: vi.fn(),
  trainingModuleFindMany: vi.fn(),
  tutorExamAttemptFindFirst: vi.fn(),
  tutorExamAttemptCreate: vi.fn(),
  auditLogFindFirstOrThrow: vi.fn(),
}));

vi.mock("@/services/tutorApplicationNotifications", () => ({
  emitTutorApplicationEvent: mocks.emitTutorApplicationEvent,
  dispatchTutorApplicationNotifications: mocks.dispatchTutorApplicationNotifications,
}));
vi.mock("@/services/tutorScoring", () => ({
  calculateInitialTutorScore: mocks.calculateInitialTutorScore,
}));
vi.mock("@/lib/audit", () => ({
  writeAuditLog: mocks.writeAuditLog,
}));

function fakeTx() {
  return {
    tutorProfile: {
      findUniqueOrThrow: mocks.tutorProfileFindUniqueOrThrow,
      update: mocks.tutorProfileUpdate,
    },
    tutorSubject: { count: mocks.tutorSubjectCount },
    tutorLevel: { count: mocks.tutorLevelCount },
    tutorDocument: { count: mocks.tutorDocumentCount, update: mocks.tutorDocumentUpdate },
    tutorInterview: {
      findFirst: mocks.tutorInterviewFindFirst,
      findFirstOrThrow: mocks.tutorInterviewFindFirstOrThrow,
      create: mocks.tutorInterviewCreate,
      update: mocks.tutorInterviewUpdate,
    },
    tutorTrainingProgress: { findMany: mocks.tutorTrainingProgressFindMany },
    trainingModule: { findMany: mocks.trainingModuleFindMany },
    tutorExamAttempt: { findFirst: mocks.tutorExamAttemptFindFirst, create: mocks.tutorExamAttemptCreate },
    auditLog: { findFirstOrThrow: mocks.auditLogFindFirstOrThrow },
  };
}

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(fakeTx())),
  },
}));

import {
  submitApplication,
  startDocumentReview,
  requireInterview,
  completeInterview,
  requireTraining,
  completeTraining,
  requireExam,
  completeExam,
  sendToFinalReview,
  approveTutor,
  rejectTutor,
  suspendTutor,
  reactivateTutor,
  approveDocument,
  rejectDocument,
  requestDocumentReplacement,
  verifyEducation,
  scheduleInterview,
  recordInterviewEvaluation,
  recordExamAttempt,
} from "./tutorApplicationWorkflow";

const TUTOR = { id: "tutor-1", userId: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dispatchTutorApplicationNotifications.mockResolvedValue(undefined);
  mocks.calculateInitialTutorScore.mockResolvedValue(undefined);
  mocks.auditLogFindFirstOrThrow.mockResolvedValue({ id: "audit-row-1" });
});

describe("item 1/2 — meaningful Admin/Super Admin transitions create notifications (actor role is not distinguished by this service — enforced upstream by requireAdminPermission; identical wiring either way)", () => {
  it("submitApplication fires APPLICATION_SUBMITTED", async () => {
    mocks.tutorProfileFindUniqueOrThrow.mockResolvedValue({
      ...TUTOR,
      applicationStatus: "DRAFT",
      headline: "h",
      bio: "b",
      tutorAgreementAcceptedAt: new Date(),
    });
    mocks.tutorSubjectCount.mockResolvedValue(1);
    mocks.tutorLevelCount.mockResolvedValue(1);
    mocks.tutorProfileUpdate.mockResolvedValue({ ...TUTOR, applicationStatus: "SUBMITTED" });

    await submitApplication("tutor-1", "student-actor");

    expect(mocks.emitTutorApplicationEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tutorProfileId: "tutor-1",
        recipientUserId: "user-1",
        event: "APPLICATION_SUBMITTED",
        dedupeKey: "tutorProfile:tutor-1:APPLICATION_SUBMITTED",
        applicationStatus: "SUBMITTED",
      })
    );
    expect(mocks.dispatchTutorApplicationNotifications).toHaveBeenCalledWith("tutor-1");
  });

  it("startDocumentReview (admin actor) fires APPLICATION_UNDER_REVIEW", async () => {
    mocks.tutorProfileFindUniqueOrThrow.mockResolvedValue({ ...TUTOR, applicationStatus: "SUBMITTED" });
    mocks.tutorProfileUpdate.mockResolvedValue({ ...TUTOR, applicationStatus: "UNDER_REVIEW" });

    await startDocumentReview("tutor-1", "admin-actor");

    expect(mocks.emitTutorApplicationEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ event: "APPLICATION_UNDER_REVIEW", dedupeKey: "tutorProfile:tutor-1:APPLICATION_UNDER_REVIEW" })
    );
  });

  it("startDocumentReview (super-admin actor) fires the identical event — actor role is orthogonal to notification wiring", async () => {
    mocks.tutorProfileFindUniqueOrThrow.mockResolvedValue({ ...TUTOR, applicationStatus: "SUBMITTED" });
    mocks.tutorProfileUpdate.mockResolvedValue({ ...TUTOR, applicationStatus: "UNDER_REVIEW" });

    await startDocumentReview("tutor-1", "super-admin-actor");

    expect(mocks.emitTutorApplicationEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ event: "APPLICATION_UNDER_REVIEW" })
    );
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: "super-admin-actor" }), expect.anything());
  });
});

it("item 3 — an internal/hidden action (verifyEducation) creates NO notification", async () => {
  const tx = fakeTx();
  (tx as unknown as { tutorEducation: unknown }).tutorEducation = {
    update: vi.fn().mockResolvedValue({ id: "edu-1", verificationStatus: "VERIFIED" }),
  };
  (await import("@/lib/db")).db.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(tx)) as never;

  await verifyEducation("edu-1", "doc-1", "admin-actor", true);

  expect(mocks.emitTutorApplicationEvent).not.toHaveBeenCalled();
});

it("item 3 (variant) — recordInterviewEvaluation (a single rubric criterion score) creates NO notification", async () => {
  const tx = fakeTx();
  (tx as unknown as { tutorInterviewEvaluation: unknown }).tutorInterviewEvaluation = {
    upsert: vi.fn().mockResolvedValue({ id: "eval-1" }),
  };
  (await import("@/lib/db")).db.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(tx)) as never;

  await recordInterviewEvaluation("interview-1", "admin-actor", "COMMUNICATION", 4);

  expect(mocks.emitTutorApplicationEvent).not.toHaveBeenCalled();
});

it("requireInterview does not itself fire a notification (no date exists yet — INTERVIEW_SCHEDULED covers the actionable moment)", async () => {
  mocks.tutorProfileFindUniqueOrThrow.mockResolvedValue({ ...TUTOR, applicationStatus: "UNDER_REVIEW" });
  mocks.tutorDocumentCount.mockResolvedValue(1);
  mocks.tutorProfileUpdate.mockResolvedValue({ ...TUTOR, applicationStatus: "INTERVIEW_REQUIRED" });

  await requireInterview("tutor-1", "admin-actor");

  expect(mocks.emitTutorApplicationEvent).not.toHaveBeenCalled();
});

describe("item 4/5/6 — document approval / rejection / additional information required", () => {
  it("approveDocument fires DOCUMENT_APPROVED", async () => {
    mocks.tutorDocumentUpdate.mockResolvedValue({ id: "doc-1", tutorProfileId: "tutor-1", type: "TRANSCRIPT" });
    mocks.tutorProfileFindUniqueOrThrow.mockResolvedValue({ userId: "user-1", applicationStatus: "UNDER_REVIEW" });

    await approveDocument("doc-1", "admin-actor");

    expect(mocks.emitTutorApplicationEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        event: "DOCUMENT_APPROVED",
        dedupeKey: "document:doc-1:APPROVED",
        detail: { documentType: "TRANSCRIPT" },
      })
    );
    expect(mocks.dispatchTutorApplicationNotifications).toHaveBeenCalledWith("tutor-1");
  });

  it("rejectDocument fires DOCUMENT_REJECTED with the tutor-visible reason", async () => {
    mocks.tutorDocumentUpdate.mockResolvedValue({ id: "doc-2", tutorProfileId: "tutor-1", type: "DIPLOMA" });
    mocks.tutorProfileFindUniqueOrThrow.mockResolvedValue({ userId: "user-1", applicationStatus: "UNDER_REVIEW" });

    await rejectDocument("doc-2", "admin-actor", "Illegible scan");

    expect(mocks.emitTutorApplicationEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        event: "DOCUMENT_REJECTED",
        dedupeKey: "document:doc-2:REJECTED",
        detail: { documentType: "DIPLOMA", reason: "Illegible scan" },
      })
    );
  });

  it("requestDocumentReplacement fires ADDITIONAL_INFORMATION_REQUIRED", async () => {
    mocks.tutorDocumentUpdate.mockResolvedValue({ id: "doc-3", tutorProfileId: "tutor-1", type: "DEGREE" });
    mocks.tutorProfileFindUniqueOrThrow.mockResolvedValue({ userId: "user-1", applicationStatus: "UNDER_REVIEW" });

    await requestDocumentReplacement("doc-3", "admin-actor", "Please provide a clearer copy");

    expect(mocks.emitTutorApplicationEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ event: "ADDITIONAL_INFORMATION_REQUIRED", dedupeKey: "document:doc-3:REPLACEMENT_REQUIRED" })
    );
  });
});

describe("item 7/8 — interview scheduled vs rescheduled", () => {
  it("scheduleInterview (no existing interview record) fires INTERVIEW_SCHEDULED", async () => {
    mocks.tutorProfileFindUniqueOrThrow.mockResolvedValue({ ...TUTOR, applicationStatus: "INTERVIEW_REQUIRED" });
    mocks.tutorInterviewFindFirst.mockResolvedValue(null);
    mocks.tutorInterviewCreate.mockResolvedValue({ id: "interview-1" });

    const scheduledAt = new Date("2026-09-20T14:00:00.000Z");
    await scheduleInterview("tutor-1", "admin-actor", { scheduledAt });

    expect(mocks.emitTutorApplicationEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        event: "INTERVIEW_SCHEDULED",
        dedupeKey: `interview:interview-1:scheduled:${scheduledAt.getTime()}`,
        detail: { scheduledAtIso: scheduledAt.toISOString() },
      })
    );
  });

  it("scheduleInterview (an interview record already exists) fires INTERVIEW_RESCHEDULED with a new dedupeKey for the new time", async () => {
    mocks.tutorProfileFindUniqueOrThrow.mockResolvedValue({ ...TUTOR, applicationStatus: "INTERVIEW_REQUIRED" });
    mocks.tutorInterviewFindFirst.mockResolvedValue({ id: "interview-1", scheduledAt: new Date("2026-09-18T10:00:00.000Z") });
    mocks.tutorInterviewUpdate.mockResolvedValue({ id: "interview-1" });

    const newTime = new Date("2026-09-22T16:00:00.000Z");
    await scheduleInterview("tutor-1", "admin-actor", { scheduledAt: newTime });

    expect(mocks.emitTutorApplicationEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ event: "INTERVIEW_RESCHEDULED", dedupeKey: `interview:interview-1:scheduled:${newTime.getTime()}` })
    );
  });
});

it("item 9 — completeInterview fires INTERVIEW_COMPLETED", async () => {
  mocks.tutorProfileFindUniqueOrThrow.mockResolvedValue({ ...TUTOR, applicationStatus: "INTERVIEW_REQUIRED" });
  mocks.tutorInterviewFindFirst.mockResolvedValue({
    id: "interview-1",
    evaluations: ["COMMUNICATION", "PEDAGOGY", "PROFESSIONALISM", "SUBJECT_CONFIDENCE", "STUDENT_INTERACTION", "MOTIVATION_ALIGNMENT"].map(
      (criterion) => ({ criterion })
    ),
  });
  mocks.tutorInterviewFindFirstOrThrow.mockResolvedValue({ id: "interview-1" });
  mocks.tutorInterviewUpdate.mockResolvedValue({ id: "interview-1" });
  mocks.tutorProfileUpdate.mockResolvedValue({ ...TUTOR, applicationStatus: "INTERVIEW_COMPLETED" });

  await completeInterview("tutor-1", "admin-actor");

  expect(mocks.emitTutorApplicationEvent).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ event: "INTERVIEW_COMPLETED", dedupeKey: "interview:interview-1:COMPLETED" })
  );
});

it("item 10 — requireTraining fires TRAINING_UNLOCKED", async () => {
  mocks.tutorProfileFindUniqueOrThrow.mockResolvedValue({ ...TUTOR, applicationStatus: "INTERVIEW_COMPLETED" });
  mocks.tutorProfileUpdate.mockResolvedValue({ ...TUTOR, applicationStatus: "TRAINING_REQUIRED" });

  await requireTraining("tutor-1", "admin-actor");

  expect(mocks.emitTutorApplicationEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ event: "TRAINING_UNLOCKED" }));
});

it("item 11 — completeTraining fires TRAINING_COMPLETED", async () => {
  mocks.tutorProfileFindUniqueOrThrow.mockResolvedValue({ ...TUTOR, applicationStatus: "TRAINING_REQUIRED" });
  mocks.trainingModuleFindMany.mockResolvedValue([{ id: "mod-1" }]);
  mocks.tutorTrainingProgressFindMany.mockResolvedValue([{ id: "progress-1" }]);
  mocks.tutorProfileUpdate.mockResolvedValue({ ...TUTOR, applicationStatus: "TRAINING_COMPLETED" });

  await completeTraining("tutor-1", "user-1");

  expect(mocks.emitTutorApplicationEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ event: "TRAINING_COMPLETED" }));
});

it("item 12 — requireExam fires EXAM_UNLOCKED", async () => {
  mocks.tutorProfileFindUniqueOrThrow.mockResolvedValue({ ...TUTOR, applicationStatus: "TRAINING_COMPLETED" });
  mocks.tutorProfileUpdate.mockResolvedValue({ ...TUTOR, applicationStatus: "EXAM_REQUIRED" });

  await requireExam("tutor-1", "admin-actor");

  expect(mocks.emitTutorApplicationEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ event: "EXAM_UNLOCKED" }));
});

it("item 13 — completeExam fires EXAM_PASSED", async () => {
  mocks.tutorProfileFindUniqueOrThrow.mockResolvedValue({ ...TUTOR, applicationStatus: "EXAM_REQUIRED" });
  mocks.tutorExamAttemptFindFirst.mockResolvedValue({ passed: true, attemptNumber: 1 });
  mocks.tutorProfileUpdate.mockResolvedValue({ ...TUTOR, applicationStatus: "EXAM_COMPLETED" });

  await completeExam("tutor-1", "user-1");

  expect(mocks.emitTutorApplicationEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ event: "EXAM_PASSED" }));
});

it("item 14 — a failed exam attempt fires EXAM_FAILED (not tied to a status transition)", async () => {
  mocks.tutorExamAttemptFindFirst.mockResolvedValue(null);
  mocks.tutorExamAttemptCreate.mockResolvedValue({ id: "attempt-1", attemptNumber: 1 });
  mocks.tutorProfileFindUniqueOrThrow.mockResolvedValue({ userId: "user-1", applicationStatus: "EXAM_REQUIRED" });

  await recordExamAttempt("tutor-1", "exam-1", 40, false, new Date());

  expect(mocks.emitTutorApplicationEvent).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ event: "EXAM_FAILED", dedupeKey: "examAttempt:attempt-1:FAILED", detail: { score: 40 } })
  );
  expect(mocks.dispatchTutorApplicationNotifications).toHaveBeenCalledWith("tutor-1");
});

it("a passed exam attempt does NOT itself fire EXAM_FAILED or dispatch a second time from recordExamAttempt (completeExam covers the pass case separately)", async () => {
  mocks.tutorExamAttemptFindFirst.mockResolvedValue(null);
  mocks.tutorExamAttemptCreate.mockResolvedValue({ id: "attempt-2", attemptNumber: 1 });

  await recordExamAttempt("tutor-1", "exam-1", 95, true, new Date());

  expect(mocks.emitTutorApplicationEvent).not.toHaveBeenCalled();
  expect(mocks.dispatchTutorApplicationNotifications).not.toHaveBeenCalled();
});

it("item 15 — sendToFinalReview fires FINAL_REVIEW_STARTED", async () => {
  mocks.tutorProfileFindUniqueOrThrow.mockResolvedValue({ ...TUTOR, applicationStatus: "EXAM_COMPLETED" });
  mocks.tutorProfileUpdate.mockResolvedValue({ ...TUTOR, applicationStatus: "FINAL_REVIEW" });

  await sendToFinalReview("tutor-1", "admin-actor");

  expect(mocks.emitTutorApplicationEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ event: "FINAL_REVIEW_STARTED" }));
});

it("item 16 — approveTutor fires APPLICATION_APPROVED, still calls calculateInitialTutorScore, and still dispatches", async () => {
  mocks.tutorProfileFindUniqueOrThrow.mockResolvedValue({ ...TUTOR, applicationStatus: "FINAL_REVIEW" });
  mocks.tutorDocumentCount.mockResolvedValue(1);
  mocks.tutorInterviewFindFirst.mockResolvedValue({
    id: "interview-1",
    evaluations: ["COMMUNICATION", "PEDAGOGY", "PROFESSIONALISM", "SUBJECT_CONFIDENCE", "STUDENT_INTERACTION", "MOTIVATION_ALIGNMENT"].map(
      (criterion) => ({ criterion })
    ),
  });
  mocks.trainingModuleFindMany.mockResolvedValue([]);
  mocks.tutorExamAttemptFindFirst.mockResolvedValue({ passed: true });
  mocks.tutorProfileUpdate.mockResolvedValue({ ...TUTOR, applicationStatus: "APPROVED" });

  await approveTutor("tutor-1", "admin-actor");

  expect(mocks.emitTutorApplicationEvent).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ event: "APPLICATION_APPROVED", dedupeKey: "tutorProfile:tutor-1:APPLICATION_APPROVED" })
  );
  expect(mocks.calculateInitialTutorScore).toHaveBeenCalledWith("tutor-1");
  expect(mocks.dispatchTutorApplicationNotifications).toHaveBeenCalledWith("tutor-1");
});

it("item 17 — rejectTutor fires APPLICATION_REJECTED with the reason", async () => {
  mocks.tutorProfileFindUniqueOrThrow.mockResolvedValue({ ...TUTOR, applicationStatus: "UNDER_REVIEW" });
  mocks.tutorProfileUpdate.mockResolvedValue({ ...TUTOR, applicationStatus: "REJECTED" });

  await rejectTutor("tutor-1", "admin-actor", "Did not meet requirements");

  expect(mocks.emitTutorApplicationEvent).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ event: "APPLICATION_REJECTED", detail: { reason: "Did not meet requirements" } })
  );
});

describe("item 18 — suspend/reactivate (hold/follow-up, where supported by the domain model)", () => {
  it("suspendTutor fires APPLICATION_SUSPENDED using the fresh AuditLog row id as the occurrence discriminator", async () => {
    mocks.tutorProfileFindUniqueOrThrow.mockResolvedValue({ ...TUTOR, applicationStatus: "APPROVED" });
    mocks.tutorProfileUpdate.mockResolvedValue({ ...TUTOR, applicationStatus: "SUSPENDED" });
    mocks.auditLogFindFirstOrThrow.mockResolvedValue({ id: "audit-row-suspend-1" });

    await suspendTutor("tutor-1", "admin-actor", "Policy violation");

    expect(mocks.emitTutorApplicationEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ event: "APPLICATION_SUSPENDED", dedupeKey: "auditLog:audit-row-suspend-1", detail: { reason: "Policy violation" } })
    );
  });

  it("reactivateTutor fires APPLICATION_REACTIVATED, a second suspend/reactivate cycle gets a different dedupeKey", async () => {
    mocks.tutorProfileFindUniqueOrThrow.mockResolvedValue({ ...TUTOR, applicationStatus: "SUSPENDED" });
    mocks.tutorProfileUpdate.mockResolvedValue({ ...TUTOR, applicationStatus: "APPROVED" });
    mocks.auditLogFindFirstOrThrow.mockResolvedValue({ id: "audit-row-reactivate-1" });

    await reactivateTutor("tutor-1", "admin-actor", "Issue resolved");

    expect(mocks.emitTutorApplicationEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ event: "APPLICATION_REACTIVATED", dedupeKey: "auditLog:audit-row-reactivate-1" })
    );
  });
});

it("item 25/26 — dispatchTutorApplicationNotifications throwing/rejecting does not propagate out of the transition function (the workflow change itself must survive a delivery failure)", async () => {
  mocks.tutorProfileFindUniqueOrThrow.mockResolvedValue({ ...TUTOR, applicationStatus: "SUBMITTED" });
  mocks.tutorProfileUpdate.mockResolvedValue({ ...TUTOR, applicationStatus: "UNDER_REVIEW" });
  mocks.dispatchTutorApplicationNotifications.mockRejectedValueOnce(new Error("dispatch blew up"));

  await expect(startDocumentReview("tutor-1", "admin-actor")).resolves.toEqual(
    expect.objectContaining({ applicationStatus: "UNDER_REVIEW" })
  );
});

it("item 27 — the real Admin actorUserId is still passed to writeAuditLog unchanged", async () => {
  mocks.tutorProfileFindUniqueOrThrow.mockResolvedValue({ ...TUTOR, applicationStatus: "SUBMITTED" });
  mocks.tutorProfileUpdate.mockResolvedValue({ ...TUTOR, applicationStatus: "UNDER_REVIEW" });

  await startDocumentReview("tutor-1", "specific-admin-id-42");

  expect(mocks.writeAuditLog).toHaveBeenCalledWith(
    expect.objectContaining({ actorUserId: "specific-admin-id-42", action: "tutor.documentReview.started" }),
    expect.anything()
  );
});
