-- CreateEnum
CREATE TYPE "BookingEmailRecipientRole" AS ENUM ('TUTOR', 'PAYER');

-- CreateEnum
CREATE TYPE "BookingEmailDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "BookingEmailNotification" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "recipientRole" "BookingEmailRecipientRole" NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "status" "BookingEmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingEmailNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingEmailNotification_status_idx" ON "BookingEmailNotification"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BookingEmailNotification_bookingId_recipientRole_key" ON "BookingEmailNotification"("bookingId", "recipientRole");

-- AddForeignKey
ALTER TABLE "BookingEmailNotification" ADD CONSTRAINT "BookingEmailNotification_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
