import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { TutorExamForm } from "@/components/dashboard/TutorExamForm";
import { PLATFORM_EXAM_QUESTIONS } from "@/lib/exam/examQuestions";
import { tutorNavItems } from "@/lib/tutorNav";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { Surface } from "@/components/ui/Surface";

export default async function TutorExamPage({
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

  const t = await getTranslations({ locale, namespace: "tutorExam" });
  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });

  const tutorProfile = await db.tutorProfile.findUnique({ where: { userId: user.id } });
  if (!tutorProfile) {
    redirect({ href: "/tutor/dashboard", locale });
    return;
  }

  const [previousAttempts, latestAttempt] = await Promise.all([
    db.tutorExamAttempt.count({ where: { tutorProfileId: tutorProfile.id } }),
    db.tutorExamAttempt.findFirst({
      where: { tutorProfileId: tutorProfile.id, submittedAt: { not: null } },
      select: { score: true, passed: true, attemptNumber: true },
      orderBy: { attemptNumber: "desc" },
    }),
  ]);

  return (
    <DashboardShell navItems={tutorNavItems(tNav, tutorProfile.applicationStatus)} userName={user.name ?? ""}>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        eyebrow={t("eyebrow")}
        status={latestAttempt && <Badge variant={latestAttempt.passed ? "mint" : "outline"}>{latestAttempt.passed ? t("latestPassed") : t("latestNotPassed")}</Badge>}
      />
      {latestAttempt && (
        <Alert tone={latestAttempt.passed ? "success" : "info"} title={t("latestAttemptTitle", { number: latestAttempt.attemptNumber })} className="mt-8 max-w-3xl">
          {t("latestAttemptScore", { score: latestAttempt.score })}
        </Alert>
      )}

      <Surface className="mt-6 max-w-3xl" padding="lg" aria-labelledby="exam-form-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="exam-form-title" className="text-lg font-extrabold text-text-primary">{t("formTitle")}</h2>
            <p className="mt-1 text-sm text-text-secondary">{t("formDescription")}</p>
          </div>
          {previousAttempts > 0 && <p className="text-sm font-semibold text-text-secondary">{t("previousAttempts", { count: previousAttempts })}</p>}
        </div>
        <div className="mt-6">
        <TutorExamForm questions={PLATFORM_EXAM_QUESTIONS} />
        </div>
      </Surface>
    </DashboardShell>
  );
}
