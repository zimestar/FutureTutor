-- CreateEnum
CREATE TYPE "TutorTier" AS ENUM ('NEW', 'VERIFIED', 'SENIOR', 'ELITE');

-- CreateEnum
CREATE TYPE "CustomerQuoteStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CONSUMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TutorPayoutQuoteStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'ACCEPTED', 'CONSUMED', 'DECLINED', 'SUPERSEDED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "customerAdjustmentCents" INTEGER,
ADD COLUMN     "customerBasePriceCents" INTEGER,
ADD COLUMN     "customerPriceQuoteId" TEXT,
ADD COLUMN     "customerPricingVersion" TEXT,
ADD COLUMN     "customerSubtotalCents" INTEGER,
ADD COLUMN     "grossSpreadCents" INTEGER,
ADD COLUMN     "taxCents" INTEGER,
ADD COLUMN     "tutorPayoutAdjustmentCents" INTEGER,
ADD COLUMN     "tutorPayoutBaseCents" INTEGER,
ADD COLUMN     "tutorPayoutCents" INTEGER,
ADD COLUMN     "tutorPayoutQuoteId" TEXT,
ADD COLUMN     "tutorPayoutVersion" TEXT,
ALTER COLUMN "hourlyRateCentsSnapshot" DROP NOT NULL;

-- AlterTable
ALTER TABLE "TutorProfile" ADD COLUMN     "payoutTier" "TutorTier" NOT NULL DEFAULT 'NEW';

