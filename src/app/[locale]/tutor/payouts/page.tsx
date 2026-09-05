import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { tutorNavItems } from "@/lib/tutorNav";
import { startStripeOnboardingAction } from "@/lib/actions/stripeConnect";
import { syncTutorConnectStatusFromStripe, shouldResyncStripeConnectStatus } from "@/services/stripeConnect";
import { paymentsUseStripe } from "@/lib/paymentMode";
import { stripeConnectOnboardingAvailable } from "@/lib/stripeConnectConfig";
import { formatBookingTime } from "@/lib/utils";
import { EmptyState } from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { Surface } from "@/components/ui/Surface";
import { StripeOnboardingSubmitButton } from "@/components/dashboard/StripeOnboardingSubmitButton";
import { TutorEarningCard } from "@/components/dashboard/TutorEarningCard";
import { presentTutorEarningTransparency, type TutorEarningSessionFacts } from "@/lib/tutorEarningPresentation";
import { reconstructNoShowOutcome } from "@/services/sessionLifecycle";

const STATUS_BADGE: Record<string, "mint" | "outline" | "blue" | "neutral"> = {
  NOT_STARTED: "outline",
  PENDING: "blue",
  RESTRICTED: "outline",
  ACTIVE: "mint",
  DISABLED: "outline",
};

