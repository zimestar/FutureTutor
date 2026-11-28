-- IKA-BILLING — Ika credits: usage source, paid packs (never expire) and the Ika+ monthly plan.

-- CreateEnum
CREATE TYPE "AssistantQuotaSource" AS ENUM ('FREE', 'PLAN', 'CREDIT');

-- AlterTable
ALTER TABLE "AssistantUsage" ADD COLUMN     "source" "AssistantQuotaSource" NOT NULL DEFAULT 'FREE';

-- CreateTable
CREATE TABLE "AssistantCreditPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questions" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "stripeCheckoutSessionId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantCreditPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssistantCreditPurchase_stripeCheckoutSessionId_key" ON "AssistantCreditPurchase"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX "AssistantCreditPurchase_userId_idx" ON "AssistantCreditPurchase"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantSubscription_userId_key" ON "AssistantSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantSubscription_stripeSubscriptionId_key" ON "AssistantSubscription"("stripeSubscriptionId");

-- AddForeignKey
ALTER TABLE "AssistantCreditPurchase" ADD CONSTRAINT "AssistantCreditPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantSubscription" ADD CONSTRAINT "AssistantSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

