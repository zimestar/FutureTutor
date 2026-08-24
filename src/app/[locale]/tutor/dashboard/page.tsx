import { CalendarDays, Clock3, Sparkles, UserRound, WalletCards } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { TutorApprovalJourney } from "@/components/dashboard/TutorApprovalJourney";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { Surface } from "@/components/ui/Surface";
import { tutorNavItems } from "@/lib/tutorNav";
import { formatBookingTime } from "@/lib/utils";
import { getTutorExperience, TUTOR_JOURNEY_STEPS } from "@/lib/tutorExperience";
import type { TutorApplicationStatus } from "@/generated/prisma/enums";

const statusBadgeVariant = (status: TutorApplicationStatus) =>
  status === "APPROVED" ? "mint" : status === "REJECTED" || status === "SUSPENDED" ? "outline" : "blue";

export default async function TutorDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
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
  const tBookingStatus = await getTranslations({ locale, namespace: "booking.status" });
  const tSubjects = await getTranslations({ locale, namespace: "subjects.items" });
  const tMode = await getTranslations({ locale, namespace: "quickMatch.mode" });
  const tPayouts = await getTranslations({ locale, namespace: "tutorPayouts" });

  const tutorProfile = await db.tutorProfile.findUnique({
    where: { userId: user.id },
    select: { id: true, applicationStatus: true, user: { select: { image: true } } },
  });
  const status = tutorProfile?.applicationStatus ?? "DRAFT";
  const userImage = tutorProfile?.user.image;

  if (status !== "APPROVED") {
    const experience = getTutorExperience(status);
    const stateKey = `experience.states.${status}` as const;

    return (
      <DashboardShell navItems={tutorNavItems(tNav, status)} userName={user.name ?? ""} userImage={userImage}>
        <PageHeader
          eyebrow={t("experience.modeApproval")}
          title={t(`${stateKey}.title`)}
          description={t(`${stateKey}.description`)}
          status={<Badge variant={statusBadgeVariant(status)}>{t(`applicationStatus.${status}`)}</Badge>}
        />

        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)]">
          <div className="space-y-6">
            <Alert tone={experience.tone} title={t(`${stateKey}.actionTitle`)}>
              <p>{t(`${stateKey}.actionDescription`)}</p>
              {experience.nextActionHref && (
                <Button href={experience.nextActionHref} size="sm" className="mt-4">
                  {t(`${stateKey}.actionCta`)}
                </Button>
              )}
            </Alert>

            <Surface>
              <TutorApprovalJourney
                title={t("experience.journeyTitle")}
                label={t("experience.journeyLabel")}
                items={TUTOR_JOURNEY_STEPS.map((step) => {
                  const journeyState = experience.journey[step];
                  const isAction = journeyState === "needsAction" && experience.nextActionHref === `/tutor/${step}`;
                  return {
                    id: step,
                    label: t(`lifecycle.steps.${step}`),
                    description: t(`experience.journeySteps.${step}`),
                    state: journeyState,
                    stateLabel: t(`experience.journeyStates.${journeyState}`),
                    action: isAction
                      ? { href: experience.nextActionHref!, label: t(`${stateKey}.actionCta`) }
                      : undefined,
                  };
                })}
              />
            </Surface>
          </div>

          <Surface className="h-fit" aria-labelledby="what-happens-next-title">
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-blue">
              {t(`experience.responsible.${experience.responsibleParty}`)}
            </p>
            <h2 id="what-happens-next-title" className="mt-2 text-lg font-extrabold text-text-primary">
              {t("experience.whatNextTitle")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">{t(`${stateKey}.whatNext`)}</p>
          </Surface>
        </div>
      </DashboardShell>
    );
  }

  const now = new Date();
  const [nextBooking, pendingOpportunityCount, availabilityDays, latestEarning] = tutorProfile
    ? await Promise.all([
        db.booking.findFirst({
          where: { tutorProfileId: tutorProfile.id, endAt: { gte: now } },
          select: {
            startAt: true,
            timezone: true,
            mode: true,
            status: true,
            studentProfile: { select: { firstName: true } },
            subject: { select: { slug: true } },
          },
          orderBy: { startAt: "asc" },
        }),
        db.tutorInvitation.count({ where: { tutorProfileId: tutorProfile.id, status: "PENDING" } }),
        db.tutorAvailability.count({ where: { tutorProfileId: tutorProfile.id } }),
        db.tutorEarning.findFirst({
          where: { tutorProfileId: tutorProfile.id },
          select: {
            amountCents: true,
            currency: true,
            status: true,
            booking: { select: { startAt: true, subject: { select: { slug: true } } } },
          },
          orderBy: { createdAt: "desc" },
        }),
      ])
    : [null, 0, 0, null];

  const latestEarningAmount = latestEarning
    ? new Intl.NumberFormat(locale, { style: "currency", currency: latestEarning.currency }).format(
        latestEarning.amountCents / 100,
      )
    : null;

  return (
    <DashboardShell navItems={tutorNavItems(tNav, status)} userName={user.name ?? ""} userImage={userImage}>
      <PageHeader
        eyebrow={t("experience.modeTutoring")}
        title={t("approved.title", { name: user.name?.split(" ")[0] ?? "" })}
        description={t("approved.description")}
        status={<Badge variant="mint">{t("applicationStatus.APPROVED")}</Badge>}
      />

      <div className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <Surface className="xl:row-span-2" aria-labelledby="next-booking-title">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-blue/10 text-blue">
              <CalendarDays className="size-5" aria-hidden="true" />
            </span>
            <h2 id="next-booking-title" className="text-lg font-extrabold text-text-primary">
              {t("approved.nextBookingTitle")}
            </h2>
          </div>
          {nextBooking ? (
            <div className="mt-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xl font-extrabold text-text-primary">{tSubjects(nextBooking.subject.slug)}</p>
                  <p className="mt-1 text-sm text-text-secondary">
                    {t("approved.withStudent", { name: nextBooking.studentProfile.firstName })}
                  </p>
                </div>
                <Badge variant={nextBooking.status === "CONFIRMED" ? "mint" : "outline"}>
                  {tBookingStatus(nextBooking.status)}
                </Badge>
              </div>
              <dl className="mt-5 grid gap-4 rounded-lg bg-surface-subtle p-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-text-muted">{t("approved.when")}</dt>
                  <dd className="mt-1 text-sm font-semibold text-text-primary">
                    {formatBookingTime(nextBooking.startAt, nextBooking.timezone, locale)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-text-muted">{t("approved.mode")}</dt>
                  <dd className="mt-1 text-sm font-semibold text-text-primary">{tMode(nextBooking.mode)}</dd>
                </div>
              </dl>
              <Button href="/tutor/bookings" variant="outline" size="sm" className="mt-5">
                {t("approved.viewBookings")}
              </Button>
            </div>
          ) : (
            <div className="mt-5 rounded-lg border border-dashed border-border-strong p-6">
              <p className="font-bold text-text-primary">{t("approved.noBookingTitle")}</p>
              <p className="mt-1 text-sm leading-6 text-text-secondary">{t("approved.noBookingDescription")}</p>
              <Button href="/tutor/bookings" variant="outline" size="sm" className="mt-4">
                {t("approved.viewBookings")}
              </Button>
            </div>
          )}
        </Surface>

        <Surface aria-labelledby="quick-match-summary-title">
          <div className="flex items-center gap-3">
            <Sparkles className="size-5 text-blue" aria-hidden="true" />
            <h2 id="quick-match-summary-title" className="font-extrabold text-text-primary">{t("approved.quickMatchTitle")}</h2>
          </div>
          <p className="mt-3 text-3xl font-extrabold text-text-primary">{pendingOpportunityCount}</p>
          <p className="mt-1 text-sm text-text-secondary">{t("approved.quickMatchCount", { count: pendingOpportunityCount })}</p>
          <Button href="/tutor/quick-match" variant="outline" size="sm" className="mt-4">{t("approved.openQuickMatch")}</Button>
        </Surface>

        <Surface aria-labelledby="availability-summary-title">
          <div className="flex items-center gap-3">
            <Clock3 className="size-5 text-blue" aria-hidden="true" />
            <h2 id="availability-summary-title" className="font-extrabold text-text-primary">{t("approved.availabilityTitle")}</h2>
          </div>
          <p className="mt-3 font-bold text-text-primary">
            {availabilityDays > 0 ? t("approved.availabilityConfigured", { count: availabilityDays }) : t("approved.availabilityEmpty")}
          </p>
          <Button href="/tutor/availability" variant="outline" size="sm" className="mt-4">{t("approved.manageAvailability")}</Button>
        </Surface>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Surface aria-labelledby="earnings-summary-title">
          <div className="flex items-center gap-3">
            <WalletCards className="size-5 text-blue" aria-hidden="true" />
            <h2 id="earnings-summary-title" className="font-extrabold text-text-primary">{t("approved.earningsTitle")}</h2>
          </div>
          {latestEarning ? (
            <div className="mt-3">
              <p className="text-2xl font-extrabold text-text-primary">{latestEarningAmount}</p>
              <p className="mt-1 text-sm text-text-secondary">
                {t("approved.latestEarning", {
                  subject: tSubjects(latestEarning.booking.subject.slug),
                  date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(latestEarning.booking.startAt),
                })}
              </p>
              <Badge className="mt-3" variant={latestEarning.status === "TRANSFERRED" ? "mint" : "outline"}>
                {tPayouts(`earningStatus.${latestEarning.status}`)}
              </Badge>
            </div>
          ) : <p className="mt-3 text-sm leading-6 text-text-secondary">{t("approved.noEarnings")}</p>}
          <Button href="/tutor/payouts" variant="outline" size="sm" className="mt-4">{t("approved.viewPayouts")}</Button>
        </Surface>

        <Surface aria-labelledby="profile-summary-title">
          <div className="flex items-center gap-3">
            <UserRound className="size-5 text-blue" aria-hidden="true" />
            <h2 id="profile-summary-title" className="font-extrabold text-text-primary">{t("approved.profileTitle")}</h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-text-secondary">{t("approved.profileDescription")}</p>
          <Button href="/tutor/profile" variant="outline" size="sm" className="mt-4">{t("approved.manageProfile")}</Button>
        </Surface>
      </div>
    </DashboardShell>
  );
}
