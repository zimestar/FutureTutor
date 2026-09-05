import type { DashboardNavItem } from "@/components/dashboard/DashboardShell";

/**
 * Phase H.6 — the shared Student/Parent dashboard nav item list, extracted
 * so the new "My Profile" link (§12) is added in exactly one place instead
 * of six near-identical array literals silently drifting out of sync (the
 * six pre-H.6 pages each built this array inline). Purely a navigation
 * convenience — every page still independently re-authorizes its own
 * content server-side (H.6 §40: UI navigation is never the security
 * boundary).
 */
export function getStudentDashboardNavItems(
  tNav: (key: string) => string,
  role: "STUDENT" | "PARENT"
): DashboardNavItem[] {
  const items: DashboardNavItem[] = [
    { label: tNav("overview"), href: "/dashboard", group: tNav("learningGroup") },
    { label: tNav("findTutor"), href: "/dashboard/find-tutors", group: tNav("learningGroup") },
    { label: tNav("quickMatch"), href: "/dashboard/quick-match", group: tNav("learningGroup") },
    { label: tNav("bookings"), href: "/dashboard/bookings", group: tNav("learningGroup") },
    { label: tNav("favorites"), href: "/dashboard/favorites", group: tNav("learningGroup") },
  ];
  if (role === "PARENT") {
    items.push({ label: tNav("family"), href: "/dashboard/family", group: tNav("accountGroup") });
  }
  items.push({ label: tNav("payments"), href: "/dashboard/payments", group: tNav("accountGroup") });
  items.push({ label: tNav("profile"), href: "/dashboard/profile", group: tNav("accountGroup") });
  return items;
}
