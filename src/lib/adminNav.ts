import type { DashboardNavItem } from "@/components/dashboard/DashboardShell";

export function adminNavItems(tNav: (key: string) => string): DashboardNavItem[] {
  return [
    { label: tNav("overview"), href: "/admin" },
    { label: tNav("tutors"), href: "/admin/tutors" },
    { label: tNav("pricing"), href: "/admin/pricing" },
    { label: tNav("quickMatch"), href: "/admin/quick-match" },
    { label: tNav("payments"), href: "/admin/payments" },
    { label: tNav("familyInvitations"), href: "/admin/family" },
  ];
}