export default async function TutorPayoutsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ onboarding?: string }>;
}) {
  const { locale } = await params;
  const { onboarding } = await searchParams;
  setRequestLocale(locale);

  const session = await auth();
  const user = session?.user;
  if (!user || user.role !== "TUTOR") {
    redirect({ href: "/login", locale });
    return;
  }

  const t = await getTranslations({ locale, namespace: "tutorPayouts" });
  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });
  const tSubjects = await getTranslations({ locale, namespace: "subjects.items" });

  let tutorProfile = await db.tutorProfile.findUnique({
    where: { userId: user.id },
    include: { user: { select: { image: true } } },
  });

  // Returning from Stripe onboarding, OR the local status is still
  // unsettled (PROD-CONNECT-SYNCFIX1 — defense-in-depth against a missed
  // or delayed account.updated webhook) — re-sync status from Stripe
  // before rendering, rather than relying solely on the webhook.
  if (
    tutorProfile?.stripeConnectAccountId &&
    shouldResyncStripeConnectStatus(tutorProfile.stripeConnectStatus, onboarding) &&
    paymentsUseStripe()
  ) {
    await syncTutorConnectStatusFromStripe(tutorProfile.id).catch(() => {});
    tutorProfile = await db.tutorProfile.findUnique({
      where: { userId: user.id },
      include: { user: { select: { image: true } } },
    });
  }

  const [earnings, transfers] = tutorProfile
    ? await Promise.all([
        db.tutorEarning.findMany({
          where: { tutorProfileId: tutorProfile.id },
          include: {
            booking: {
              select: {
                id: true,
                subject: { select: { slug: true } },
                startAt: true,
                timezone: true,
                session: {
                  select: {
                    status: true,
                    completedAt: true,
                    noShowConvergedAt: true,
                    attendanceEvents: {
                      where: { eventType: "CHECK_IN" },
                      select: { participantRole: true },
                    },
                  },
                },
              },
            },
            transfer: { select: { completedAt: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 25,
        }),
        db.tutorTransfer.findMany({
          where: { tutorProfileId: tutorProfile.id },
          orderBy: { createdAt: "desc" },
          take: 25,
        }),
      ])
    : [[], []];

  const status = tutorProfile?.stripeConnectStatus ?? "NOT_STARTED";
  // BETA-LAUNCHFIX1 — server-computed, never trusted from the client. When
  // false, the actionable CTA below is not rendered at all (hiding the
  // button is a UX courtesy here, not the security boundary — the real
  // boundary is startStripeOnboardingAction's + ensureConnectAccount's own
  // checks, which hold even if this render were somehow bypassed).
  const connectAvailable = stripeConnectOnboardingAvailable();
  const setupNotStarted = status !== "ACTIVE" && status !== "DISABLED";
  const eligibilityDateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  return (
    <DashboardShell navItems={tutorNavItems(tNav, tutorProfile?.applicationStatus ?? "DRAFT")} userName={user.name ?? ""} userImage={tutorProfile?.user.image}>
      <PageHeader
        title={t("title")}
        description={t("description")}
        eyebrow={t("eyebrow")}
        status={<Badge variant={STATUS_BADGE[status] ?? "outline"}>{t(`stripeStatus.${status}`)}</Badge>}
      />

      <Surface className="mt-8" aria-labelledby="payout-setup-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="payout-setup-title" className="font-extrabold text-navy">{t("stripeStatusTitle")}</h2>
            <p className="mt-1 text-sm text-text-secondary">{t("stripeStatusDescription")}</p>
            <div className="mt-1">
              <Badge variant={STATUS_BADGE[status] ?? "outline"}>{t(`stripeStatus.${status}`)}</Badge>
            </div>
          </div>
          {setupNotStarted && connectAvailable && (
            <form action={startStripeOnboardingAction}>
              <input type="hidden" name="locale" value={locale} />
              <StripeOnboardingSubmitButton
                label={status === "NOT_STARTED" ? t("setUpPayoutsCta") : t("continueSetupCta")}
                pendingLabel={t("onboardingPending")}
              />
            </form>
          )}
        </div>
        {setupNotStarted && !connectAvailable && (
          <p className="mt-3 text-sm text-slate" data-testid="connect-unavailable-notice">
            {t("connectUnavailableNotice")}
          </p>
        )}
        {onboarding === "error" && <p className="mt-3 text-sm font-semibold text-error">{t("onboardingError")}</p>}
        {!paymentsUseStripe() && <p className="mt-3 text-sm text-slate">{t("devModeNotice")}</p>}
      </Surface>

      <Surface className="mt-8" padding="sm" aria-labelledby="payout-transparency-title">
        <h2 id="payout-transparency-title" className="font-extrabold text-navy">{t("transparency.title")}</h2>
        <ul className="mt-2 flex flex-col gap-1.5 text-sm text-text-secondary">
          <li>{t("transparency.intro")}</li>
          <li>{t("transparency.delay")}</li>
          <li>{t("transparency.eligibilityVsPayout")}</li>
          <li>{t("transparency.transferVsBank")}</li>
        </ul>
      </Surface>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold text-navy">{t("earningsTitle")}</h2>
        {earnings.length === 0 ? (
          <EmptyState title={t("earningsEmptyTitle")} description={t("earningsEmpty")} />
        ) : (
          <div className="flex flex-col gap-2">
            {earnings.map((earning) => {
              const sessionRow = earning.booking.session;
              const sessionFacts: TutorEarningSessionFacts | null = sessionRow
                ? {
                    sessionStatus: sessionRow.status,
                    completedAt: sessionRow.completedAt,
                    noShowConvergedAt: sessionRow.noShowConvergedAt,
                    noShowOutcome:
                      sessionRow.status === "NO_SHOW"
                        ? reconstructNoShowOutcome(
                            sessionRow.attendanceEvents.some((e) => e.participantRole === "TUTOR"),
                            sessionRow.attendanceEvents.some((e) => e.participantRole === "STUDENT")
                          )
                        : null,
                  }
                : null;
              const transparency = presentTutorEarningTransparency(earning, sessionFacts, earning.transfer);
              const earningCurrencyFormatter = new Intl.NumberFormat(locale, { style: "currency", currency: earning.currency });

              return (
                <TutorEarningCard
                  key={earning.id}
                  amountLabel={earningCurrencyFormatter.format(earning.amountCents / 100)}
                  subjectLabel={tSubjects(earning.booking.subject.slug)}
                  sessionDateLabel={formatBookingTime(earning.booking.startAt, earning.booking.timezone, locale)}
                  bookingId={earning.booking.id}
                  viewSessionLabel={t("viewSession")}
                  reasonLabel={t(`earningPresentation.${transparency.key}.label`)}
                  reasonDescription={t(`earningPresentation.${transparency.key}.description`)}
                  badgeVariant={transparency.badgeVariant}
                  eligibilityDateLabel={
                    transparency.eligibilityDate
                      ? t(
                          transparency.eligibilityDateIsExpected
                            ? "earningPresentation.pendingEligibilityExpected.expectedEligibleAt"
                            : "earningPresentation.pendingEligibility.eligibleAt",
                          { date: eligibilityDateFormatter.format(transparency.eligibilityDate) }
                        )
                      : null
                  }
                  transferDateLabel={
                    transparency.transferDate
                      ? t("earningPresentation.transferred.transferredOn", { date: eligibilityDateFormatter.format(transparency.transferDate) })
                      : null
                  }
                />
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold text-navy">{t("transfersTitle")}</h2>
        {transfers.length === 0 ? (
          <EmptyState title={t("transfersEmptyTitle")} description={t("transfersEmpty")} />
        ) : (
          <div className="flex flex-col gap-2">
            {transfers.map((transfer) => (
              <Surface key={transfer.id} padding="sm" className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="text-navy">{new Date(transfer.createdAt).toLocaleDateString(locale)}</span>
                <div className="flex items-center gap-3">
                  <span className="text-navy">{new Intl.NumberFormat(locale, { style: "currency", currency: transfer.currency }).format(transfer.amountCents / 100)}</span>
                  <Badge variant={transfer.status === "COMPLETED" ? "mint" : "outline"}>{t(`transferStatus.${transfer.status}`)}</Badge>
                </div>
              </Surface>
            ))}
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
