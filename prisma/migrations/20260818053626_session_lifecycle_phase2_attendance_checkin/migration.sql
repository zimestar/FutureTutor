-- CreateEnum
CREATE TYPE "SessionParticipantRole" AS ENUM ('TUTOR', 'STUDENT');

-- CreateEnum
CREATE TYPE "SessionAttendanceEventType" AS ENUM ('CHECK_IN', 'CHECK_OUT');

-- CreateEnum
CREATE TYPE "SessionAttendanceSource" AS ENUM ('IN_PERSON_MANUAL', 'ONLINE_ACTIVITY');

-- CreateTable
CREATE TABLE "SessionAttendanceEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "participantRole" "SessionParticipantRole" NOT NULL,
    "recordedByUserId" TEXT,
    "eventType" "SessionAttendanceEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "source" "SessionAttendanceSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionAttendanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionAttendanceEvent_sessionId_participantRole_eventType__idx" ON "SessionAttendanceEvent"("sessionId", "participantRole", "eventType", "occurredAt");

-- AddForeignKey
ALTER TABLE "SessionAttendanceEvent" ADD CONSTRAINT "SessionAttendanceEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session_tutoring"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionAttendanceEvent" ADD CONSTRAINT "SessionAttendanceEvent_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
