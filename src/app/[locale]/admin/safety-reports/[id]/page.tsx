import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { adminNavItems } from "@/lib/adminNav";
import { getSafetyConcernReport } from "@/services/safetyConcernReports";
import { updateSafetyConcernStatusAction } from "@/lib/actions/safetyConcernReports";
import { SAFETY_CONCERN_NOTE_MAX_LENGTH, SAFETY_CONCERN_STATUSES } from "@/schemas/safetyConcernReports";

/** SAFETY-REPORTS1 — one report, its reporter, and the handling status. */
export default async function AdminSafetyReportDetailPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = await auth();
  const user = session?.user;
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
    redirect({ href: "/login", locale });
    return;
  }

  const report = await getSafetyConcernReport(id);
  if (!report) notFound();

  const [t, tNav, tCategory] = await Promise.all([
    getTranslations({ locale, namespace: "admin.safetyReports" }),
    getTranslations({ locale, namespace: "dashboard.nav" }),
    getTranslations({ locale, namespace: "safetyReport.categories" }),
  ]);
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  return (
    <DashboardShell navItems={await adminNavItems(tNav, user)} userName={user.name ?? ""}>
      <Button href="/admin/safety-reports" variant="outline" size="sm">
        {t("back")}
      </Button>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-navy">{tCategory(report.category)}</h1>
        {report.immediateDanger && <Badge variant="navy">{t("urgent")}</Badge>}
        <Badge variant={report.status === "RESOLVED" ? "mint" : "outline"}>{t(`statuses.${report.status}`)}</Badge>
      </div>

      <dl className="mt-6 grid grid-cols-1 gap-4 rounded-2xl border border-neutral-200 bg-white p-5 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-slate">{t("reporter")}</dt>
          <dd className="font-semibold text-navy">
            {report.reporter.name || "—"} · {report.reporter.email} ({report.reporterRole})
          </dd>
        </div>
        <div>
          <dt className="text-sm text-slate">{t("receivedAt")}</dt>
          <dd className="font-semibold text-navy">{dateFormat.format(report.createdAt)}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-sm text-slate">{t("concerning")}</dt>
          <dd className="font-semibold text-navy">{report.concerning ?? "—"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-sm text-slate">{t("descriptionLabel")}</dt>
          {/* Plain text rendered as text: React escapes it. */}
          <dd className="mt-1 whitespace-pre-wrap rounded-lg bg-off-white p-3 text-navy">{report.description}</dd>
        </div>
        {report.resolvedAt && (
          <div className="sm:col-span-2">
            <dt className="text-sm text-slate">{t("resolvedBy")}</dt>
            <dd className="font-semibold text-navy">
              {report.resolvedByUser?.name || report.resolvedByUser?.email || "—"} · {dateFormat.format(report.resolvedAt)}
            </dd>
          </div>
        )}
      </dl>

      <form action={updateSafetyConcernStatusAction.bind(null, report.id)} className="mt-6 flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="font-bold text-navy">{t("handling")}</h2>
        <div>
          <label htmlFor="safety-status" className="mb-1.5 block text-sm font-semibold text-navy">
            {t("statusLabel")}
          </label>
          <Select id="safety-status" name="status" defaultValue={report.status}>
            {SAFETY_CONCERN_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`statuses.${status}`)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="safety-note" className="mb-1.5 block text-sm font-semibold text-navy">
            {t("noteLabel")}
          </label>
          <textarea
            id="safety-note"
            name="resolutionNote"
            rows={4}
            maxLength={SAFETY_CONCERN_NOTE_MAX_LENGTH}
            defaultValue={report.resolutionNote ?? ""}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-navy focus:border-blue focus:outline-none focus:ring-2 focus:ring-blue/20"
          />
          <p className="mt-1 text-xs text-slate">{t("noteHelp")}</p>
        </div>
        <div>
          <Button type="submit">{t("save")}</Button>
        </div>
      </form>
    </DashboardShell>
  );
}
