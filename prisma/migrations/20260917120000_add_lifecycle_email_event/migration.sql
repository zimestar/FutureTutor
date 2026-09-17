-- CreateEnum
CREATE TYPE "LifecycleEmailEventType" AS ENUM ('SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'COMPLAINED');

-- CreateTable
CREATE TABLE "LifecycleEmailEvent" (
    "id" TEXT NOT NULL,
    "lifecycleReminderId" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "type" "LifecycleEmailEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LifecycleEmailEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LifecycleEmailEvent_providerEventId_key" ON "LifecycleEmailEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "LifecycleEmailEvent_lifecycleReminderId_type_occurredAt_idx" ON "LifecycleEmailEvent"("lifecycleReminderId", "type", "occurredAt");

-- CreateIndex
CREATE INDEX "LifecycleReminder_providerMessageId_idx" ON "LifecycleReminder"("providerMessageId");

-- AddForeignKey
ALTER TABLE "LifecycleEmailEvent" ADD CONSTRAINT "LifecycleEmailEvent_lifecycleReminderId_fkey" FOREIGN KEY ("lifecycleReminderId") REFERENCES "LifecycleReminder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
