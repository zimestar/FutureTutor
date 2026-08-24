import type { DashboardNavItem } from "@/components/dashboard/DashboardShell";

export function adminNavItems(tNav: (key: string) => string): DashboardNavItem[] {
  return [
    { label: tNav("overview"), href: "/admin", group: tNav("operationsGroup") },
    { label: tNav("tutors"), href: "/admin/tutors", group: tNav("operationsGroup") },
    { label: tNav("students"), href: "/admin/students", group: tNav("operationsGroup") },
    { label: tNav("bookings"), href: "/admin/bookings", group: tNav("operationsGroup") },
    { label: tNav("sessions"), href: "/admin/sessions", group: tNav("operationsGroup") },
    { label: tNav("users"), href: "/admin/users", group: tNav("operationsGroup") },
    { label: tNav("quickMatch"), href: "/admin/quick-match", group: tNav("operationsGroup") },
    { label: tNav("familyInvitations"), href: "/admin/family", group: tNav("operationsGroup") },
    { label: tNav("pricing"), href: "/admin/pricing", group: tNav("financeGroup") },
    { label: tNav("payments"), href: "/admin/payments", group: tNav("financeGroup") },
  ];
}
