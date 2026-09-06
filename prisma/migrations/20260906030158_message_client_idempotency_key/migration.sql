-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "clientMessageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Message_conversationId_senderUserId_clientMessageId_key" ON "Message"("conversationId", "senderUserId", "clientMessageId");

