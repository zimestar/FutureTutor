-- CreateEnum
CREATE TYPE "TutoringRequestStatus" AS ENUM ('DRAFT', 'PRICED', 'CONFIRMED', 'MATCHING', 'BOOKED', 'CANCELLED', 'EXPIRED', 'NO_TUTOR_FOUND', 'FAILED');

-- CreateEnum
CREATE TYPE "TutorInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'SUPERSEDED');

-- AlterEnum
ALTER TYPE "CustomerQuoteStatus" ADD VALUE 'LOCKED';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "bookingAddressLine1" TEXT,
ADD COLUMN     "bookingAddressLine2" TEXT,
ADD COLUMN     "bookingCity" TEXT,
ADD COLUMN     "bookingPostalCode" TEXT,
ADD COLUMN     "bookingProvince" TEXT,
ADD COLUMN     "tutoringRequestId" TEXT;

-- AlterTable
ALTER TABLE "CustomerPriceQuote" ADD COLUMN     "lockedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TutoringRequest" (
    "id" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "academicLevelId" TEXT,
    "tutoringMode" "TutoringMode" NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "requestedStartAt" TIMESTAMP(3) NOT NULL,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "province" TEXT,
    "postalCode" TEXT,
    "notes" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "customerPriceQuoteId" TEXT,
    "basePriceCents" INTEGER,
    "adjustmentsTotalCents" INTEGER,
    "taxCents" INTEGER,
    "totalCents" INTEGER,
    "pricingVersion" TEXT,
    "status" "TutoringRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "dispatchRound" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "bookedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "TutoringRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorInvitation" (
    "id" TEXT NOT NULL,
    "tutoringRequestId" TEXT NOT NULL,
    "tutorProfileId" TEXT NOT NULL,
    "tutorPayoutQuoteId" TEXT,
    "dispatchRound" INTEGER NOT NULL,
    "isParallelRound" BOOLEAN NOT NULL DEFAULT false,
    "status" "TutorInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "rankScore" DOUBLE PRECISION NOT NULL,
    "rankBreakdown" JSONB NOT NULL,
    "rankingVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "bookingId" TEXT,

    CONSTRAINT "TutorInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorRankingSettings" (
    "id" TEXT NOT NULL,
    "responseWindowMinutes" INTEGER NOT NULL DEFAULT 10,
    "sequentialInvitationCount" INTEGER NOT NULL DEFAULT 2,
    "parallelBatchSize" INTEGER NOT NULL DEFAULT 3,
    "maxDispatchAttempts" INTEGER NOT NULL DEFAULT 5,
    "tutorScoreWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.50,
    "bookingReliabilityWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
    "invitationResponsivenessWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "tutorTierWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    "minInvitationsForReliabilityData" INTEGER NOT NULL DEFAULT 5,
    "rankingVersion" TEXT NOT NULL DEFAULT 'QUICK_MATCH_RANKING_V1',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "TutorRankingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TutoringRequest_createdByUserId_status_idx" ON "TutoringRequest"("createdByUserId", "status");

-- CreateIndex
CREATE INDEX "TutoringRequest_studentProfileId_status_idx" ON "TutoringRequest"("studentProfileId", "status");

-- CreateIndex
CREATE INDEX "TutoringRequest_status_idx" ON "TutoringRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TutorInvitation_bookingId_key" ON "TutorInvitation"("bookingId");

-- CreateIndex
CREATE INDEX "TutorInvitation_tutoringRequestId_status_idx" ON "TutorInvitation"("tutoringRequestId", "status");

-- CreateIndex
CREATE INDEX "TutorInvitation_tutorProfileId_status_idx" ON "TutorInvitation"("tutorProfileId", "status");

-- CreateIndex
CREATE INDEX "TutorInvitation_expiresAt_idx" ON "TutorInvitation"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TutorInvitation_tutoringRequestId_tutorProfileId_dispatchRo_key" ON "TutorInvitation"("tutoringRequestId", "tutorProfileId", "dispatchRound");

-- CreateIndex
CREATE INDEX "Booking_tutoringRequestId_idx" ON "Booking"("tutoringRequestId");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tutoringRequestId_fkey" FOREIGN KEY ("tutoringRequestId") REFERENCES "TutoringRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutoringRequest" ADD CONSTRAINT "TutoringRequest_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutoringRequest" ADD CONSTRAINT "TutoringRequest_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutoringRequest" ADD CONSTRAINT "TutoringRequest_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutoringRequest" ADD CONSTRAINT "TutoringRequest_academicLevelId_fkey" FOREIGN KEY ("academicLevelId") REFERENCES "AcademicLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutoringRequest" ADD CONSTRAINT "TutoringRequest_customerPriceQuoteId_fkey" FOREIGN KEY ("customerPriceQuoteId") REFERENCES "CustomerPriceQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorInvitation" ADD CONSTRAINT "TutorInvitation_tutoringRequestId_fkey" FOREIGN KEY ("tutoringRequestId") REFERENCES "TutoringRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorInvitation" ADD CONSTRAINT "TutorInvitation_tutorProfileId_fkey" FOREIGN KEY ("tutorProfileId") REFERENCES "TutorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorInvitation" ADD CONSTRAINT "TutorInvitation_tutorPayoutQuoteId_fkey" FOREIGN KEY ("tutorPayoutQuoteId") REFERENCES "TutorPayoutQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorInvitation" ADD CONSTRAINT "TutorInvitation_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
