import type { DashboardNavItem } from "@/components/dashboard/DashboardShell";

export function tutorNavItems(tNav: (key: string) => string): DashboardNavItem[] {
  return [
    { label: tNav("overview"), href: "/tutor/dashboard", group: tNav("tutoringGroup") },
    { label: tNav("quickMatch"), href: "/tutor/quick-match", group: tNav("tutoringGroup") },
    { label: tNav("bookings"), href: "/tutor/bookings", group: tNav("tutoringGroup") },
    { label: tNav("payouts"), href: "/tutor/payouts", group: tNav("tutoringGroup") },
    { label: tNav("profile"), href: "/tutor/profile", group: tNav("approvalGroup") },
    { label: tNav("documents"), href: "/tutor/documents", group: tNav("approvalGroup") },
    { label: tNav("training"), href: "/tutor/training", group: tNav("approvalGroup") },
    { label: tNav("exam"), href: "/tutor/exam", group: tNav("approvalGroup") },
    { label: tNav("availability"), href: "/tutor/availability", group: tNav("approvalGroup") },
  ];
}
