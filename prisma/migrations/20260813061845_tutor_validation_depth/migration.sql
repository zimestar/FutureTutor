-- CreateEnum
CREATE TYPE "QualificationVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "TutorDocumentType" AS ENUM ('TRANSCRIPT', 'DIPLOMA', 'DEGREE', 'CERTIFICATE', 'ENROLLMENT_PROOF', 'OTHER');

-- CreateEnum
CREATE TYPE "TutorDocumentStatus" AS ENUM ('UPLOADED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'REPLACEMENT_REQUIRED');

-- CreateEnum
CREATE TYPE "TutorInterviewStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "TutorInterviewCriterion" AS ENUM ('COMMUNICATION', 'PEDAGOGY', 'PROFESSIONALISM', 'SUBJECT_CONFIDENCE', 'STUDENT_INTERACTION', 'MOTIVATION_ALIGNMENT');

-- CreateEnum
CREATE TYPE "TutorExamType" AS ENUM ('PLATFORM', 'SUBJECT');

-- CreateEnum
CREATE TYPE "TutorScoreConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TutorApplicationStatus" ADD VALUE 'INTERVIEW_REQUIRED';
ALTER TYPE "TutorApplicationStatus" ADD VALUE 'INTERVIEW_COMPLETED';
ALTER TYPE "TutorApplicationStatus" ADD VALUE 'TRAINING_REQUIRED';
ALTER TYPE "TutorApplicationStatus" ADD VALUE 'TRAINING_COMPLETED';
ALTER TYPE "TutorApplicationStatus" ADD VALUE 'EXAM_REQUIRED';
ALTER TYPE "TutorApplicationStatus" ADD VALUE 'EXAM_COMPLETED';
ALTER TYPE "TutorApplicationStatus" ADD VALUE 'FINAL_REVIEW';

-- AlterTable
ALTER TABLE "TutorCertification" ADD COLUMN     "isRelevantToSubjects" BOOLEAN,
ADD COLUMN     "verificationStatus" "QualificationVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN     "verifiedByDocumentId" TEXT;

-- AlterTable
ALTER TABLE "TutorEducation" ADD COLUMN     "isRelevantToSubjects" BOOLEAN,
ADD COLUMN     "verificationStatus" "QualificationVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN     "verifiedByDocumentId" TEXT;

-- AlterTable
ALTER TABLE "TutorProfile" ADD COLUMN     "validationVersion" INTEGER;

-- DataMigration: tag tutors already approved under the old simplified
-- process as legacy-validated (version 1), without changing their
-- applicationStatus or bookability. New approvals go through
-- src/services/tutorApplicationWorkflow.ts and are stamped version 2.
UPDATE "TutorProfile" SET "validationVersion" = 1 WHERE "applicationStatus" = 'APPROVED';

-- CreateTable
CREATE TABLE "TutorDocument" (
    "id" TEXT NOT NULL,
    "tutorProfileId" TEXT NOT NULL,
    "type" "TutorDocumentType" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "status" "TutorDocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "rejectionReason" TEXT,
    "adminNotes" TEXT,

    CONSTRAINT "TutorDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorInterview" (
    "id" TEXT NOT NULL,
    "tutorProfileId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "interviewerUserId" TEXT,
    "status" "TutorInterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "overallNotes" TEXT,

    CONSTRAINT "TutorInterview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorInterviewEvaluation" (
    "id" TEXT NOT NULL,
    "tutorInterviewId" TEXT NOT NULL,
    "criterion" "TutorInterviewCriterion" NOT NULL,
    "score" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "TutorInterviewEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingModule" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "videoUrl" TEXT,
    "videoAssetKey" TEXT,
    "durationMinutes" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorTrainingProgress" (
    "id" TEXT NOT NULL,
    "tutorProfileId" TEXT NOT NULL,
    "trainingModuleId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "progressPercent" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TutorTrainingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorExam" (
    "id" TEXT NOT NULL,
    "type" "TutorExamType" NOT NULL,
    "subjectId" TEXT,
    "title" TEXT NOT NULL,
    "passingScore" INTEGER NOT NULL,

    CONSTRAINT "TutorExam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorExamAttempt" (
    "id" TEXT NOT NULL,
    "tutorProfileId" TEXT NOT NULL,
    "tutorExamId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "TutorExamAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorScore" (
    "id" TEXT NOT NULL,
    "tutorProfileId" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL DEFAULT 'OVERALL',
    "scopeKey" TEXT NOT NULL DEFAULT 'OVERALL',
    "score" INTEGER NOT NULL,
    "confidence" "TutorScoreConfidence" NOT NULL,
    "scoreVersion" TEXT NOT NULL,
    "breakdown" JSONB NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TutorScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorScoreSnapshot" (
    "id" TEXT NOT NULL,
    "tutorProfileId" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL DEFAULT 'OVERALL',
    "scopeKey" TEXT NOT NULL DEFAULT 'OVERALL',
    "score" INTEGER NOT NULL,
    "confidence" "TutorScoreConfidence" NOT NULL,
    "scoreVersion" TEXT NOT NULL,
    "breakdown" JSONB NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TutorScoreSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TutorDocument_storageKey_key" ON "TutorDocument"("storageKey");

-- CreateIndex
CREATE INDEX "TutorDocument_tutorProfileId_status_idx" ON "TutorDocument"("tutorProfileId", "status");

-- CreateIndex
CREATE INDEX "TutorInterview_tutorProfileId_status_idx" ON "TutorInterview"("tutorProfileId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TutorInterviewEvaluation_tutorInterviewId_criterion_key" ON "TutorInterviewEvaluation"("tutorInterviewId", "criterion");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingModule_slug_key" ON "TrainingModule"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "TutorTrainingProgress_tutorProfileId_trainingModuleId_key" ON "TutorTrainingProgress"("tutorProfileId", "trainingModuleId");

-- CreateIndex
CREATE UNIQUE INDEX "TutorExamAttempt_tutorProfileId_tutorExamId_attemptNumber_key" ON "TutorExamAttempt"("tutorProfileId", "tutorExamId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TutorScore_tutorProfileId_scopeType_scopeKey_key" ON "TutorScore"("tutorProfileId", "scopeType", "scopeKey");

-- CreateIndex
CREATE INDEX "TutorScoreSnapshot_tutorProfileId_createdAt_idx" ON "TutorScoreSnapshot"("tutorProfileId", "createdAt");

-- AddForeignKey
ALTER TABLE "TutorEducation" ADD CONSTRAINT "TutorEducation_verifiedByDocumentId_fkey" FOREIGN KEY ("verifiedByDocumentId") REFERENCES "TutorDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorCertification" ADD CONSTRAINT "TutorCertification_verifiedByDocumentId_fkey" FOREIGN KEY ("verifiedByDocumentId") REFERENCES "TutorDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorDocument" ADD CONSTRAINT "TutorDocument_tutorProfileId_fkey" FOREIGN KEY ("tutorProfileId") REFERENCES "TutorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorInterview" ADD CONSTRAINT "TutorInterview_tutorProfileId_fkey" FOREIGN KEY ("tutorProfileId") REFERENCES "TutorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorInterviewEvaluation" ADD CONSTRAINT "TutorInterviewEvaluation_tutorInterviewId_fkey" FOREIGN KEY ("tutorInterviewId") REFERENCES "TutorInterview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorTrainingProgress" ADD CONSTRAINT "TutorTrainingProgress_tutorProfileId_fkey" FOREIGN KEY ("tutorProfileId") REFERENCES "TutorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorTrainingProgress" ADD CONSTRAINT "TutorTrainingProgress_trainingModuleId_fkey" FOREIGN KEY ("trainingModuleId") REFERENCES "TrainingModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorExam" ADD CONSTRAINT "TutorExam_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorExamAttempt" ADD CONSTRAINT "TutorExamAttempt_tutorProfileId_fkey" FOREIGN KEY ("tutorProfileId") REFERENCES "TutorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorExamAttempt" ADD CONSTRAINT "TutorExamAttempt_tutorExamId_fkey" FOREIGN KEY ("tutorExamId") REFERENCES "TutorExam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorScore" ADD CONSTRAINT "TutorScore_tutorProfileId_fkey" FOREIGN KEY ("tutorProfileId") REFERENCES "TutorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorScoreSnapshot" ADD CONSTRAINT "TutorScoreSnapshot_tutorProfileId_fkey" FOREIGN KEY ("tutorProfileId") REFERENCES "TutorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
