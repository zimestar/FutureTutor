-- TIER-PREMIUM — per-tier supplement paid by the parent on direct bookings (VERIFIED 0, SENIOR 6 $, ELITE 10 $ per hour by default).

-- AlterTable
ALTER TABLE "MarketplacePricingSettings" ADD COLUMN     "tierPremiumEliteCents" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "tierPremiumSeniorCents" INTEGER NOT NULL DEFAULT 600,
ADD COLUMN     "tierPremiumVerifiedCents" INTEGER NOT NULL DEFAULT 0;

