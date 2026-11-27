-- CreateEnum
CREATE TYPE "SafetyConcernCategory" AS ENUM ('CHILD_SAFETY', 'INAPPROPRIATE_BEHAVIOUR', 'HARASSMENT_OR_THREAT', 'OFF_PLATFORM_CONTACT', 'PRIVACY_OR_SECURITY', 'OTHER');

-- CreateEnum
CREATE TYPE "SafetyConcernStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED');

-- AlterEnum
ALTER TYPE "AdminAlertEvent" ADD VALUE 'SAFETY_CONCERN_REPORTED';

-- AlterEnum
ALTER TYPE "AdminPermission" ADD VALUE 'ADMIN_SAFETY_REPORTS';

-- CreateTable
CREATE TABLE "SafetyConcernReport" (
    "id" TEXT NOT NULL,
    "reporterUserId" TEXT NOT NULL,
    "reporterRole" TEXT NOT NULL,
    "category" "SafetyConcernCategory" NOT NULL,
    "immediateDanger" BOOLEAN NOT NULL DEFAULT false,
    "concerning" TEXT,
    "description" TEXT NOT NULL,
    "status" "SafetyConcernStatus" NOT NULL DEFAULT 'OPEN',
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafetyConcernReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SafetyConcernReport_status_createdAt_idx" ON "SafetyConcernReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SafetyConcernReport_reporterUserId_idx" ON "SafetyConcernReport"("reporterUserId");

-- AddForeignKey
ALTER TABLE "SafetyConcernReport" ADD CONSTRAINT "SafetyConcernReport_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyConcernReport" ADD CONSTRAINT "SafetyConcernReport_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
