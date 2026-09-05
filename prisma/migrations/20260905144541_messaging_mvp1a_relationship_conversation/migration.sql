-- CreateEnum
CREATE TYPE "ConversationParticipantRole" AS ENUM ('STUDENT', 'GUARDIAN', 'TUTOR');

-- DropForeignKey
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_bookingId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_senderId_fkey";

-- DropIndex
DROP INDEX "Conversation_bookingId_key";

-- DropIndex
DROP INDEX "Message_conversationId_idx";

-- AlterTable
ALTER TABLE "Conversation" DROP COLUMN "bookingId",
DROP COLUMN "updatedAt",
ADD COLUMN     "lastMessageAt" TIMESTAMP(3),
ADD COLUMN     "studentProfileId" TEXT NOT NULL,
ADD COLUMN     "tutorProfileId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ConversationParticipant" ADD COLUMN     "lastReadAt" TIMESTAMP(3),
ADD COLUMN     "leftAt" TIMESTAMP(3),
ADD COLUMN     "role" "ConversationParticipantRole" NOT NULL;

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "content",
DROP COLUMN "readAt",
DROP COLUMN "senderId",
DROP COLUMN "sentAt",
DROP COLUMN "type",
ADD COLUMN     "body" TEXT NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "senderUserId" TEXT NOT NULL;

-- DropEnum
DROP TYPE "MessageType";

-- CreateIndex
CREATE INDEX "Conversation_tutorProfileId_lastMessageAt_idx" ON "Conversation"("tutorProfileId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversation_studentProfileId_lastMessageAt_idx" ON "Conversation"("studentProfileId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_studentProfileId_tutorProfileId_key" ON "Conversation"("studentProfileId", "tutorProfileId");

-- CreateIndex
CREATE INDEX "ConversationParticipant_userId_leftAt_idx" ON "ConversationParticipant"("userId", "leftAt");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_tutorProfileId_fkey" FOREIGN KEY ("tutorProfileId") REFERENCES "TutorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