-- CreateTable
CREATE TABLE "CustomerBasePriceRule" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT,
    "academicLevelId" TEXT,
    "baseDurationMinutes" INTEGER NOT NULL,
    "basePriceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveUntil" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "pricingVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerBasePriceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorBasePayoutRule" (
    "id" TEXT NOT NULL,
    "tutorTier" "TutorTier" NOT NULL,
    "subjectId" TEXT,
    "academicLevelId" TEXT,
    "baseDurationMinutes" INTEGER NOT NULL,
    "payoutCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveUntil" TIMESTAMP(3),
    "payoutVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TutorBasePayoutRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplacePricingSettings" (
    "id" TEXT NOT NULL,
    "quoteTtlMinutes" INTEGER NOT NULL DEFAULT 15,
    "urgencyShortNoticeThresholdHours" INTEGER NOT NULL DEFAULT 48,
    "urgencyShortNoticeAmountCents" INTEGER NOT NULL DEFAULT 300,
    "urgencyUrgentThresholdHours" INTEGER NOT NULL DEFAULT 24,
    "urgencyUrgentAmountCents" INTEGER NOT NULL DEFAULT 600,
    "lowSupplyThresholdCount" INTEGER NOT NULL DEFAULT 2,
    "lowSupplyAmountCents" INTEGER NOT NULL DEFAULT 400,
    "tutorUrgencyBonusCents" INTEGER NOT NULL DEFAULT 400,
    "minimumGrossSpreadCents" INTEGER NOT NULL DEFAULT 0,
    "configVersion" TEXT NOT NULL DEFAULT 'MARKETPLACE_SETTINGS_V1',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "MarketplacePricingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPriceQuote" (
    "id" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "academicLevelId" TEXT,
    "tutoringMode" "TutoringMode" NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "requestedStartAt" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "basePriceCents" INTEGER NOT NULL,
    "basePriceRuleId" TEXT NOT NULL,
    "basePriceRuleVersion" TEXT NOT NULL,
    "adjustmentsTotalCents" INTEGER NOT NULL,
    "subtotalCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL,
    "taxConfigured" BOOLEAN NOT NULL DEFAULT false,
    "totalCents" INTEGER NOT NULL,
    "pricingVersion" TEXT NOT NULL,
    "marketplaceConfigVersion" TEXT NOT NULL,
    "contextHash" TEXT NOT NULL,
    "breakdown" JSONB NOT NULL,
    "contextSnapshot" JSONB NOT NULL,
    "status" "CustomerQuoteStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "CustomerPriceQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorPayoutQuote" (
    "id" TEXT NOT NULL,
    "tutorProfileId" TEXT NOT NULL,
    "customerPriceQuoteId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "academicLevelId" TEXT,
    "tutoringMode" "TutoringMode" NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "requestedStartAt" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "basePayoutCents" INTEGER NOT NULL,
    "basePayoutRuleId" TEXT NOT NULL,
    "basePayoutRuleVersion" TEXT NOT NULL,
    "tutorTierAtCalculation" "TutorTier" NOT NULL,
    "adjustmentsTotalCents" INTEGER NOT NULL,
    "totalPayoutCents" INTEGER NOT NULL,
    "payoutVersion" TEXT NOT NULL,
    "marketplaceConfigVersion" TEXT NOT NULL,
    "breakdown" JSONB NOT NULL,
    "status" "TutorPayoutQuoteStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "TutorPayoutQuote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerBasePriceRule_subjectId_academicLevelId_isActive_idx" ON "CustomerBasePriceRule"("subjectId", "academicLevelId", "isActive");

-- CreateIndex
CREATE INDEX "TutorBasePayoutRule_tutorTier_subjectId_academicLevelId_isA_idx" ON "TutorBasePayoutRule"("tutorTier", "subjectId", "academicLevelId", "isActive");

-- CreateIndex
CREATE INDEX "CustomerPriceQuote_createdByUserId_status_idx" ON "CustomerPriceQuote"("createdByUserId", "status");

-- CreateIndex
CREATE INDEX "CustomerPriceQuote_studentProfileId_status_idx" ON "CustomerPriceQuote"("studentProfileId", "status");

-- CreateIndex
CREATE INDEX "CustomerPriceQuote_expiresAt_idx" ON "CustomerPriceQuote"("expiresAt");

-- CreateIndex
CREATE INDEX "TutorPayoutQuote_tutorProfileId_status_idx" ON "TutorPayoutQuote"("tutorProfileId", "status");

-- CreateIndex
CREATE INDEX "TutorPayoutQuote_customerPriceQuoteId_idx" ON "TutorPayoutQuote"("customerPriceQuoteId");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerPriceQuoteId_fkey" FOREIGN KEY ("customerPriceQuoteId") REFERENCES "CustomerPriceQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tutorPayoutQuoteId_fkey" FOREIGN KEY ("tutorPayoutQuoteId") REFERENCES "TutorPayoutQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerBasePriceRule" ADD CONSTRAINT "CustomerBasePriceRule_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerBasePriceRule" ADD CONSTRAINT "CustomerBasePriceRule_academicLevelId_fkey" FOREIGN KEY ("academicLevelId") REFERENCES "AcademicLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorBasePayoutRule" ADD CONSTRAINT "TutorBasePayoutRule_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorBasePayoutRule" ADD CONSTRAINT "TutorBasePayoutRule_academicLevelId_fkey" FOREIGN KEY ("academicLevelId") REFERENCES "AcademicLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPriceQuote" ADD CONSTRAINT "CustomerPriceQuote_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPriceQuote" ADD CONSTRAINT "CustomerPriceQuote_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPriceQuote" ADD CONSTRAINT "CustomerPriceQuote_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPriceQuote" ADD CONSTRAINT "CustomerPriceQuote_academicLevelId_fkey" FOREIGN KEY ("academicLevelId") REFERENCES "AcademicLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPriceQuote" ADD CONSTRAINT "CustomerPriceQuote_basePriceRuleId_fkey" FOREIGN KEY ("basePriceRuleId") REFERENCES "CustomerBasePriceRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorPayoutQuote" ADD CONSTRAINT "TutorPayoutQuote_tutorProfileId_fkey" FOREIGN KEY ("tutorProfileId") REFERENCES "TutorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorPayoutQuote" ADD CONSTRAINT "TutorPayoutQuote_customerPriceQuoteId_fkey" FOREIGN KEY ("customerPriceQuoteId") REFERENCES "CustomerPriceQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorPayoutQuote" ADD CONSTRAINT "TutorPayoutQuote_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorPayoutQuote" ADD CONSTRAINT "TutorPayoutQuote_academicLevelId_fkey" FOREIGN KEY ("academicLevelId") REFERENCES "AcademicLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorPayoutQuote" ADD CONSTRAINT "TutorPayoutQuote_basePayoutRuleId_fkey" FOREIGN KEY ("basePayoutRuleId") REFERENCES "TutorBasePayoutRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
