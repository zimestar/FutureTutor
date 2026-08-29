-- AlterTable
ALTER TABLE "TutorProfile" ADD COLUMN     "tutorAgreementAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "tutorAgreementAcceptedLocale" TEXT,
ADD COLUMN     "tutorAgreementAcceptedVersion" TEXT;
