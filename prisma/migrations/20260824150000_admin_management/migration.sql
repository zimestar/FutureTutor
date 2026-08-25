CREATE TYPE "AdminRolePreset" AS ENUM ('FULL_ACCESS', 'OPERATIONS', 'TUTOR_SUCCESS', 'FINANCE_READ_ONLY', 'CUSTOM');
CREATE TYPE "AdminPermission" AS ENUM ('ADMIN_DASHBOARD_VIEW', 'ADMIN_USERS_READ', 'ADMIN_USERS_WRITE', 'ADMIN_TUTORS_READ', 'ADMIN_TUTORS_REVIEW', 'ADMIN_TUTORS_APPROVE', 'ADMIN_TUTORS_SUSPEND', 'ADMIN_STUDENTS_READ', 'ADMIN_GUARDIANS_READ', 'ADMIN_BOOKINGS_READ', 'ADMIN_SESSIONS_READ', 'ADMIN_QUICKMATCH_READ', 'ADMIN_QUICKMATCH_MANAGE', 'ADMIN_PAYMENTS_READ', 'ADMIN_PRICING_READ', 'ADMIN_PRICING_MANAGE', 'ADMIN_ADMINS_VIEW', 'ADMIN_ADMINS_MANAGE');

CREATE TABLE "AdminInvitation" (
  "id" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "invitedById" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "rolePreset" "AdminRolePreset" NOT NULL,
  "permissions" "AdminPermission"[] NOT NULL,
  "acceptedUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminInvitation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AdminPermissionAssignment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "permission" "AdminPermission" NOT NULL,
  "grantedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminPermissionAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdminInvitation_tokenHash_key" ON "AdminInvitation"("tokenHash");
CREATE UNIQUE INDEX "AdminInvitation_acceptedUserId_key" ON "AdminInvitation"("acceptedUserId");
CREATE INDEX "AdminInvitation_email_idx" ON "AdminInvitation"("email");
CREATE INDEX "AdminInvitation_expiresAt_idx" ON "AdminInvitation"("expiresAt");
CREATE UNIQUE INDEX "AdminPermissionAssignment_userId_permission_key" ON "AdminPermissionAssignment"("userId", "permission");
CREATE INDEX "AdminPermissionAssignment_permission_idx" ON "AdminPermissionAssignment"("permission");
ALTER TABLE "AdminInvitation" ADD CONSTRAINT "AdminInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdminInvitation" ADD CONSTRAINT "AdminInvitation_acceptedUserId_fkey" FOREIGN KEY ("acceptedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminPermissionAssignment" ADD CONSTRAINT "AdminPermissionAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminPermissionAssignment" ADD CONSTRAINT "AdminPermissionAssignment_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
