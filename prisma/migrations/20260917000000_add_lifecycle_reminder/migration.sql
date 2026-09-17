-- CreateEnum
CREATE TYPE "LifecycleReminderRole" AS ENUM ('TUTOR', 'PARENT', 'STUDENT');

-- CreateEnum
CREATE TYPE "LifecycleReminderRelationship" AS ENUM ('SELF', 'GUARDIAN');

-- CreateEnum
CREATE TYPE "LifecycleReminderStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED_RETRYABLE', 'FAILED_FINAL', 'OBSOLETE', 'SUPPRESSED');

-- CreateTable
CREATE TABLE "LifecycleReminder" (
    "id" TEXT NOT NULL,
    "role" "LifecycleReminderRole" NOT NULL,
    "journey" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "episodeKey" TEXT NOT NULL,
    "reminderNumber" INTEGER NOT NULL,
    "recipientUserId" TEXT,
    "relationship" "LifecycleReminderRelationship" NOT NULL,
    "locale" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" "LifecycleReminderStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "error" TEXT,
    "obsoleteAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LifecycleReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LifecycleReminder_dedupeKey_key" ON "LifecycleReminder"("dedupeKey");

-- CreateIndex
CREATE INDEX "LifecycleReminder_status_scheduledFor_idx" ON "LifecycleReminder"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "LifecycleReminder_subjectId_journey_createdAt_idx" ON "LifecycleReminder"("subjectId", "journey", "createdAt");

-- CreateIndex
CREATE INDEX "LifecycleReminder_episodeKey_idx" ON "LifecycleReminder"("episodeKey");

-- AddForeignKey
ALTER TABLE "LifecycleReminder" ADD CONSTRAINT "LifecycleReminder_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
