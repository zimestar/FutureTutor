-- CreateEnum
CREATE TYPE "SessionNotificationEvent" AS ENUM ('SESSION_REMINDER_24H', 'SESSION_REMINDER_2H', 'SESSION_CANCELLED', 'SESSION_NO_SHOW_TUTOR', 'SESSION_NO_SHOW_LEARNER', 'SESSION_NO_SHOW_UNRESOLVED');

-- CreateEnum
CREATE TYPE "SessionNotificationRecipientRole" AS ENUM ('TUTOR', 'PAYER');

-- CreateEnum
CREATE TYPE "SessionNotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "SessionNotification" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "event" "SessionNotificationEvent" NOT NULL,
    "recipientRole" "SessionNotificationRecipientRole" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "status" "SessionNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "providerMessageId" TEXT,
    "contextSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SessionNotification_dedupeKey_key" ON "SessionNotification"("dedupeKey");

-- CreateIndex
CREATE INDEX "SessionNotification_status_idx" ON "SessionNotification"("status");

-- CreateIndex
CREATE INDEX "SessionNotification_bookingId_createdAt_idx" ON "SessionNotification"("bookingId", "createdAt");

-- AddForeignKey
ALTER TABLE "SessionNotification" ADD CONSTRAINT "SessionNotification_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
