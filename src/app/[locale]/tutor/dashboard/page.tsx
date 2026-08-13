import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { tutorNavItems } from "@/lib/tutorNav";
import type { TutorApplicationStatus } from "@/generated/prisma/enums";

const LIFECYCLE_STEPS = ["profile", "documents", "interview", "training", "exam", "approved"] as const;
type LifecycleStep = (typeof LIFECYCLE_STEPS)[number];

const STEP_COMPLETE_AT: Record<LifecycleStep, TutorApplicationStatus[]> = {
  profile: [
    "SUBMITTED",
    "UNDER_REVIEW",
    "INTERVIEW_REQUIRED",
    "INTERVIEW_COMPLETED",
    "TRAINING_REQUIRED",
    "TRAINING_COMPLETED",
    "EXAM_REQUIRED",
    "EXAM_COMPLETED",
    "FINAL_REVIEW",
    "APPROVED",
  ],
  documents: [
    "INTERVIEW_REQUIRED",
    "INTERVIEW_COMPLETED",
    "TRAINING_REQUIRED",
    "TRAINING_COMPLETED",
    "EXAM_REQUIRED",
    "EXAM_COMPLETED",
    "FINAL_REVIEW",
    "APPROVED",
  ],
  interview: ["TRAINING_REQUIRED", "TRAINING_COMPLETED", "EXAM_REQUIRED", "EXAM_COMPLETED", "FINAL_REVIEW", "APPROVED"],
  training: ["EXAM_REQUIRED", "EXAM_COMPLETED", "FINAL_REVIEW", "APPROVED"],
  exam: ["FINAL_REVIEW", "APPROVED"],
  approved: ["APPROVED"],
};

export default async function TutorDashboardPage({
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

  const t = await getTranslations({ locale, namespace: "dashboard.tutor" });
  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });
  const tStatus = await getTranslations({ locale, namespace: "dashboard.tutor.applicationStatus" });
  const tLifecycle = await getTranslations({ locale, namespace: "dashboard.tutor.lifecycle" });

  const tutorProfile = await db.tutorProfile.findUnique({
    where: { userId: user.id },
    select: { applicationStatus: true, headline: true },
  });

  const status = tutorProfile?.applicationStatus ?? "DRAFT";
  const isIncomplete = !tutorProfile?.headline;
  const isTerminal = status === "APPROVED" || status === "REJECTED" || status === "SUSPENDED";

  return (
    <DashboardShell navItems={tutorNavItems(tNav)} userName={user.name ?? ""}>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-navy">
          {t("welcome", { name: user.name?.split(" ")[0] ?? "" })}
        </h1>
        <Badge variant={status === "APPROVED" ? "mint" : "outline"}>{tStatus(status)}</Badge>
      </div>
      <p className="mt-2 max-w-xl text-slate">{t("description")}</p>

      {!isTerminal && (
        <div className="mt-8 rounded-xl border border-neutral-200 bg-white p-6">
          <p className="mb-4 text-sm font-semibold text-navy">{tLifecycle("title")}</p>
          <ol className="flex flex-wrap gap-3">
            {LIFECYCLE_STEPS.map((step) => {
              const isDone = STEP_COMPLETE_AT[step].includes(status);
              return (
                <li
                  key={step}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${
                    isDone ? "border-success bg-success-light text-success" : "border-neutral-300 text-slate"
                  }`}
                >
                  <span>{isDone ? "✓" : "○"}</span>
                  {tLifecycle(`steps.${step}`)}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <div className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
        <p className="text-lg font-semibold text-navy">
          {isIncomplete ? t("profileIncompleteTitle") : t("profileCompleteTitle")}
        </p>
        <p className="mt-2 text-sm text-slate">
          {isIncomplete ? t("profileIncompleteDescription") : t("profileCompleteDescription")}
        </p>
        <div className="mt-6 flex justify-center">
          <Button href="/tutor/profile">{isIncomplete ? t("completeProfileCta") : t("editProfileCta")}</Button>
        </div>
      </div>
    </DashboardShell>
  );
}
