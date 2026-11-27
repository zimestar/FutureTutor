import "server-only";
import { db } from "@/lib/db";
import type { DashboardNavItem } from "@/components/dashboard/DashboardShell";
import { adminNavItems } from "@/lib/adminNav";
import { tutorNavItems } from "@/lib/tutorNav";
import { getStudentDashboardNavItems } from "@/lib/dashboardNav";

/**
 * SAFETY-REPORTS1 — the dashboard navigation of whoever is signed in, for
 * pages shared by every role (e.g. /report-concern). Navigation only: each
 * page still authorizes its own content.
 */
export async function navItemsForUser(
  tNav: (key: string) => string,
  user: { id: string; role: string }
): Promise<DashboardNavItem[]> {
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") return adminNavItems(tNav, user);
  if (user.role === "TUTOR") {
    const tutor = await db.tutorProfile.findUnique({ where: { userId: user.id }, select: { applicationStatus: true } });
    return tutorNavItems(tNav, tutor?.applicationStatus ?? "DRAFT");
  }
  return getStudentDashboardNavItems(tNav, user.role === "PARENT" ? "PARENT" : "STUDENT");
}
