import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  const user = session?.user;
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
    redirect({ href: "/login", locale });
    return;
  }

  const t = await getTranslations({ locale, namespace: "dashboard.admin" });
  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });

  const [userCount, tutorCount, pendingTutorCount] = await Promise.all([
    db.user.count(),
    db.tutorProfile.count(),
    db.tutorProfile.count({ where: { applicationStatus: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
  ]);

  const stats = [
    { label: t("stats.totalUsers"), value: userCount },
    { label: t("stats.totalTutors"), value: tutorCount },
    { label: t("stats.pendingApplications"), value: pendingTutorCount },
  ];

  return (
    <DashboardShell navItems={[{ label: tNav("overview"), href: "/admin" }]} userName={user.name ?? ""}>
      <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
      <p className="mt-2 max-w-xl text-slate">{t("description")}</p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-neutral-200 bg-white p-6">
            <p className="text-3xl font-extrabold text-navy">{stat.value}</p>
            <p className="mt-1 text-sm font-semibold text-slate">{stat.label}</p>
          </div>
        ))}
      </div>
    </DashboardShell>
  );
}
