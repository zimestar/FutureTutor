import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell, type DashboardNavItem } from "@/components/dashboard/DashboardShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { NotificationCenterList } from "@/components/dashboard/NotificationCenterList";
import { getStudentDashboardNavItems } from "@/lib/dashboardNav";
import { tutorNavItems } from "@/lib/tutorNav";
import { adminNavItems } from "@/lib/adminNav";
import { toNotificationDto } from "@/lib/notificationPresentation";

/**
 * NOTIFICATION-CENTER1 — one page shared by all four authenticated roles
 * (STUDENT/PARENT/TUTOR/ADMIN/SUPER_ADMIN), since the underlying data
 * (Notification.userId = the current user) and the reader logic are
 * identical for all of them — no admin-only branch, no admin override,
 * exactly matching this mission's own scope limit. Each role still gets
 * its OWN correct DashboardShell sidebar, mirroring exactly how every
 * other page in this app already resolves its own nav items per role
 * (no new nav-resolution pattern introduced here).
 *
 * First page of results is fetched here, server-side, so the page has
 * real content on first paint (never an empty shell waiting on a client
 * fetch) — NotificationCenterList takes it from there for "Load more".
 */
export default async function NotificationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  const user = session?.user;
  if (!user) {
    redirect({ href: "/login", locale });
    return;
  }

  const t = await getTranslations({ locale, namespace: "notifications" });
  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });

  let navItems: DashboardNavItem[];
  if (user.role === "TUTOR") {
    const tutorProfile = await db.tutorProfile.findUnique({ where: { userId: user.id }, select: { applicationStatus: true } });
    navItems = tutorNavItems(tNav, tutorProfile?.applicationStatus ?? "DRAFT");
  } else if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") {
    navItems = await adminNavItems(tNav, user);
  } else {
    navItems = getStudentDashboardNavItems(tNav, user.role as "STUDENT" | "PARENT");
  }

  const PAGE_LIMIT = 20;
  const [unreadCount, rows] = await Promise.all([
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    db.notification.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_LIMIT + 1,
    }),
  ]);
  const hasMore = rows.length > PAGE_LIMIT;
  const page = hasMore ? rows.slice(0, PAGE_LIMIT) : rows;

  return (
    <DashboardShell navItems={navItems} userName={user.name ?? ""} userImage={user.image}>
      <PageHeader title={t("pageTitle")} />
      <NotificationCenterList
        initialItems={page.map(toNotificationDto)}
        initialCursor={hasMore ? page[page.length - 1]!.id : null}
        initialUnreadCount={unreadCount}
      />
    </DashboardShell>
  );
}
