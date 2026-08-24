import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { ReconcilePaymentButton } from "@/components/dashboard/ReconcilePaymentButton";
import { adminNavItems } from "@/lib/adminNav";

const STATUS_BADGE: Record<string, "mint" | "outline" | "blue" | "neutral"> = {
  PENDING: "outline",
  REQUIRES_ACTION: "blue",
  AUTHORIZED: "blue",
  CAPTURED: "mint",
  CAPTURE_FAILED: "outline",
  FAILED: "outline",
  CANCELLED: "outline",
  PARTIALLY_REFUNDED: "outline",
  REFUNDED: "outline",
};

// A Payment stuck in one of these states past a normal processing window
// is a candidate for the manual reconciliation action.
const RECONCILABLE_STATUSES = new Set(["AUTHORIZED", "PENDING", "REQUIRES_ACTION"]);

export default async function AdminPaymentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  const user = session?.user;
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
    redirect({ href: "/login", locale });
    return;
  }

  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });
  const t = await getTranslations({ locale, namespace: "admin.payments" });
  const tStatus = await getTranslations({ locale, namespace: "admin.statuses" });

  const payments = await db.payment.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      payerUser: { select: { name: true, email: true } },
      booking: {
        select: {
          subject: { select: { slug: true } },
          tutorProfile: { select: { user: { select: { name: true } } } },
          earning: { select: { status: true } },
        },
      },
      refunds: { select: { id: true, amountCents: true, status: true } },
    },
  });

  const currencyFormatter = new Intl.NumberFormat(locale, { style: "currency", currency: "CAD" });

  return (
    <DashboardShell navItems={adminNavItems(tNav)} userName={user.name ?? ""}>
      <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
      <p className="mt-2 max-w-2xl text-slate">{t("description")}</p>

      <div className="mt-8 flex flex-col gap-2">
        {payments.length === 0 ? (
          <p className="text-sm text-slate">{t("empty")}</p>
        ) : (
          payments.map((payment) => (
            <div key={payment.id} className="rounded-lg border border-neutral-200 bg-white p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-navy">
                    {payment.payerUser.name ?? payment.payerUser.email}
                  </span>
                  {payment.booking && (
                    <span className="text-slate">
                      {" "}
                      — {t("bookingWith", { subject: payment.booking.subject.slug, tutor: payment.booking.tutorProfile.user.name ?? "" })}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_BADGE[payment.status] ?? "outline"}>{tStatus(payment.status)}</Badge>
                  {payment.disputeStatus && <Badge variant="outline">{t("dispute", { status: payment.disputeStatus })}</Badge>}
                </div>
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate">
                <span>
                  {currencyFormatter.format(payment.amountCents / 100)}
                  {payment.refundedAmountCents > 0 &&
                    ` ${t("refunded", { amount: currencyFormatter.format(payment.refundedAmountCents / 100) })}`}
                  {payment.booking?.earning && ` · ${t("earning", { status: payment.booking.earning.status })}`}
                </span>
                {RECONCILABLE_STATUSES.has(payment.status) && payment.stripePaymentIntentId && (
                  <ReconcilePaymentButton paymentId={payment.id} />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </DashboardShell>
  );
}
