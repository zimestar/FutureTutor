-- CreateEnum
CREATE TYPE "TutorApplicationNotificationEvent" AS ENUM ('APPLICATION_SUBMITTED', 'APPLICATION_UNDER_REVIEW', 'DOCUMENT_APPROVED', 'DOCUMENT_REJECTED', 'ADDITIONAL_INFORMATION_REQUIRED', 'INTERVIEW_SCHEDULED', 'INTERVIEW_RESCHEDULED', 'INTERVIEW_COMPLETED', 'TRAINING_UNLOCKED', 'TRAINING_COMPLETED', 'EXAM_UNLOCKED', 'EXAM_PASSED', 'EXAM_FAILED', 'FINAL_REVIEW_STARTED', 'APPLICATION_APPROVED', 'APPLICATION_REJECTED', 'APPLICATION_SUSPENDED', 'APPLICATION_REACTIVATED');

-- CreateEnum
CREATE TYPE "TutorApplicationNotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "TutorApplicationNotification" (
    "id" TEXT NOT NULL,
    "tutorProfileId" TEXT NOT NULL,
    "event" "TutorApplicationNotificationEvent" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "status" "TutorApplicationNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "providerMessageId" TEXT,
    "contextSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TutorApplicationNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TutorApplicationNotification_dedupeKey_key" ON "TutorApplicationNotification"("dedupeKey");

-- CreateIndex
CREATE INDEX "TutorApplicationNotification_status_idx" ON "TutorApplicationNotification"("status");

-- CreateIndex
CREATE INDEX "TutorApplicationNotification_tutorProfileId_createdAt_idx" ON "TutorApplicationNotification"("tutorProfileId", "createdAt");

-- AddForeignKey
ALTER TABLE "TutorApplicationNotification" ADD CONSTRAINT "TutorApplicationNotification_tutorProfileId_fkey" FOREIGN KEY ("tutorProfileId") REFERENCES "TutorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
