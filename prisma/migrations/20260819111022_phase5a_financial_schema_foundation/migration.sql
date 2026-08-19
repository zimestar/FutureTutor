-- AlterEnum
ALTER TYPE "TutorEarningStatus" ADD VALUE 'HELD';

-- AlterTable
ALTER TABLE "Session_tutoring" ADD COLUMN     "noShowConvergedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TutorEarning" ALTER COLUMN "eligibleAt" DROP NOT NULL;
