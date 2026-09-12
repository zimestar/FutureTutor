import "server-only";
import type { AdminPermission, AdminRolePreset } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

export const ADMIN_PERMISSIONS: readonly AdminPermission[] = ["ADMIN_DASHBOARD_VIEW","ADMIN_USERS_READ","ADMIN_USERS_WRITE","ADMIN_TUTORS_READ","ADMIN_TUTORS_REVIEW","ADMIN_TUTORS_APPROVE","ADMIN_TUTORS_SUSPEND","ADMIN_STUDENTS_READ","ADMIN_STUDENTS_SUSPEND","ADMIN_GUARDIANS_READ","ADMIN_GUARDIANS_SUSPEND","ADMIN_BOOKINGS_READ","ADMIN_SESSIONS_READ","ADMIN_QUICKMATCH_READ","ADMIN_QUICKMATCH_MANAGE","ADMIN_PAYMENTS_READ","ADMIN_PRICING_READ","ADMIN_PRICING_MANAGE","ADMIN_ADMINS_VIEW","ADMIN_ADMINS_MANAGE"];
export const ADMIN_PRESETS: Record<Exclude<AdminRolePreset,"CUSTOM">, readonly AdminPermission[]> = {
  FULL_ACCESS: ADMIN_PERMISSIONS,
  OPERATIONS: ["ADMIN_DASHBOARD_VIEW","ADMIN_STUDENTS_READ","ADMIN_STUDENTS_SUSPEND","ADMIN_GUARDIANS_READ","ADMIN_GUARDIANS_SUSPEND","ADMIN_BOOKINGS_READ","ADMIN_SESSIONS_READ","ADMIN_TUTORS_READ","ADMIN_QUICKMATCH_READ"],
  TUTOR_SUCCESS: ["ADMIN_DASHBOARD_VIEW","ADMIN_TUTORS_READ","ADMIN_TUTORS_REVIEW","ADMIN_TUTORS_APPROVE","ADMIN_TUTORS_SUSPEND","ADMIN_STUDENTS_READ","ADMIN_GUARDIANS_READ","ADMIN_BOOKINGS_READ","ADMIN_SESSIONS_READ"],
  FINANCE_READ_ONLY: ["ADMIN_DASHBOARD_VIEW","ADMIN_PAYMENTS_READ","ADMIN_BOOKINGS_READ","ADMIN_SESSIONS_READ","ADMIN_PRICING_READ"],
};

export function permissionsForPreset(preset: AdminRolePreset, custom: readonly AdminPermission[] = []) {
  return [...new Set(preset === "CUSTOM" ? custom : ADMIN_PRESETS[preset])];
}

export type ActiveAdminPrincipal = { id: string; role: "ADMIN" | "SUPER_ADMIN" };

/**
 * ADMIN-AUTH-HARDENING1 — THE single authoritative "is this user currently
 * an active administrator" check. Every other admin-authorization primitive
 * in this codebase (requireAdminPermission below, requireSuperAdmin,
 * hasAdminPermission in src/lib/adminPermission.ts) is built on top of this
 * one function — none of them re-implement their own database read.
 *
 * Deliberately takes only a user id from the (possibly stale) session as
 * identity input, then re-derives EVERYTHING ELSE — role, deactivation
 * status — from a fresh PostgreSQL read on every call. Auth.js here uses JWT
 * sessions (src/lib/auth.ts: session.user.role is copied from the JWT's
 * token.role, which the jwt() callback only ever sets at initial sign-in —
 * it is NOT re-derived from the database on subsequent requests), so
 * session.user.role can be silently stale for the lifetime of the session
 * cookie. Trusting it directly would let a deactivated, demoted, or
 * role-changed administrator retain administrative access until their JWT
 * expires or they log out — this function exists specifically so no admin
 * authorization path has to make that mistake.
 *
 * Fails closed on every ambiguous or negative case: no session user, no
 * current User row (deleted), deactivatedAt non-null, or current DB role
 * not in {ADMIN, SUPER_ADMIN}. Never trusts session.user.role for anything
 * except locating the user id to re-check.
 */
export async function requireActiveAdmin(session: { user?: { id: string; role: string } } | null): Promise<ActiveAdminPrincipal> {
  const user = session?.user;
  if (!user) throw new Error("FORBIDDEN");
  const current = await db.user.findUnique({ where: { id: user.id }, select: { role: true, deactivatedAt: true } });
  if (!current || current.deactivatedAt) throw new Error("FORBIDDEN");
  if (current.role !== "ADMIN" && current.role !== "SUPER_ADMIN") throw new Error("FORBIDDEN");
  return { id: user.id, role: current.role };
}

/**
 * Adds a specific permission check on top of requireActiveAdmin's fresh
 * role/deactivation gate. SUPER_ADMIN implicitly holds every permission
 * (unchanged, intentional semantics — see the AdminPermission model's own
 * design); a plain ADMIN needs a current AdminPermissionAssignment row,
 * re-read fresh on every call (never cached, never inferred from the
 * session) so a just-revoked permission is denied on the very next request.
 */
export async function requireAdminPermission(session: { user?: { id: string; role: string } } | null, permission: AdminPermission): Promise<ActiveAdminPrincipal> {
  const admin = await requireActiveAdmin(session);
  if (admin.role === "SUPER_ADMIN") return admin;
  const granted = await db.adminPermissionAssignment.findUnique({ where: { userId_permission: { userId: admin.id, permission } }, select: { id: true } });
  if (!granted) throw new Error("FORBIDDEN");
  return admin;
}

/**
 * ADMIN-AUTH-HARDENING1 — for the handful of operations intentionally
 * reserved for SUPER_ADMIN alone, never delegable via AdminPermissionAssignment
 * (inviting/promoting/suspending other admins, changing another admin's
 * permissions, manually triggering the payment reconciliation action). This
 * is a DB-fresh policy check, not a new authorization model: it reuses
 * requireActiveAdmin's same fresh read and simply requires the CURRENT role
 * to be exactly SUPER_ADMIN, matching the strict (non-permission-assignable)
 * policy these call sites already intended — a stale JWT that still says
 * SUPER_ADMIN can never pass this once the database says otherwise.
 */
export async function requireSuperAdmin(session: { user?: { id: string; role: string } } | null): Promise<{ id: string; role: "SUPER_ADMIN" }> {
  const admin = await requireActiveAdmin(session);
  if (admin.role !== "SUPER_ADMIN") throw new Error("FORBIDDEN");
  return { id: admin.id, role: "SUPER_ADMIN" };
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
