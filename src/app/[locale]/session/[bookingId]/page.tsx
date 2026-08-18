import { CalendarDays, CheckCircle2, Clock3, MapPin, Monitor, UsersRound } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SessionCheckInPanel } from "@/components/session/SessionCheckInPanel";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { Surface } from "@/components/ui/Surface";
import { db } from "@/lib/db";
import { getStudentDashboardNavItems } from "@/lib/dashboardNav";
import { tutorNavItems } from "@/lib/tutorNav";
import { deriveSessionArrivalPresentation } from "@/lib/sessionPresentation";
import {
  getSessionContext,
  SessionNotFoundError,
  SessionViewerNotAuthorizedError,
} from "@/services/sessionLifecycle";

export default async function SessionPage({ params }: { params: Promise<{ locale: string; bookingId: string }> }) {
  const { locale, bookingId } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) {
    redirect({ href: "/login", locale });
    return;
  }

  const t = await getTranslations({ locale, namespace: "sessionExperience" });
  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });
  const tSubjects = await getTranslations({ locale, namespace: "subjects.items" });
  const tMode = await getTranslations({ locale, namespace: "quickMatch.mode" });

  if (session.user.role !== "TUTOR" && session.user.role !== "STUDENT" && session.user.role !== "PARENT") {
    return <AccessDenied title={t("access.title")} description={t("access.description")} />;
  }

  const navItems = session.user.role === "TUTOR"
    ? tutorNavItems(
        tNav,
        (await db.tutorProfile.findUnique({ where: { userId: session.user.id }, select: { applicationStatus: true } }))?.applicationStatus ?? "DRAFT",
      )
    : getStudentDashboardNavItems(tNav, session.user.role);

  const freshUser = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  if (!freshUser) return <AccessDenied title={t("access.title")} description={t("access.description")} />;

  let context = null;
  let accessDenied = false;
  try {
    context = await getSessionContext(bookingId, session.user.id, freshUser.role);
  } catch (error) {
    if (error instanceof SessionNotFoundError || error instanceof SessionViewerNotAuthorizedError) {
      accessDenied = true;
    } else {
      throw error;
    }
  }

  if (accessDenied || !context) {
    return (
      <DashboardShell navItems={navItems} userName={session.user.name ?? ""}>
        <PageHeader title={t("access.title")} description={t("access.description")} />
      </DashboardShell>
    );
  }

  const presentation = deriveSessionArrivalPresentation({
    status: context.status,
    now: new Date(),
    checkInWindowOpensAt: context.checkInWindowOpensAt,
    tutorPresenceRecorded: context.tutorPresenceRecorded,
    studentPresenceRecorded: context.studentPresenceRecorded,
  });
  const dateTime = (value: Date) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: context.timezone }).format(value);
  const time = (value: Date) => new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone: context.timezone }).format(value);
  const statusTone = presentation === "inProgress" ? "success" : presentation.startsWith("waiting") ? "pending" : "info";

  return (
    <DashboardShell navItems={navItems} userName={session.user.name ?? ""}>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={tSubjects(context.subjectSlug)}
        description={t("subtitle", { name: context.representedLearner.firstName })}
        status={<Badge variant={presentation === "inProgress" ? "mint" : "blue"}>{t(`states.${presentation}.label`)}</Badge>}
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <div className="space-y-6">
          <Alert tone={statusTone} title={t(`states.${presentation}.title`)}>
            <p>{t(`states.${presentation}.description`, { opensAt: dateTime(context.checkInWindowOpensAt), endTime: time(context.scheduledEndAt) })}</p>
          </Alert>

          {presentation !== "inProgress" && presentation !== "unavailable" && (
            <Surface aria-labelledby="presence-title">
              <div className="flex items-center gap-3"><UsersRound className="size-5 text-blue" aria-hidden="true" /><h2 id="presence-title" className="text-lg font-extrabold text-text-primary">{t("presence.title")}</h2></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <PresenceRow label={t("presence.tutor")} present={context.tutorPresenceRecorded} presentLabel={t("presence.present")} waitingLabel={t("presence.notYetRecorded")} />
                <PresenceRow label={context.representedLearner.firstName} present={context.studentPresenceRecorded} presentLabel={t("presence.present")} waitingLabel={t("presence.notYetRecorded")} />
              </div>
              {context.studentPresenceRecordedBy && (
                <p className="mt-4 text-xs font-semibold text-text-muted">{t(`presence.recordedBy.${context.studentPresenceRecordedBy}`, { name: context.representedLearner.firstName })}</p>
              )}
            </Surface>
          )}

          {context.allowedActions.length > 0 && (
            <Surface>
              <SessionCheckInPanel bookingId={context.bookingId} locale={locale} learnerFirstName={context.representedLearner.firstName} viewerRole={context.viewerRole} allowedActions={context.allowedActions} />
            </Surface>
          )}

          {presentation === "inProgress" && (
            <Surface className="border-success/30 bg-success-light/40" aria-labelledby="started-title">
              <div className="flex items-center gap-3"><CheckCircle2 className="size-6 text-success" aria-hidden="true" /><h2 id="started-title" className="text-xl font-extrabold text-text-primary">{t("started.title")}</h2></div>
              <p className="mt-3 text-sm leading-6 text-text-secondary">{t("started.description", { startedAt: context.startedAt ? time(context.startedAt) : t("started.timeUnavailable"), endTime: time(context.scheduledEndAt) })}</p>
            </Surface>
          )}
        </div>

        <Surface className="h-fit" aria-labelledby="details-title">
          <h2 id="details-title" className="text-lg font-extrabold text-text-primary">{t("details.title")}</h2>
          <dl className="mt-5 space-y-5 text-sm">
            <Detail icon={CalendarDays} label={t("details.scheduledStart")} value={dateTime(context.scheduledStartAt)} />
            <Detail icon={Clock3} label={t("details.scheduledEnd")} value={dateTime(context.scheduledEndAt)} />
            <Detail icon={context.mode === "ONLINE" ? Monitor : MapPin} label={t("details.mode")} value={tMode(context.mode)} />
          </dl>
          <p className="mt-5 rounded-lg bg-surface-subtle p-3 text-xs leading-5 text-text-secondary">{context.mode === "ONLINE" ? t("mode.online") : t("mode.inPerson")}</p>
        </Surface>
      </div>
    </DashboardShell>
  );
}

function PresenceRow({ label, present, presentLabel, waitingLabel }: { label: string; present: boolean; presentLabel: string; waitingLabel: string }) {
  return <div className="rounded-lg border border-border bg-surface-subtle p-4"><p className="font-bold text-text-primary">{label}</p><p className="mt-1 text-sm text-text-secondary">{present ? presentLabel : waitingLabel}</p></div>;
}

function Detail({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  return <div className="flex gap-3"><Icon className="mt-0.5 size-5 shrink-0 text-blue" aria-hidden="true" /><div><dt className="font-bold text-text-primary">{label}</dt><dd className="mt-0.5 text-text-secondary">{value}</dd></div></div>;
}

function AccessDenied({ title, description }: { title: string; description: string }) {
  return <main className="mx-auto min-h-screen max-w-2xl px-5 py-16"><PageHeader title={title} description={description} /></main>;
}
