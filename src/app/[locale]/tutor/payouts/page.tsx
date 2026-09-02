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
import { EmptyState } from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { Surface } from "@/components/ui/Surface";
import { TutorEarningStatus } from "@/components/dashboard/TutorEarningStatus";
import { StripeOnboardingSubmitButton } from "@/components/dashboard/StripeOnboardingSubmitButton";
import { presentTutorEarning } from "@/lib/tutorEarningPresentation";

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
          include: { booking: { select: { subject: { select: { slug: true } }, startAt: true } } },
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
  const currencyFormatter = new Intl.NumberFormat(locale, { style: "currency", currency: "CAD" });
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

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold text-navy">{t("earningsTitle")}</h2>
        {earnings.length === 0 ? (
          <EmptyState title={t("earningsEmptyTitle")} description={t("earningsEmpty")} />
        ) : (
          <div className="flex flex-col gap-2">
            {earnings.map((earning) => {
              const presentation = presentTutorEarning(earning.status, earning.eligibleAt);
              return (
                <Surface key={earning.id} padding="sm" className="flex flex-col gap-4 text-sm sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold text-navy">
                      {tSubjects(earning.booking.subject.slug)} — {new Date(earning.booking.startAt).toLocaleDateString(locale)}
                    </p>
                    <p className="mt-1 text-base font-bold text-navy">{currencyFormatter.format(earning.amountCents / 100)}</p>
                  </div>
                  <TutorEarningStatus
                    presentation={presentation}
                    label={t(`earningPresentation.${presentation.key}.label`)}
                    description={t(`earningPresentation.${presentation.key}.description`)}
                    eligibilityDateLabel={presentation.showEligibilityDate && earning.eligibleAt
                      ? t("earningPresentation.pendingEligibility.eligibleAt", { date: eligibilityDateFormatter.format(earning.eligibleAt) })
                      : undefined}
                  />
                </Surface>
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
                  <span className="text-navy">{currencyFormatter.format(transfer.amountCents / 100)}</span>
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
