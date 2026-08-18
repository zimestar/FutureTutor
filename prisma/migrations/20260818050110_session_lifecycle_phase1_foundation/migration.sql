-- AlterEnum
ALTER TYPE "SessionStatus" ADD VALUE 'INTERRUPTED';

-- AlterTable
ALTER TABLE "Session_tutoring" ADD COLUMN     "completedAt" TIMESTAMP(3);
