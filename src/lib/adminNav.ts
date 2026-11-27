import "server-only";
import type { AdminPermission } from "@/generated/prisma/enums";
import type { DashboardNavItem } from "@/components/dashboard/DashboardShell";
import { db } from "@/lib/db";

type AdminNavUser = { id: string; role: string };
type AdminNavGroup = "overviewGroup" | "peopleGroup" | "activityGroup" | "trustGroup" | "financeGroup" | "settingsGroup";

/**
 * DESIGN-SYSTEM2 — the admin sidebar, by purpose. Each item still requires its
 * own permission; a group with no permitted item simply disappears.
 */
const items: ReadonlyArray<{ key: string; href: string; group: AdminNavGroup; permission: AdminPermission; activePrefix?: string }> = [
  { key: "overview", href: "/admin", group: "overviewGroup", permission: "ADMIN_DASHBOARD_VIEW" },
  // One entry for tutors: the applications board and the full list are two
  // tabs of the same section (see AdminTutorsTabs).
  { key: "tutors", href: "/admin/tutors/pipeline", group: "peopleGroup", permission: "ADMIN_TUTORS_READ", activePrefix: "/admin/tutors" },
  { key: "students", href: "/admin/students", group: "peopleGroup", permission: "ADMIN_STUDENTS_READ" },
  { key: "parents", href: "/admin/parents", group: "peopleGroup", permission: "ADMIN_GUARDIANS_READ" },
  { key: "familyInvitations", href: "/admin/family", group: "peopleGroup", permission: "ADMIN_GUARDIANS_READ" },
  { key: "users", href: "/admin/users", group: "peopleGroup", permission: "ADMIN_USERS_READ" },
  { key: "bookings", href: "/admin/bookings", group: "activityGroup", permission: "ADMIN_BOOKINGS_READ" },
  { key: "sessions", href: "/admin/sessions", group: "activityGroup", permission: "ADMIN_SESSIONS_READ" },
  { key: "quickMatch", href: "/admin/quick-match", group: "activityGroup", permission: "ADMIN_QUICKMATCH_READ" },
  // SAFETY-REPORTS1 / MESSAGING-MVP1C / ADMIN-AUDITLOG-VIEWER1 — each has its
  // own dedicated permission (see the AdminPermission enum comments); only
  // SUPER_ADMIN has them automatically.
  { key: "safetyReports", href: "/admin/safety-reports", group: "trustGroup", permission: "ADMIN_SAFETY_REPORTS" },
  { key: "messageReports", href: "/admin/message-reports", group: "trustGroup", permission: "ADMIN_MESSAGE_REPORTS_READ" },
  { key: "auditLog", href: "/admin/audit-log", group: "trustGroup", permission: "ADMIN_AUDIT_LOG_READ" },
  { key: "payments", href: "/admin/payments", group: "financeGroup", permission: "ADMIN_PAYMENTS_READ" },
  // ADMIN-FINANCIAL-OPS1A — reuses ADMIN_PAYMENTS_READ (read-only extension
  // of the same financial visibility as /admin/payments).
  { key: "financialOps", href: "/admin/financial-ops", group: "financeGroup", permission: "ADMIN_PAYMENTS_READ" },
  { key: "pricing", href: "/admin/pricing", group: "financeGroup", permission: "ADMIN_PRICING_READ" },
  { key: "admins", href: "/admin/admins", group: "settingsGroup", permission: "ADMIN_ADMINS_VIEW" },
];

export async function adminNavItems(tNav: (key: string) => string, user: AdminNavUser): Promise<DashboardNavItem[]> {
  const allowed = user.role === "SUPER_ADMIN"
    ? new Set(items.map((item) => item.permission))
    : new Set((await db.adminPermissionAssignment.findMany({ where: { userId: user.id }, select: { permission: true } })).map((row) => row.permission));
  return items
    .filter((item) => allowed.has(item.permission))
    .map((item) => ({
      label: tNav(item.key),
      href: item.href,
      group: item.group === "overviewGroup" ? undefined : tNav(item.group),
      activePrefix: item.activePrefix,
    }));
}
