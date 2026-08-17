import { ArrowRight, BookOpenCheck, CalendarDays, Heart, Sparkles, UsersRound } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { StudentActivationNotice } from "@/components/dashboard/StudentActivationNotice";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Alert, EmptyState } from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { Surface } from "@/components/ui/Surface";
import {
  listChildrenForGuardian,
  resolveStudentAccountActivationState,
  type GuardianVisibleStudentLoginStatus,
} from "@/services/familyManagement";
import { getStudentDashboardNavItems } from "@/lib/dashboardNav";

const LOGIN_STATUS_BADGE_VARIANT: Record<GuardianVisibleStudentLoginStatus, "mint" | "outline"> = {
  ACTIVE: "mint",
  WAITING_FOR_APPROVAL: "outline",
  INVITED_PENDING: "outline",
  REJECTED_OR_REVOKED: "outline",
  EXPIRED: "outline",
  NO_LOGIN: "outline",
};

function profileFieldsFilled(studentProfile: { academicLevelId: string | null; province: string | null; city: string | null }) {
  return [studentProfile.academicLevelId, studentProfile.province, studentProfile.city].filter(Boolean).length;
}

export default async function StudentDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  const user = session?.user;
  if (!user || (user.role !== "STUDENT" && user.role !== "PARENT")) {
    redirect({ href: "/login", locale });
    return;
  }

  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });
  const navItems = getStudentDashboardNavItems((key) => tNav(key), user.role);
  const firstName = user.name?.split(" ")[0] ?? "";

  if (user.role === "STUDENT") {
    const activationState = await resolveStudentAccountActivationState(db, user.id);
    if (activationState.state !== "ACTIVE") {
      return (
        <DashboardShell navItems={navItems} userName={user.name ?? ""}>
          <StudentActivationNotice state={activationState} />
        </DashboardShell>
      );
    }

    const t = await getTranslations({ locale, namespace: "dashboard.student" });
    return (
      <DashboardShell navItems={navItems} userName={user.name ?? ""}>
        <PageHeader title={t("welcome", { name: firstName })} description={t("description")} />

        <section aria-labelledby="student-help-heading" className="mt-8 overflow-hidden rounded-xl bg-navy px-5 py-6 text-white shadow-surface sm:px-7 sm:py-7">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <div className="flex items-center gap-2 text-mint"><Sparkles className="size-5" aria-hidden="true" /><p className="text-sm font-bold">{t("actions.eyebrow")}</p></div>
              <h2 id="student-help-heading" className="mt-2 text-xl font-bold sm:text-2xl">{t("actions.title")}</h2>
              <p className="mt-2 text-sm leading-6 text-white/70">{t("actions.description")}</p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:flex-row md:w-auto md:shrink-0">
              <Button href="/dashboard/quick-match" size="lg" className="w-full sm:w-auto"><Sparkles className="size-4" aria-hidden="true" />{t("quickMatchCta")}</Button>
              <Button href="/find-tutors" size="lg" variant="ghost-inverse" className="w-full border border-white/25 sm:w-auto">{t("findTutorCta")}</Button>
            </div>
          </div>
        </section>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.65fr)]">
          <section aria-labelledby="student-schedule-heading">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div><h2 id="student-schedule-heading" className="text-xl font-bold text-text-primary">{t("schedule.title")}</h2><p className="mt-1 text-sm text-text-secondary">{t("schedule.description")}</p></div>
              <Button href="/dashboard/bookings" variant="ghost" size="sm" className="shrink-0">{t("schedule.viewCta")}<ArrowRight className="size-4" aria-hidden="true" /></Button>
            </div>
            <EmptyState icon={CalendarDays} title={t("schedule.emptyTitle")} description={t("schedule.emptyDescription")} action={<Button href="/find-tutors" variant="outline">{t("findTutorCta")}</Button>} />
          </section>

          <aside aria-labelledby="student-saved-heading">
            <Surface className="h-full">
              <span className="flex size-10 items-center justify-center rounded-full bg-blue/10 text-blue"><Heart className="size-5" aria-hidden="true" /></span>
              <h2 id="student-saved-heading" className="mt-4 text-lg font-bold text-text-primary">{t("saved.title")}</h2>
              <p className="mt-2 text-sm leading-6 text-text-secondary">{t("saved.description")}</p>
              <Button href="/dashboard/favorites" variant="outline" size="sm" className="mt-5">{t("saved.cta")}</Button>
            </Surface>
          </aside>
        </div>
      </DashboardShell>
    );
  }

  const [t, tLevels, tLoginStatus, children] = await Promise.all([
    getTranslations({ locale, namespace: "dashboard.parent" }),
    getTranslations({ locale, namespace: "gradeLevels" }),
    getTranslations({ locale, namespace: "family.guardianVisibleLoginStatus" }),
    listChildrenForGuardian(db, user.id),
  ]);
  const profilesNeedingAttention = children.filter(({ studentProfile }) => profileFieldsFilled(studentProfile) < 3);

  return (
    <DashboardShell navItems={navItems} userName={user.name ?? ""}>
      <PageHeader
        title={t("welcome", { name: firstName })}
        description={t("description")}
        status={<Badge variant="blue">{t("learnerCount", { count: children.length })}</Badge>}
      />

      <section aria-labelledby="parent-actions-heading" className="mt-8 rounded-xl bg-navy px-5 py-6 text-white shadow-surface sm:px-7">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div><h2 id="parent-actions-heading" className="text-xl font-bold">{t("actions.title")}</h2><p className="mt-1 text-sm leading-6 text-white/70">{t("actions.description")}</p></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Button href="/dashboard/quick-match"><Sparkles className="size-4" aria-hidden="true" />{t("actions.quickMatch")}</Button>
            <Button href="/find-tutors" variant="ghost-inverse" className="border border-white/25">{t("actions.findTutor")}</Button>
            <Button href="/dashboard/family" variant="ghost-inverse" className="border border-white/25"><UsersRound className="size-4" aria-hidden="true" />{t("actions.family")}</Button>
          </div>
        </div>
      </section>

      {profilesNeedingAttention.length > 0 && (
        <Alert tone="warning" title={t("attention.title")} className="mt-6">
          {t("attention.description", { count: profilesNeedingAttention.length })}
        </Alert>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.65fr)]">
        <section aria-labelledby="parent-learners-heading">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div><h2 id="parent-learners-heading" className="text-xl font-bold text-text-primary">{t("learners.title")}</h2><p className="mt-1 text-sm text-text-secondary">{t("learners.description")}</p></div>
            <Button href="/dashboard/family" variant="ghost" size="sm">{t("learners.viewAll")}<ArrowRight className="size-4" aria-hidden="true" /></Button>
          </div>
          {children.length > 0 ? (
            <Surface padding="none" className="divide-y divide-border">
              {children.slice(0, 3).map(({ studentProfile, studentLoginStatus }) => (
                <div key={studentProfile.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0"><p className="truncate font-bold text-text-primary">{studentProfile.firstName} {studentProfile.lastName}</p><p className="mt-1 text-sm text-text-secondary">{studentProfile.academicLevel ? tLevels(studentProfile.academicLevel.slug) : t("learners.noLevel")}</p><div className="mt-2"><Badge variant={LOGIN_STATUS_BADGE_VARIANT[studentLoginStatus]}>{tLoginStatus(studentLoginStatus)}</Badge></div></div>
                  <Button href={`/dashboard/family/${studentProfile.id}`} variant="outline" size="sm" className="w-full sm:w-auto">{t("learners.manage")}</Button>
                </div>
              ))}
            </Surface>
          ) : (
            <EmptyState icon={UsersRound} title={t("learners.emptyTitle")} description={t("learners.emptyDescription")} action={<Button href="/dashboard/family">{t("learners.addCta")}</Button>} />
          )}
        </section>

        <aside aria-labelledby="parent-schedule-heading">
          <Surface className="h-full">
            <span className="flex size-10 items-center justify-center rounded-full bg-blue/10 text-blue"><BookOpenCheck className="size-5" aria-hidden="true" /></span>
            <h2 id="parent-schedule-heading" className="mt-4 text-lg font-bold text-text-primary">{t("schedule.title")}</h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">{t("schedule.description")}</p>
            <Button href="/dashboard/bookings" variant="outline" size="sm" className="mt-5">{t("schedule.cta")}</Button>
          </Surface>
        </aside>
      </div>
    </DashboardShell>
  );
}
