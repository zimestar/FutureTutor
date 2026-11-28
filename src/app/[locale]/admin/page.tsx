import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, CalendarDays, FileSearch, GraduationCap, MessageSquareWarning, ShieldAlert, UsersRound, Video } from "lucide-react";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { redirect, Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { adminNavItems } from "@/lib/adminNav";
import { requireAdminPermission } from "@/services/adminPermissions";
import { loadTutorPipeline } from "@/services/tutorPipelineQueue";
import { DIGEST_THRESHOLD_DAYS } from "@/lib/tutorPipeline/pipelineQueue";
import { cn } from "@/lib/utils";
import { DashboardHero, DashboardTile } from "@/components/dashboard/DashboardHero";

/** APP-COLOR — accent per to-do card and per figure tile. */
const TODO_TONES: Record<string, { card: string; chip: string }> = {
  blue: { card: "border-blue-100 bg-blue-50", chip: "bg-blue text-white" },
  coral: { card: "border-coral-100 bg-coral-50", chip: "bg-coral text-navy" },
  lilac: { card: "border-lilac-100 bg-lilac-50", chip: "bg-lilac text-white" },
  sun: { card: "border-sun-100 bg-sun-50", chip: "bg-sun text-navy" },
};
const STAT_TONES = ["mint", "blue", "sun", "coral"] as const;

/**
 * Admin overview. DESIGN-SYSTEM2: what needs the team today comes first
 * (applications, safety and message reports, documents), then the platform
 * figures. Every card links to the page where the work is done; those pages
 * enforce their own permissions.
 */
export default async function AdminDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  const user = session?.user;
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
    redirect({ href: "/login", locale });
    return;
  }
  await requireAdminPermission(session, "ADMIN_DASHBOARD_VIEW");

  const [t, tNav] = await Promise.all([
    getTranslations({ locale, namespace: "dashboard.admin" }),
    getTranslations({ locale, namespace: "dashboard.nav" }),
  ]);

  const [pipeline, openSafety, urgentSafety, openMessageReports, pendingDocuments, userCount, tutorCount, studentCount, upcomingBookingCount, activeSessionCount] =
    await Promise.all([
      loadTutorPipeline(),
      db.safetyConcernReport.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
      db.safetyConcernReport.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] }, immediateDanger: true } }),
      db.messageReport.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
      db.tutorDocument.count({ where: { status: { in: ["UPLOADED", "PENDING_REVIEW"] }, tutorProfile: { applicationStatus: { not: "DRAFT" } } } }),
      db.user.count(),
      db.tutorProfile.count({ where: { applicationStatus: "APPROVED" } }),
      db.studentProfile.count(),
      db.booking.count({ where: { status: "CONFIRMED", startAt: { gte: new Date() } } }),
      db.session_.count({ where: { status: "IN_PROGRESS" } }),
    ]);
  const teamApplications = pipeline.filter((entry) => entry.owner === "admin");
  const overdueApplications = teamApplications.filter((entry) => entry.waitingDays >= DIGEST_THRESHOLD_DAYS).length;

  const todo: Array<{ label: string; value: number; detail?: string; href: string; icon: ReactNode; urgent: boolean; tone: string }> = [
    {
      label: t("todo.applications"),
      value: teamApplications.length,
      detail: overdueApplications > 0 ? t("todo.overdue", { count: overdueApplications }) : undefined,
      href: "/admin/tutors/pipeline",
      icon: <UsersRound className="size-5" aria-hidden="true" />,
      urgent: overdueApplications > 0,
      tone: "blue",
    },
    {
      label: t("todo.safetyReports"),
      value: openSafety,
      detail: urgentSafety > 0 ? t("todo.urgent", { count: urgentSafety }) : undefined,
      href: "/admin/safety-reports",
      icon: <ShieldAlert className="size-5" aria-hidden="true" />,
      urgent: urgentSafety > 0,
      tone: "coral",
    },
    {
      label: t("todo.messageReports"),
      value: openMessageReports,
      href: "/admin/message-reports",
      icon: <MessageSquareWarning className="size-5" aria-hidden="true" />,
      urgent: false,
      tone: "lilac",
    },
    {
      label: t("todo.documents"),
      value: pendingDocuments,
      href: "/admin/tutors/pipeline",
      icon: <FileSearch className="size-5" aria-hidden="true" />,
      urgent: false,
      tone: "sun",
    },
  ];

  const stats = [
    { label: t("stats.approvedTutors"), value: tutorCount, href: "/admin/tutors?status=all", icon: <UsersRound className="size-5" aria-hidden="true" /> },
    { label: t("stats.totalStudents"), value: studentCount, href: "/admin/students", icon: <GraduationCap className="size-5" aria-hidden="true" /> },
    { label: t("stats.upcomingBookings"), value: upcomingBookingCount, href: "/admin/bookings?status=CONFIRMED", icon: <CalendarDays className="size-5" aria-hidden="true" /> },
    { label: t("stats.activeSessions"), value: activeSessionCount, href: "/admin/sessions?status=IN_PROGRESS", icon: <Video className="size-5" aria-hidden="true" /> },
  ];
  const nothingToDo = todo.every((item) => item.value === 0);

  return (
    <DashboardShell navItems={await adminNavItems(tNav, user)} userName={user.name ?? ""}>
      <DashboardHero
        tone="lilac"
        headingId="admin-home-heading"
        title={t("title")}
        description={t("description")}
        badge={<span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-bold text-navy">{t("totalUsers", { count: userCount })}</span>}
      />

      <section aria-labelledby="admin-todo" className="mt-10">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="admin-todo" className="text-lg font-bold text-navy">
            {t("todo.title")}
          </h2>
          {nothingToDo && <p className="rounded-full bg-mint-50 px-3 py-1 text-sm font-semibold text-emerald-700">{t("todo.allClear")}</p>}
        </div>
        <ul className="reveal-stagger mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {todo.map((item) => (
            <li key={item.label}>
              <Link
                href={item.href}
                className={cn(
                  "motion-lift group flex h-full flex-col rounded-3xl border p-5 hover:shadow-(--shadow-card-hover)",
                  item.urgent ? "border-red-300 bg-red-50" : TODO_TONES[item.tone].card
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn("flex size-11 items-center justify-center rounded-2xl", item.urgent ? "bg-red-600 text-white" : TODO_TONES[item.tone].chip)}>
                    {item.icon}
                  </span>
                  <ArrowRight className="size-4 text-navy/30 transition-colors group-hover:text-navy" aria-hidden="true" />
                </div>
                <p className={cn("mt-5 text-4xl font-extrabold tracking-tight", item.value > 0 ? "text-navy" : "text-navy/30")}>{item.value}</p>
                <p className="mt-1 text-sm font-semibold text-neutral-700">{item.label}</p>
                {item.detail && <p className={cn("mt-2 text-xs font-bold", item.urgent ? "text-red-600" : "text-neutral-500")}>{item.detail}</p>}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="admin-figures" className="mt-12">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="admin-figures" className="text-lg font-bold text-navy">
            {t("figuresTitle")}
          </h2>
          <p className="text-sm font-semibold text-navy/60">{t("totalUsers", { count: userCount })}</p>
        </div>
        <div className="reveal-stagger mt-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {stats.map((stat, index) => (
            <DashboardTile key={stat.label} tone={STAT_TONES[index % STAT_TONES.length]} icon={stat.icon} value={stat.value} label={stat.label} href={stat.href} />
          ))}
        </div>
      </section>
    </DashboardShell>
  );
}
