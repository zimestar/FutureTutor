import "server-only";
import type { AdminPermission } from "@/generated/prisma/enums";
import type { DashboardNavItem } from "@/components/dashboard/DashboardShell";
import { db } from "@/lib/db";

type AdminNavUser = { id: string; role: string };
const items: ReadonlyArray<{ key: string; href: string; group: "operationsGroup" | "financeGroup"; permission: AdminPermission }> = [
  { key: "overview", href: "/admin", group: "operationsGroup", permission: "ADMIN_DASHBOARD_VIEW" },
  { key: "tutors", href: "/admin/tutors", group: "operationsGroup", permission: "ADMIN_TUTORS_READ" },
  { key: "students", href: "/admin/students", group: "operationsGroup", permission: "ADMIN_STUDENTS_READ" },
  { key: "parents", href: "/admin/parents", group: "operationsGroup", permission: "ADMIN_GUARDIANS_READ" },
  { key: "bookings", href: "/admin/bookings", group: "operationsGroup", permission: "ADMIN_BOOKINGS_READ" },
  { key: "sessions", href: "/admin/sessions", group: "operationsGroup", permission: "ADMIN_SESSIONS_READ" },
  { key: "users", href: "/admin/users", group: "operationsGroup", permission: "ADMIN_USERS_READ" },
  { key: "admins", href: "/admin/admins", group: "operationsGroup", permission: "ADMIN_ADMINS_VIEW" },
  { key: "quickMatch", href: "/admin/quick-match", group: "operationsGroup", permission: "ADMIN_QUICKMATCH_READ" },
  { key: "familyInvitations", href: "/admin/family", group: "operationsGroup", permission: "ADMIN_GUARDIANS_READ" },
  // MESSAGING-MVP1C — a dedicated permission (see the AdminPermission enum's
  // own comment): not auto-granted to any existing ADMIN, only SUPER_ADMIN.
  { key: "messageReports", href: "/admin/message-reports", group: "operationsGroup", permission: "ADMIN_MESSAGE_REPORTS_READ" },
  { key: "pricing", href: "/admin/pricing", group: "financeGroup", permission: "ADMIN_PRICING_READ" },
  { key: "payments", href: "/admin/payments", group: "financeGroup", permission: "ADMIN_PAYMENTS_READ" },
  // ADMIN-FINANCIAL-OPS1A — reuses ADMIN_PAYMENTS_READ rather than adding a
  // new AdminPermission enum value: this page is a read-only extension of
  // the same "financial visibility" concern /admin/payments already gates
  // on, and avoiding a new enum value means no migration is needed and no
  // existing ADMIN (already granted ADMIN_PAYMENTS_READ, since that page is
  // already live) is unexpectedly locked out of seeing it.
  { key: "financialOps", href: "/admin/financial-ops", group: "financeGroup", permission: "ADMIN_PAYMENTS_READ" },
];

export async function adminNavItems(tNav: (key: string) => string, user: AdminNavUser): Promise<DashboardNavItem[]> {
  const allowed = user.role === "SUPER_ADMIN"
    ? new Set(items.map((item) => item.permission))
    : new Set((await db.adminPermissionAssignment.findMany({ where: { userId: user.id }, select: { permission: true } })).map((row) => row.permission));
  return items.filter((item) => allowed.has(item.permission)).map((item) => ({ label: tNav(item.key), href: item.href, group: tNav(item.group) }));
}
