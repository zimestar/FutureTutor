import "server-only";
import { db } from "@/lib/db";
import type { AdminPermission } from "@/generated/prisma/enums";

/**
 * MESSAGING-MVP1C — a real, server-side permission check (not just a nav-
 * visibility convenience like adminNavItems' own inline computation).
 * SUPER_ADMIN always passes, matching that role's existing "implicitly
 * holds every permission" rule everywhere else in this codebase. A plain
 * ADMIN passes only with an explicit AdminPermissionAssignment row — never
 * assumed, never inherited from any other permission. Every other role
 * (PARENT/STUDENT/TUTOR) always fails.
 */
export async function hasAdminPermission(user: { id: string; role: string }, permission: AdminPermission): Promise<boolean> {
  if (user.role === "SUPER_ADMIN") return true;
  if (user.role !== "ADMIN") return false;

  const assignment = await db.adminPermissionAssignment.findUnique({
    where: { userId_permission: { userId: user.id, permission } },
    select: { id: true },
  });
  return assignment !== null;
}
