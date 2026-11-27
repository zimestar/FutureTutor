-- CreateEnum
CREATE TYPE "AdminAlertEvent" AS ENUM ('TUTOR_APPLICATION_SUBMITTED', 'TUTOR_DOCUMENT_UPLOADED', 'TUTOR_TRAINING_COMPLETED', 'TUTOR_EXAM_PASSED', 'TUTOR_PIPELINE_DIGEST');

-- CreateEnum
CREATE TYPE "AdminAlertStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "preferredLocale" TEXT;

-- CreateTable
CREATE TABLE "AdminAlertNotification" (
    "id" TEXT NOT NULL,
    "event" "AdminAlertEvent" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "recipientKey" TEXT NOT NULL,
    "recipientUserId" TEXT,
    "tutorProfileId" TEXT,
    "status" "AdminAlertStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "providerMessageId" TEXT,
    "contextSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAlertNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminAlertNotification_status_idx" ON "AdminAlertNotification"("status");

-- CreateIndex
CREATE INDEX "AdminAlertNotification_tutorProfileId_idx" ON "AdminAlertNotification"("tutorProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminAlertNotification_dedupeKey_recipientKey_key" ON "AdminAlertNotification"("dedupeKey", "recipientKey");

-- Backfill: the language each account signed up in (recorded with Terms
-- acceptance since FG-LEGAL1A). Accounts without it stay NULL ("en" fallback).
UPDATE "User" SET "preferredLocale" = "termsAcceptedLocale"
WHERE "preferredLocale" IS NULL AND "termsAcceptedLocale" IN ('en', 'fr');
