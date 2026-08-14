import type { DashboardNavItem } from "@/components/dashboard/DashboardShell";

export function tutorNavItems(tNav: (key: string) => string): DashboardNavItem[] {
  return [
    { label: tNav("overview"), href: "/tutor/dashboard" },
    { label: tNav("profile"), href: "/tutor/profile" },
    { label: tNav("documents"), href: "/tutor/documents" },
    { label: tNav("training"), href: "/tutor/training" },
    { label: tNav("exam"), href: "/tutor/exam" },
    { label: tNav("availability"), href: "/tutor/availability" },
    { label: tNav("quickMatch"), href: "/tutor/quick-match" },
    { label: tNav("bookings"), href: "/tutor/bookings" },
    { label: tNav("payouts"), href: "/tutor/payouts" },
  ];
}
