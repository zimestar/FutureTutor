-- CreateEnum
CREATE TYPE "MessageReportReason" AS ENUM ('INAPPROPRIATE_CONTENT', 'HARASSMENT', 'OFF_PLATFORM_REQUEST', 'SAFETY_CONCERN', 'SPAM', 'OTHER');

-- CreateEnum
CREATE TYPE "MessageReportStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AdminPermission" ADD VALUE 'ADMIN_MESSAGE_REPORTS_READ';
ALTER TYPE "AdminPermission" ADD VALUE 'ADMIN_MESSAGE_REPORTS_MANAGE';

-- CreateTable
CREATE TABLE "MessageReport" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "reporterUserId" TEXT NOT NULL,
    "reason" "MessageReportReason" NOT NULL,
    "detail" TEXT,
    "status" "MessageReportStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,

    CONSTRAINT "MessageReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageReport_status_createdAt_idx" ON "MessageReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "MessageReport_conversationId_idx" ON "MessageReport"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageReport_messageId_reporterUserId_key" ON "MessageReport"("messageId", "reporterUserId");

-- AddForeignKey
ALTER TABLE "MessageReport" ADD CONSTRAINT "MessageReport_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReport" ADD CONSTRAINT "MessageReport_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReport" ADD CONSTRAINT "MessageReport_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReport" ADD CONSTRAINT "MessageReport_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

