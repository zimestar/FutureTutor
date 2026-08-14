import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { tutorNavItems } from "@/lib/tutorNav";
import { startStripeOnboardingAction } from "@/lib/actions/stripeConnect";
import { syncTutorConnectStatusFromStripe } from "@/services/stripeConnect";
import { paymentsAreLive } from "@/lib/paymentMode";

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

  let tutorProfile = await db.tutorProfile.findUnique({ where: { userId: user.id } });

  // Returning from Stripe onboarding — re-sync status from Stripe before
  // rendering, rather than waiting for the next account.updated webhook.
  if (tutorProfile?.stripeConnectAccountId && onboarding === "return" && paymentsAreLive()) {
    await syncTutorConnectStatusFromStripe(tutorProfile.id).catch(() => {});
    tutorProfile = await db.tutorProfile.findUnique({ where: { userId: user.id } });
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
  const currencyFormatter = new Intl.NumberFormat(locale, { style: "currency", currency: "CAD" });

  return (
    <DashboardShell navItems={tutorNavItems(tNav)} userName={user.name ?? ""}>
      <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
      <p className="mt-2 max-w-xl text-slate">{t("description")}</p>

      <section className="mt-8 rounded-xl border border-neutral-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-navy">{t("stripeStatusTitle")}</p>
            <div className="mt-1">
              <Badge variant={STATUS_BADGE[status] ?? "outline"}>{t(`stripeStatus.${status}`)}</Badge>
            </div>
          </div>
          {status !== "ACTIVE" && status !== "DISABLED" && (
            <form action={startStripeOnboardingAction}>
              <input type="hidden" name="locale" value={locale} />
              <button
                type="submit"
                data-testid="start-stripe-onboarding"
                className="h-11 rounded-md bg-blue px-5 text-sm font-bold text-white transition-colors hover:bg-blue/90"
              >
                {status === "NOT_STARTED" ? t("setUpPayoutsCta") : t("continueSetupCta")}
              </button>
            </form>
          )}
        </div>
        {onboarding === "error" && <p className="mt-3 text-sm font-semibold text-error">{t("onboardingError")}</p>}
        {!paymentsAreLive() && <p className="mt-3 text-sm text-slate">{t("devModeNotice")}</p>}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold text-navy">{t("earningsTitle")}</h2>
        {earnings.length === 0 ? (
          <p className="text-sm text-slate">{t("earningsEmpty")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {earnings.map((earning) => (
              <div key={earning.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white p-3 text-sm">
                <span className="font-semibold text-navy">
                  {tSubjects(earning.booking.subject.slug)} — {new Date(earning.booking.startAt).toLocaleDateString(locale)}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-navy">{currencyFormatter.format(earning.amountCents / 100)}</span>
                  <Badge variant={earning.status === "TRANSFERRED" ? "mint" : "outline"}>{t(`earningStatus.${earning.status}`)}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold text-navy">{t("transfersTitle")}</h2>
        {transfers.length === 0 ? (
          <p className="text-sm text-slate">{t("transfersEmpty")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {transfers.map((transfer) => (
              <div key={transfer.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white p-3 text-sm">
                <span className="text-navy">{new Date(transfer.createdAt).toLocaleDateString(locale)}</span>
                <div className="flex items-center gap-3">
                  <span className="text-navy">{currencyFormatter.format(transfer.amountCents / 100)}</span>
                  <Badge variant={transfer.status === "COMPLETED" ? "mint" : "outline"}>{t(`transferStatus.${transfer.status}`)}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
