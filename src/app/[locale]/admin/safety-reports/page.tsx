import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect, Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { adminNavItems } from "@/lib/adminNav";
import { listSafetyConcernReports } from "@/services/safetyConcernReports";
import type { SafetyConcernStatus } from "@/generated/prisma/enums";

const FILTERS: Array<SafetyConcernStatus | "ALL"> = ["OPEN", "UNDER_REVIEW", "RESOLVED", "ALL"];

/** SAFETY-REPORTS1 — queue of safety concern reports; urgent ones first. */
export default async function AdminSafetyReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  const { status: rawStatus } = await searchParams;
  setRequestLocale(locale);

  const session = await auth();
  const user = session?.user;
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
    redirect({ href: "/login", locale });
    return;
  }

  const filter = FILTERS.includes(rawStatus as SafetyConcernStatus) ? (rawStatus as SafetyConcernStatus | "ALL") : "OPEN";
  const [t, tNav, reports] = await Promise.all([
    getTranslations({ locale, namespace: "admin.safetyReports" }),
    getTranslations({ locale, namespace: "dashboard.nav" }),
    listSafetyConcernReports(filter === "ALL" ? undefined : filter),
  ]);
  const tCategory = await getTranslations({ locale, namespace: "safetyReport.categories" });
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  return (
    <DashboardShell navItems={await adminNavItems(tNav, user)} userName={user.name ?? ""}>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((value) => (
          <Button key={value} href={`/admin/safety-reports?status=${value}`} size="sm" variant={value === filter ? "primary" : "outline"}>
            {t(`filters.${value}`)}
          </Button>
        ))}
      </div>

      {reports.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center text-slate">{t("empty")}</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {reports.map((report) => (
            <li key={report.id}>
              <Link
                href={`/admin/safety-reports/${report.id}`}
                className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-4 hover:border-blue/40 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-navy">{tCategory(report.category)}</p>
                  <p className="mt-0.5 truncate text-sm text-slate">
                    {report.reporter.name || report.reporter.email} · {dateFormat.format(report.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {report.immediateDanger && <Badge variant="navy">{t("urgent")}</Badge>}
                  <Badge variant={report.status === "RESOLVED" ? "mint" : "outline"}>{t(`statuses.${report.status}`)}</Badge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashboardShell>
  );
}
