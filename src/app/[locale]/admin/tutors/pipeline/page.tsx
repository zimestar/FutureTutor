import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect, Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { adminNavItems } from "@/lib/adminNav";
import { cn } from "@/lib/utils";
import { loadTutorPipeline, type PipelineEntry } from "@/services/tutorPipelineQueue";
import { AdminTutorsTabs } from "@/components/admin/AdminTutorsTabs";
import { DIGEST_THRESHOLD_DAYS, PIPELINE_STAGES, type PipelineOwner } from "@/lib/tutorPipeline/pipelineQueue";

/**
 * TUTOR-PIPELINE1 — every open tutor application as a work queue.
 *
 * Top: what the team has to do, oldest first. Below: every stage with the
 * applications in it. Access is enforced by admin/tutors/layout.tsx
 * (ADMIN_TUTORS_READ); the actions themselves stay on the detail page,
 * which re-checks its own permissions.
 */

const OWNER_BADGE: Record<PipelineOwner, "navy" | "blue" | "neutral"> = {
  admin: "navy",
  candidate: "blue",
  none: "neutral",
};

export default async function AdminTutorPipelinePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  const user = session?.user;
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
    redirect({ href: "/login", locale });
    return;
  }

  const [t, tNav, tStatus, tNext] = await Promise.all([
    getTranslations({ locale, namespace: "admin.tutorPipeline" }),
    getTranslations({ locale, namespace: "dashboard.nav" }),
    getTranslations({ locale, namespace: "dashboard.tutor.applicationStatus" }),
    getTranslations({ locale, namespace: "adminAlertEmail.nextActions" }),
  ]);

  const pipeline = await loadTutorPipeline();
  const teamQueue = pipeline.filter((entry) => entry.owner === "admin").sort((a, b) => b.waitingDays - a.waitingDays);
  const candidateCount = pipeline.filter((entry) => entry.owner === "candidate").length;
  const ownerLabel = (owner: PipelineOwner) =>
    owner === "admin" ? t("ownerAdmin") : owner === "candidate" ? t("ownerCandidate") : t("ownerNone");

  const renderEntry = (entry: PipelineEntry, showStage: boolean) => {
    const overdue = entry.owner === "admin" && entry.waitingDays >= DIGEST_THRESHOLD_DAYS;
    return (
      <li key={entry.tutorProfileId}>
        <Link
          href={`/admin/tutors/${entry.tutorProfileId}`}
          className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-4 transition-colors hover:border-blue/40 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="truncate font-semibold text-navy">{entry.tutorName || entry.email}</p>
            <p className="mt-0.5 text-sm text-slate">{tNext(entry.nextAction)}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {showStage && <Badge variant="outline">{tStatus(entry.status)}</Badge>}
            <Badge variant={OWNER_BADGE[entry.owner]}>{ownerLabel(entry.owner)}</Badge>
            <span className={cn("text-sm", overdue ? "font-semibold text-red-600" : "text-slate")}>
              {overdue ? `${t("overdue")} · ` : ""}
              {t("waitingDays", { days: entry.waitingDays })}
            </span>
          </div>
        </Link>
      </li>
    );
  };

  return (
    <DashboardShell navItems={await adminNavItems(tNav, user)} userName={user.name ?? ""}>
      <AdminTutorsTabs locale={locale} active="applications" />
      <PageHeader title={t("title")} description={t("description")} />

      <div className="mt-6 flex flex-wrap gap-2">
        <Badge variant="navy">{t("summaryAdmin", { count: teamQueue.length })}</Badge>
        <Badge variant="blue">{t("summaryCandidate", { count: candidateCount })}</Badge>
      </div>

      {teamQueue.length > 0 && (
        <section className="mt-8" aria-labelledby="team-queue">
          <h2 id="team-queue" className="text-lg font-bold text-navy">
            {t("summaryAdmin", { count: teamQueue.length })}
          </h2>
          <ul className="mt-3 flex flex-col gap-3">{teamQueue.map((entry) => renderEntry(entry, true))}</ul>
        </section>
      )}

      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {PIPELINE_STAGES.map((stage) => {
          const entries = pipeline
            .filter((entry) => entry.status === stage)
            .sort((a, b) => b.waitingDays - a.waitingDays);
          return (
            <section key={stage} className="rounded-2xl border border-neutral-200 bg-off-white p-4" aria-label={tStatus(stage)}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-bold text-navy">{tStatus(stage)}</h2>
                <Badge variant="neutral">{entries.length}</Badge>
              </div>
              {entries.length === 0 ? (
                <p className="mt-3 text-sm text-slate">{t("emptyStage")}</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">{entries.map((entry) => renderEntry(entry, false))}</ul>
              )}
            </section>
          );
        })}
      </div>
    </DashboardShell>
  );
}
