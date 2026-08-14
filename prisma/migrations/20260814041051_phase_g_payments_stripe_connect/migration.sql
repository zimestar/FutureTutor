
-- CreateEnum
CREATE TYPE "PaymentDisputeStatus" AS ENUM ('OPEN', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "TutorEarningStatus" AS ENUM ('PENDING_ELIGIBLE', 'ELIGIBLE', 'TRANSFERRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TutorTransferStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "StripeWebhookProcessingStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED');

-- AlterEnum
BEGIN;
CREATE TYPE "PaymentStatus_new" AS ENUM ('PENDING', 'REQUIRES_ACTION', 'AUTHORIZED', 'CAPTURED', 'CAPTURE_FAILED', 'FAILED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED');
ALTER TABLE "public"."Payment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Payment" ALTER COLUMN "status" TYPE "PaymentStatus_new" USING ("status"::text::"PaymentStatus_new");
ALTER TYPE "PaymentStatus" RENAME TO "PaymentStatus_old";
ALTER TYPE "PaymentStatus_new" RENAME TO "PaymentStatus";
DROP TYPE "public"."PaymentStatus_old";
ALTER TABLE "Payment" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TutoringRequestStatus" ADD VALUE 'PAYMENT_PENDING';
ALTER TYPE "TutoringRequestStatus" ADD VALUE 'PAYMENT_FAILED';

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_bookingId_fkey";

-- DropForeignKey
ALTER TABLE "TutorPayout" DROP CONSTRAINT "TutorPayout_tutorProfileId_fkey";

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "platformFeeCents",
DROP COLUMN "tutorPayoutCents",
ADD COLUMN     "authorizedAt" TIMESTAMP(3),
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "capturedAt" TIMESTAMP(3),
ADD COLUMN     "customerPriceQuoteId" TEXT NOT NULL,
ADD COLUMN     "disputeStatus" "PaymentDisputeStatus",
ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "payerUserId" TEXT NOT NULL,
ADD COLUMN     "refundedAmountCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stripeBalanceTransactionId" TEXT,
ADD COLUMN     "stripeChargeId" TEXT,
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeFeeCents" INTEGER,
ALTER COLUMN "bookingId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "actorUserId" TEXT,
ADD COLUMN     "bookingId" TEXT NOT NULL,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'CAD',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "RefundStatus" NOT NULL DEFAULT 'PENDING';

-- DropTable
DROP TABLE "TutorPayout";

-- DropEnum
DROP TYPE "PayoutStatus";

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "stripePaymentIntentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorEarning" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "tutorProfileId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "status" "TutorEarningStatus" NOT NULL DEFAULT 'PENDING_ELIGIBLE',
    "eligibleAt" TIMESTAMP(3) NOT NULL,
    "transferredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TutorEarning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorTransfer" (
    "id" TEXT NOT NULL,
    "tutorEarningId" TEXT NOT NULL,
    "tutorProfileId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "status" "TutorTransferStatus" NOT NULL DEFAULT 'PENDING',
    "reversedAmountCents" INTEGER NOT NULL DEFAULT 0,
    "stripeTransferId" TEXT,
    "initiatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TutorTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorTransferReversal" (
    "id" TEXT NOT NULL,
    "tutorTransferId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "stripeReversalId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TutorTransferReversal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processingStatus" "StripeWebhookProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_paymentId_attemptNumber_key" ON "PaymentAttempt"("paymentId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TutorEarning_bookingId_key" ON "TutorEarning"("bookingId");

-- CreateIndex
CREATE INDEX "TutorEarning_tutorProfileId_status_idx" ON "TutorEarning"("tutorProfileId", "status");

-- CreateIndex
CREATE INDEX "TutorEarning_status_eligibleAt_idx" ON "TutorEarning"("status", "eligibleAt");

-- CreateIndex
CREATE UNIQUE INDEX "TutorTransfer_tutorEarningId_key" ON "TutorTransfer"("tutorEarningId");

-- CreateIndex
CREATE UNIQUE INDEX "TutorTransfer_stripeTransferId_key" ON "TutorTransfer"("stripeTransferId");

-- CreateIndex
CREATE INDEX "TutorTransfer_tutorProfileId_status_idx" ON "TutorTransfer"("tutorProfileId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TutorTransferReversal_stripeReversalId_key" ON "TutorTransferReversal"("stripeReversalId");

-- CreateIndex
CREATE UNIQUE INDEX "StripeWebhookEvent_stripeEventId_key" ON "StripeWebhookEvent"("stripeEventId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_customerPriceQuoteId_key" ON "Payment"("customerPriceQuoteId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_stripeRefundId_key" ON "Refund"("stripeRefundId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerPriceQuoteId_fkey" FOREIGN KEY ("customerPriceQuoteId") REFERENCES "CustomerPriceQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_payerUserId_fkey" FOREIGN KEY ("payerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorEarning" ADD CONSTRAINT "TutorEarning_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorEarning" ADD CONSTRAINT "TutorEarning_tutorProfileId_fkey" FOREIGN KEY ("tutorProfileId") REFERENCES "TutorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorTransfer" ADD CONSTRAINT "TutorTransfer_tutorEarningId_fkey" FOREIGN KEY ("tutorEarningId") REFERENCES "TutorEarning"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorTransfer" ADD CONSTRAINT "TutorTransfer_tutorProfileId_fkey" FOREIGN KEY ("tutorProfileId") REFERENCES "TutorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorTransferReversal" ADD CONSTRAINT "TutorTransferReversal_tutorTransferId_fkey" FOREIGN KEY ("tutorTransferId") REFERENCES "TutorTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

