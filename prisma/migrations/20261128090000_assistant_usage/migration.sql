-- ASSISTANT-1 — per-question usage rows for the parent AI assistant (no message content stored).

-- CreateEnum
CREATE TYPE "AssistantUsageStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUSED');

-- CreateTable
CREATE TABLE "AssistantUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AssistantUsageStatus" NOT NULL DEFAULT 'PENDING',
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AssistantUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantUsage_userId_createdAt_idx" ON "AssistantUsage"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AssistantUsage" ADD CONSTRAINT "AssistantUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
