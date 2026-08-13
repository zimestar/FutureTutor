import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { TutorExamForm } from "@/components/dashboard/TutorExamForm";
import { PLATFORM_EXAM_QUESTIONS } from "@/lib/exam/examQuestions";
import { tutorNavItems } from "@/lib/tutorNav";

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

  const previousAttempts = await db.tutorExamAttempt.count({ where: { tutorProfileId: tutorProfile.id } });

  return (
    <DashboardShell navItems={tutorNavItems(tNav)} userName={user.name ?? ""}>
      <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
      <p className="mt-2 max-w-xl text-slate">{t("subtitle")}</p>
      {previousAttempts > 0 && (
        <p className="mt-2 text-sm text-slate">{t("previousAttempts", { count: previousAttempts })}</p>
      )}

      <div className="mt-8 max-w-2xl">
        <TutorExamForm questions={PLATFORM_EXAM_QUESTIONS} />
      </div>
    </DashboardShell>
  );
}
