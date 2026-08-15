-- AlterTable
ALTER TABLE "PaymentAttempt" ADD COLUMN     "sourceStripeEventId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_sourceStripeEventId_key" ON "PaymentAttempt"("sourceStripeEventId");
