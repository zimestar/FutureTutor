import "server-only";
import type { AdminPermission } from "@/generated/prisma/enums";
import { requireAdminPermission } from "@/services/adminPermissions";

/**
 * MESSAGING-MVP1C — a real, server-side permission check (not just a nav-
 * visibility convenience like adminNavItems' own inline computation).
 *
 * ADMIN-AUTH-HARDENING1 — this used to trust `user.role` (as passed in by
 * the caller, ordinarily session.user.role — a JWT-carried value that only
 * ever reflects the role at LOGIN time, never re-derived per request; see
 * requireActiveAdmin's own doc comment in src/services/adminPermissions.ts
 * for the full explanation) directly for the ADMIN/SUPER_ADMIN gate and the
 * SUPER_ADMIN "implicitly holds every permission" bypass, checking the
 * database only for the specific AdminPermissionAssignment row. A
 * deactivated or demoted administrator whose JWT still said ADMIN or
 * SUPER_ADMIN would therefore have kept passing here until their session
 * expired. Now delegates entirely to requireAdminPermission — the single
 * authoritative, DB-fresh admin check every other admin authorization path
 * in this codebase shares — so every caller of this function gets the same
 * fresh-role/fresh-deactivation guarantee automatically, with no call-site
 * changes required (this function's boolean-returning, never-throwing
 * contract is unchanged).
 *
 * The `user.role` check below is now only a CHEAP PRE-FILTER: it can only
 * ever DENY based on stale data (skipping a DB round trip for a role that
 * obviously isn't admin-shaped), never GRANT — every actual grant, including
 * the SUPER_ADMIN bypass, is decided by requireAdminPermission's fresh read.
 */
export async function hasAdminPermission(user: { id: string; role: string }, permission: AdminPermission): Promise<boolean> {
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") return false;

  try {
    await requireAdminPermission({ user }, permission);
    return true;
  } catch {
    return false;
  }
}
