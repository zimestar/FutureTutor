import type { DashboardNavItem } from "@/components/dashboard/DashboardShell";
import type { TutorApplicationStatus } from "@/generated/prisma/enums";

export function tutorNavItems(
  tNav: (key: string) => string,
  applicationStatus: TutorApplicationStatus,
): DashboardNavItem[] {
  if (applicationStatus === "APPROVED") {
    return [
      { label: tNav("overview"), href: "/tutor/dashboard", group: tNav("tutoringGroup") },
      { label: tNav("quickMatch"), href: "/tutor/quick-match", group: tNav("tutoringGroup") },
      { label: tNav("bookings"), href: "/tutor/bookings", group: tNav("tutoringGroup") },
      { label: tNav("messages"), href: "/messages", group: tNav("tutoringGroup") },
      { label: tNav("availability"), href: "/tutor/availability", group: tNav("tutoringGroup") },
      { label: tNav("payouts"), href: "/tutor/payouts", group: tNav("tutoringGroup") },
      { label: tNav("profile"), href: "/tutor/profile", group: tNav("tutoringGroup") },
      // PROD-TUTOR-UX2 — /tutor-agreement is a public marketing route (no
      // Tutor sidebar of its own, shared with Terms/Privacy/Cookies); opens
      // in a new tab so the dashboard tab/sidebar is never navigated away
      // from, matching the exact convention already used for this same link
      // elsewhere in the app (TutorAgreementBanner.tsx, TutorProfileForm.tsx).
      { label: tNav("tutorAgreement"), href: "/tutor-agreement", group: tNav("tutoringGroup"), openInNewTab: true },
    ];
  }

  return [
    { label: tNav("applicationOverview"), href: "/tutor/dashboard", group: tNav("approvalGroup") },
    { label: tNav("profile"), href: "/tutor/profile", group: tNav("approvalGroup") },
    { label: tNav("documents"), href: "/tutor/documents", group: tNav("approvalGroup") },
    { label: tNav("training"), href: "/tutor/training", group: tNav("approvalGroup") },
    { label: tNav("exam"), href: "/tutor/exam", group: tNav("approvalGroup") },
    { label: tNav("availability"), href: "/tutor/availability", group: tNav("approvalGroup") },
    { label: tNav("tutorAgreement"), href: "/tutor-agreement", group: tNav("approvalGroup"), openInNewTab: true },
  ];
}
