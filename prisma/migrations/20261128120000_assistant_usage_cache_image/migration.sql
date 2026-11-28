-- ASSISTANT-2 — record prompt-cache writes and whether a photo was sent (the photo itself is never stored).

-- AlterTable
ALTER TABLE "AssistantUsage" ADD COLUMN     "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "hasImage" BOOLEAN NOT NULL DEFAULT false;
