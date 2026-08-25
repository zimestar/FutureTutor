import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { AdminPermission, AdminRolePreset, PrismaClient } from "@/generated/prisma/client";
import { permissionsForPreset } from "@/services/adminPermissions";

export const ADMIN_INVITATION_TTL_MS = 72 * 60 * 60 * 1000;
export const hashAdminInvitationToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const isAdminInvitationExpired = (expiresAt: Date, now = new Date()) => expiresAt.getTime() <= now.getTime();

export async function createAdminInvitation(client: PrismaClient, input: { firstName: string; lastName: string; email: string; invitedById: string; rolePreset: AdminRolePreset; permissions?: AdminPermission[]; now?: Date }) {
  const rawToken = randomBytes(32).toString("base64url"); const now = input.now ?? new Date();
  const permissions = permissionsForPreset(input.rolePreset, input.permissions);
  const invitation = await client.$transaction(async (tx) => {
    await tx.adminInvitation.updateMany({ where: { email: input.email.toLowerCase(), acceptedAt: null, revokedAt: null }, data: { revokedAt: now } });
    const row = await tx.adminInvitation.create({ data: { firstName: input.firstName.trim(), lastName: input.lastName.trim(), email: input.email.trim().toLowerCase(), invitedById: input.invitedById, tokenHash: hashAdminInvitationToken(rawToken), expiresAt: new Date(now.getTime() + ADMIN_INVITATION_TTL_MS), rolePreset: input.rolePreset, permissions: [...permissions] } });
    await tx.auditLog.create({ data: { actorUserId: input.invitedById, action: "admin.invitation_created", entityType: "AdminInvitation", entityId: row.id, metadata: { targetEmail: row.email, rolePreset: row.rolePreset } } });
    return row;
  });
  return { invitation, rawToken };
}

export async function resendAdminInvitation(client: PrismaClient, invitationId: string, actorUserId: string, now = new Date()) {
  const rawToken = randomBytes(32).toString("base64url");
  const invitation = await client.$transaction(async (tx) => {
    const previous = await tx.adminInvitation.findUnique({ where: { id: invitationId } });
    if (!previous || previous.acceptedAt) throw new Error("INVITATION_NOT_RESENDABLE");
    await tx.adminInvitation.update({ where: { id: previous.id }, data: { revokedAt: now } });
    const replacement = await tx.adminInvitation.create({ data: { firstName: previous.firstName, lastName: previous.lastName, email: previous.email, invitedById: actorUserId, tokenHash: hashAdminInvitationToken(rawToken), expiresAt: new Date(now.getTime() + ADMIN_INVITATION_TTL_MS), rolePreset: previous.rolePreset, permissions: previous.permissions } });
    await tx.auditLog.create({ data: { actorUserId, action: "admin.invitation_resent", entityType: "AdminInvitation", entityId: replacement.id, metadata: { previousInvitationId: previous.id, targetEmail: replacement.email, rolePreset: replacement.rolePreset } } });
    return replacement;
  });
  return { invitation, rawToken };
}

export async function previewAdminInvitation(client: PrismaClient, rawToken: string, now = new Date()) {
  if (typeof rawToken !== "string" || rawToken.length < 32) return null;
  const row = await client.adminInvitation.findUnique({ where: { tokenHash: hashAdminInvitationToken(rawToken) }, select: { id: true, firstName: true, lastName: true, email: true, rolePreset: true, expiresAt: true, acceptedAt: true, revokedAt: true } });
  return row && !row.acceptedAt && !row.revokedAt && !isAdminInvitationExpired(row.expiresAt, now) ? row : null;
}

export async function acceptAdminInvitation(client: PrismaClient, rawToken: string, password: string, now = new Date()) {
  const tokenHash = hashAdminInvitationToken(rawToken); const passwordHash = await bcrypt.hash(password, 12);
  return client.$transaction(async (tx) => {
    const invite = await tx.adminInvitation.findUnique({ where: { tokenHash } });
    if (!invite || invite.acceptedAt || invite.revokedAt || isAdminInvitationExpired(invite.expiresAt, now)) throw new Error("INVALID_INVITATION");
    const existing = await tx.user.findUnique({ where: { email: invite.email }, select: { id: true } }); if (existing) throw new Error("EMAIL_EXISTS");
    const user = await tx.user.create({ data: { name: `${invite.firstName} ${invite.lastName}`, email: invite.email, passwordHash, role: "ADMIN", emailVerified: now } });
    if (invite.permissions.length) await tx.adminPermissionAssignment.createMany({ data: invite.permissions.map((permission) => ({ userId: user.id, permission, grantedById: invite.invitedById })) });
    const consumed = await tx.adminInvitation.updateMany({ where: { id: invite.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } }, data: { acceptedAt: now, acceptedUserId: user.id } }); if (consumed.count !== 1) throw new Error("INVALID_INVITATION");
    await tx.auditLog.create({ data: { actorUserId: user.id, action: "admin.invitation_accepted", entityType: "User", entityId: user.id, metadata: { invitationId: invite.id } } });
    return { userId: user.id, email: user.email };
  });
}
