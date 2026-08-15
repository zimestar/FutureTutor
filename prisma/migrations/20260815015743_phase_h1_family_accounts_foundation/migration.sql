-- Phase H.1 — Family Accounts & Student Foundation: schema/domain foundation
-- only. Hand-edited from the `prisma migrate diff` output — see the two
-- deviations called out inline below. No Payment/Booking/TutorEarning/
-- TutorTransfer/Stripe-related table is touched by this migration.

-- CreateEnum
CREATE TYPE "StudentManagementMode" AS ENUM ('SELF_MANAGED', 'GUARDIAN_MANAGED', 'LEGACY_UNKNOWN');

-- CreateEnum
CREATE TYPE "GuardianRelationshipStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "FamilyInvitationType" AS ENUM ('STUDENT_LOGIN', 'GUARDIAN_LINK');

-- CreateEnum
CREATE TYPE "FamilyInvitationStatus" AS ENUM ('PENDING', 'CLAIMED_PENDING_APPROVAL', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- DropForeignKey
ALTER TABLE "ParentStudentRelationship" DROP CONSTRAINT "ParentStudentRelationship_parentProfileId_fkey";

-- DropForeignKey
ALTER TABLE "ParentStudentRelationship" DROP CONSTRAINT "ParentStudentRelationship_studentProfileId_fkey";

-- DropForeignKey
ALTER TABLE "StudentProfile" DROP CONSTRAINT "StudentProfile_userId_fkey";

-- AlterTable
ALTER TABLE "ParentStudentRelationship" ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "revokedByUserId" TEXT,
ADD COLUMN     "status" "GuardianRelationshipStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
-- DEVIATION FROM RAW DIFF (1 of 2): the raw `prisma migrate diff` output
-- added "managementMode" as a single `ADD COLUMN ... NOT NULL` with no
-- default, which fails against a populated table (21 existing StudentProfile
-- rows, confirmed read-only before writing this migration). Split into the
-- safe add-nullable / backfill / enforce-NOT-NULL sequence below instead.
ALTER TABLE "StudentProfile" ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "managementMode" "StudentManagementMode",
ALTER COLUMN "userId" DROP NOT NULL;

-- Backfill: every StudentProfile that exists before Phase H.1 was created
-- via the adult self-signup path (confirmed read-only: 21/21 existing rows
-- already have a non-null userId, and zero ParentProfile/
-- ParentStudentRelationship rows exist anywhere) — SELF_MANAGED is the
-- correct, non-destructive, non-ambiguous backfill value. LEGACY_UNKNOWN is
-- never written by this migration.
UPDATE "StudentProfile" SET "managementMode" = 'SELF_MANAGED' WHERE "managementMode" IS NULL;

-- Now that every row has a value, enforce NOT NULL. No schema-level DEFAULT
-- is set going forward — every future StudentProfile creation path must
-- explicitly choose SELF_MANAGED or GUARDIAN_MANAGED (an H.3/H.4
-- application-code responsibility, not a DB default to fall back on).
ALTER TABLE "StudentProfile" ALTER COLUMN "managementMode" SET NOT NULL;

-- CreateTable
CREATE TABLE "FamilyInvitation" (
    "id" TEXT NOT NULL,
    "type" "FamilyInvitationType" NOT NULL,
    "targetStudentProfileId" TEXT NOT NULL,
    "invitedEmailNormalized" TEXT NOT NULL,
    "invitedByUserId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "status" "FamilyInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "claimedByUserId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "studentProfileId" TEXT,
    "guardianRelationshipId" TEXT,
    "consentType" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "sourceContext" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FamilyInvitation_tokenHash_key" ON "FamilyInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "FamilyInvitation_targetStudentProfileId_type_status_idx" ON "FamilyInvitation"("targetStudentProfileId", "type", "status");

-- CreateIndex
CREATE INDEX "ConsentRecord_studentProfileId_idx" ON "ConsentRecord"("studentProfileId");

-- CreateIndex
CREATE INDEX "ConsentRecord_actorUserId_idx" ON "ConsentRecord"("actorUserId");

-- CreateIndex
CREATE INDEX "ParentStudentRelationship_studentProfileId_status_idx" ON "ParentStudentRelationship"("studentProfileId", "status");

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentStudentRelationship" ADD CONSTRAINT "ParentStudentRelationship_parentProfileId_fkey" FOREIGN KEY ("parentProfileId") REFERENCES "ParentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentStudentRelationship" ADD CONSTRAINT "ParentStudentRelationship_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentStudentRelationship" ADD CONSTRAINT "ParentStudentRelationship_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentStudentRelationship" ADD CONSTRAINT "ParentStudentRelationship_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyInvitation" ADD CONSTRAINT "FamilyInvitation_targetStudentProfileId_fkey" FOREIGN KEY ("targetStudentProfileId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyInvitation" ADD CONSTRAINT "FamilyInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyInvitation" ADD CONSTRAINT "FamilyInvitation_claimedByUserId_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyInvitation" ADD CONSTRAINT "FamilyInvitation_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_guardianRelationshipId_fkey" FOREIGN KEY ("guardianRelationshipId") REFERENCES "ParentStudentRelationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DEVIATION FROM RAW DIFF (2 of 2): the following two CHECK constraints are
-- absent from `prisma migrate diff`'s output entirely, since Prisma's schema
-- DSL has no native multi-field @@check attribute as of this project's
-- Prisma version. Hand-added here, following this project's own established
-- convention for constraints the DSL cannot express (see Phase D's
-- hand-edited data-backfill migration for precedent). Added last, after the
-- managementMode backfill above, so every existing row already satisfies
-- them at the moment each constraint is created.

-- Phase H.1 domain invariant: a StudentProfile can never be SELF_MANAGED
-- with no controlling User — "the student manages themself" requires an
-- actual student to do so.
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_selfManagedRequiresUser_check" CHECK ("managementMode" <> 'SELF_MANAGED' OR "userId" IS NOT NULL);

-- Phase H.1 Consent Foundation invariant: a consent record attributed to a
-- specific guardian relationship must also be attributed to a
-- StudentProfile. (The deeper cross-table check — that the relationship's
-- own studentProfileId actually matches this row's studentProfileId — is an
-- application-layer invariant; Postgres CHECK constraints cannot reference
-- another table's row.)
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_guardianRequiresStudent_check" CHECK ("guardianRelationshipId" IS NULL OR "studentProfileId" IS NOT NULL);
