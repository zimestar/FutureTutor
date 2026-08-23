-- CreateEnum
CREATE TYPE "VideoProvider" AS ENUM ('DAILY');

-- AlterTable
ALTER TABLE "Session_tutoring" ADD COLUMN     "providerRoomId" TEXT,
ADD COLUMN     "roomCreatedAt" TIMESTAMP(3),
ADD COLUMN     "videoProvider" "VideoProvider";

-- CreateIndex
CREATE UNIQUE INDEX "Session_tutoring_providerRoomId_key" ON "Session_tutoring"("providerRoomId");
