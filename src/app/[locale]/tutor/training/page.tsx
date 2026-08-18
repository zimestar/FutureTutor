import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { TrainingModuleCard } from "@/components/dashboard/TrainingModuleCard";
import { tutorNavItems } from "@/lib/tutorNav";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { Surface } from "@/components/ui/Surface";

export default async function TutorTrainingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  const user = session?.user;
  if (!user || user.role !== "TUTOR") {
    redirect({ href: "/login", locale });
    return;
  }

  const t = await getTranslations({ locale, namespace: "tutorTraining" });
  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });

  const tutorProfile = await db.tutorProfile.findUnique({ where: { userId: user.id } });
  if (!tutorProfile) {
    redirect({ href: "/tutor/dashboard", locale });
    return;
  }

  const [modules, progress] = await Promise.all([
    db.trainingModule.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.tutorTrainingProgress.findMany({ where: { tutorProfileId: tutorProfile.id } }),
  ]);
  const completedModuleIds = new Set(progress.filter((p) => p.completedAt).map((p) => p.trainingModuleId));
  const remainingCount = Math.max(0, modules.length - completedModuleIds.size);

  return (
    <DashboardShell navItems={tutorNavItems(tNav, tutorProfile.applicationStatus)} userName={user.name ?? ""}>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        eyebrow={t("eyebrow")}
        status={<Badge variant={remainingCount === 0 && modules.length > 0 ? "mint" : "blue"}>{t("remaining", { count: remainingCount })}</Badge>}
      />

      {modules.length === 0 ? (
        <EmptyState className="mt-8" title={t("emptyTitle")} description={t("empty")} />
      ) : (
        <Surface className="mt-8" aria-labelledby="training-modules-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="training-modules-title" className="text-lg font-extrabold text-text-primary">{t("modulesTitle")}</h2>
              <p className="mt-1 text-sm text-text-secondary">{t("modulesDescription")}</p>
            </div>
            <p className="text-sm font-semibold text-text-secondary">{t("completedCount", { complete: completedModuleIds.size, total: modules.length })}</p>
          </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {modules.map((mod) => (
            <TrainingModuleCard
              key={mod.id}
              moduleId={mod.id}
              title={mod.title}
              description={mod.description}
              durationMinutes={mod.durationMinutes}
              completed={completedModuleIds.has(mod.id)}
            />
          ))}
        </div>
        </Surface>
      )}
    </DashboardShell>
  );
}
