import "server-only";
import type { AdminPermission, AdminRolePreset } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

export const ADMIN_PERMISSIONS: readonly AdminPermission[] = ["ADMIN_DASHBOARD_VIEW","ADMIN_USERS_READ","ADMIN_USERS_WRITE","ADMIN_TUTORS_READ","ADMIN_TUTORS_REVIEW","ADMIN_TUTORS_APPROVE","ADMIN_TUTORS_SUSPEND","ADMIN_STUDENTS_READ","ADMIN_GUARDIANS_READ","ADMIN_BOOKINGS_READ","ADMIN_SESSIONS_READ","ADMIN_QUICKMATCH_READ","ADMIN_QUICKMATCH_MANAGE","ADMIN_PAYMENTS_READ","ADMIN_PRICING_READ","ADMIN_PRICING_MANAGE","ADMIN_ADMINS_VIEW","ADMIN_ADMINS_MANAGE"];
export const ADMIN_PRESETS: Record<Exclude<AdminRolePreset,"CUSTOM">, readonly AdminPermission[]> = {
  FULL_ACCESS: ADMIN_PERMISSIONS,
  OPERATIONS: ["ADMIN_DASHBOARD_VIEW","ADMIN_STUDENTS_READ","ADMIN_GUARDIANS_READ","ADMIN_BOOKINGS_READ","ADMIN_SESSIONS_READ","ADMIN_TUTORS_READ","ADMIN_QUICKMATCH_READ"],
  TUTOR_SUCCESS: ["ADMIN_DASHBOARD_VIEW","ADMIN_TUTORS_READ","ADMIN_TUTORS_REVIEW","ADMIN_TUTORS_APPROVE","ADMIN_TUTORS_SUSPEND","ADMIN_STUDENTS_READ","ADMIN_GUARDIANS_READ","ADMIN_BOOKINGS_READ","ADMIN_SESSIONS_READ"],
  FINANCE_READ_ONLY: ["ADMIN_DASHBOARD_VIEW","ADMIN_PAYMENTS_READ","ADMIN_BOOKINGS_READ","ADMIN_SESSIONS_READ","ADMIN_PRICING_READ"],
};

export function permissionsForPreset(preset: AdminRolePreset, custom: readonly AdminPermission[] = []) {
  return [...new Set(preset === "CUSTOM" ? custom : ADMIN_PRESETS[preset])];
}

export async function requireAdminPermission(session: { user?: { id: string; role: string } } | null, permission: AdminPermission) {
  const user = session?.user;
  if (!user || !["ADMIN","SUPER_ADMIN"].includes(user.role)) throw new Error("FORBIDDEN");
  const current = await db.user.findUnique({ where: { id: user.id }, select: { role: true, deactivatedAt: true } });
  if (!current || current.deactivatedAt || current.role !== user.role) throw new Error("FORBIDDEN");
  if (current.role === "SUPER_ADMIN") return user;
  const granted = await db.adminPermissionAssignment.findUnique({ where: { userId_permission: { userId: user.id, permission } }, select: { id: true } });
  if (!granted) throw new Error("FORBIDDEN");
  return user;
}

export async function replaceAdminPermissions(targetUserId: string, permissions: readonly AdminPermission[], actorUserId: string) {
  if (targetUserId === actorUserId) throw new Error("SELF_PERMISSION_CHANGE_DENIED");
  await db.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: targetUserId }, select: { role: true } });
    if (!target || target.role !== "ADMIN") throw new Error("TARGET_NOT_ADMIN");
    await tx.adminPermissionAssignment.deleteMany({ where: { userId: targetUserId } });
    if (permissions.length) await tx.adminPermissionAssignment.createMany({ data: [...new Set(permissions)].map((permission) => ({ userId: targetUserId, permission, grantedById: actorUserId })) });
    await tx.auditLog.create({ data: { actorUserId, action: "admin.permissions_updated", entityType: "User", entityId: targetUserId, metadata: { permissions: [...permissions] } } });
  });
}
