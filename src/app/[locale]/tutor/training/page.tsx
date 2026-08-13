import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { TrainingModuleCard } from "@/components/dashboard/TrainingModuleCard";
import { tutorNavItems } from "@/lib/tutorNav";

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

  return (
    <DashboardShell navItems={tutorNavItems(tNav)} userName={user.name ?? ""}>
      <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
      <p className="mt-2 max-w-xl text-slate">{t("subtitle")}</p>

      {modules.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center text-slate">
          {t("empty")}
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-4">
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
      )}
    </DashboardShell>
  );
}
