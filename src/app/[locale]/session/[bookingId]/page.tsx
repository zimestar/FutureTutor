import { CalendarDays, CheckCircle2, Clock3, MapPin, Monitor, UsersRound } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SessionCheckInPanel } from "@/components/session/SessionCheckInPanel";
import { SessionGraceCountdown } from "@/components/session/SessionGraceCountdown";
import { SessionCompletionBoundary } from "@/components/session/SessionCompletionBoundary";
import { SessionInterruptionPanel } from "@/components/session/SessionInterruptionPanel";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { Surface } from "@/components/ui/Surface";
import { db } from "@/lib/db";
import { getStudentDashboardNavItems } from "@/lib/dashboardNav";
import { tutorNavItems } from "@/lib/tutorNav";
import { deriveSessionArrivalPresentation, isTerminalNoShowPresentation, noShowCopyKind, sessionStateTranslationKeys, shouldShowSessionCheckIn } from "@/lib/sessionPresentation";
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
    scheduledStartAt: context.scheduledStartAt,
    scheduledEndAt: context.scheduledEndAt,
    graceDeadlineAt: context.graceDeadlineAt,
    tutorPresenceRecorded: context.tutorPresenceRecorded,
    studentPresenceRecorded: context.studentPresenceRecorded,
    noShowOutcome: context.noShowOutcome,
  });
  const dateTime = (value: Date) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: context.timezone }).format(value);
  const time = (value: Date) => new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone: context.timezone }).format(value);
  const terminalNoShow = isTerminalNoShowPresentation(presentation);
  const inGracePeriod = presentation.startsWith("grace");
  const noShowCopy = noShowCopyKind(context.viewerRole, context.noShowOutcome);
  const activeSession = presentation === "inProgress" || presentation === "completionPending";
  const showSessionCheckIn = shouldShowSessionCheckIn(presentation, context.allowedActions);
  const statusTone = presentation === "completed" ? "success" : presentation === "interrupted" || terminalNoShow ? "warning" : presentation.startsWith("waiting") || inGracePeriod || presentation === "deadlinePending" || presentation === "completionPending" ? "pending" : "info";
  const badgeVariant = presentation === "inProgress" || presentation === "completed" ? "mint" : presentation === "interrupted" || terminalNoShow ? "neutral" : "blue";
  const stateKeys = sessionStateTranslationKeys(presentation);

  return (
    <DashboardShell navItems={navItems} userName={session.user.name ?? ""}>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={tSubjects(context.subjectSlug)}
        description={t("subtitle", { name: context.representedLearner.firstName })}
        status={<Badge variant={badgeVariant}>{t(stateKeys.label)}</Badge>}
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <div className="space-y-6">
          {!activeSession && (
            <Alert tone={statusTone} title={t(stateKeys.title)}>
              <p>{terminalNoShow
                ? t(`noShow.${noShowCopy}.description`, { name: context.representedLearner.firstName })
                : t(stateKeys.description, { opensAt: dateTime(context.checkInWindowOpensAt), endTime: time(context.scheduledEndAt), name: context.representedLearner.firstName })}</p>
            </Alert>
          )}

          {(inGracePeriod || presentation === "deadlinePending") && (
            <SessionGraceCountdown bookingId={context.bookingId} locale={locale} graceDeadlineAt={context.graceDeadlineAt.toISOString()} />
          )}

          {!activeSession && presentation !== "completed" && presentation !== "interrupted" && presentation !== "unavailable" && !terminalNoShow && (
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

          {showSessionCheckIn && (
            <Surface>
              <SessionCheckInPanel bookingId={context.bookingId} locale={locale} learnerFirstName={context.representedLearner.firstName} viewerRole={context.viewerRole} allowedActions={context.allowedActions} />
            </Surface>
          )}

          {activeSession && (
            <div className="space-y-5">
              <SessionCompletionBoundary bookingId={context.bookingId} locale={locale} scheduledEndAt={context.scheduledEndAt.toISOString()} startedAtLabel={context.startedAt ? time(context.startedAt) : t("started.timeUnavailable")} scheduledEndLabel={time(context.scheduledEndAt)} />
              {context.allowedActions.includes("REQUEST_INTERRUPTION") && (
                <Surface>
                  <SessionInterruptionPanel bookingId={context.bookingId} locale={locale} learnerFirstName={context.representedLearner.firstName} guardianViewer={context.viewerRole === "GUARDIAN"} />
                </Surface>
              )}
            </div>
          )}
        </div>

        <Surface className="h-fit" aria-labelledby="details-title">
          <h2 id="details-title" className="text-lg font-extrabold text-text-primary">{t("details.title")}</h2>
          <dl className="mt-5 space-y-5 text-sm">
            <Detail icon={CalendarDays} label={t("details.scheduledStart")} value={dateTime(context.scheduledStartAt)} />
            <Detail icon={Clock3} label={t("details.scheduledEnd")} value={dateTime(context.scheduledEndAt)} />
            {context.startedAt && <Detail icon={CheckCircle2} label={t("details.startedAt")} value={dateTime(context.startedAt)} />}
            {presentation === "completed" && context.completedAt && <Detail icon={CheckCircle2} label={t("details.completedAt")} value={dateTime(context.completedAt)} />}
            {presentation === "interrupted" && context.endedAt && <Detail icon={Clock3} label={t("details.endedAt")} value={dateTime(context.endedAt)} />}
            {!activeSession && presentation !== "completed" && presentation !== "interrupted" && <Detail icon={Clock3} label={t("details.graceDeadline")} value={dateTime(context.graceDeadlineAt)} />}
            <Detail icon={context.mode === "ONLINE" ? Monitor : MapPin} label={t("details.mode")} value={tMode(context.mode)} />
          </dl>
          {showSessionCheckIn && (
            <p className="mt-5 rounded-lg bg-surface-subtle p-3 text-xs leading-5 text-text-secondary">{context.mode === "ONLINE" ? t("mode.online") : t("mode.inPerson")}</p>
          )}
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
