import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import type { PaymentStatus } from "@/generated/prisma/enums";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { PaymentHistoryList } from "@/components/dashboard/PaymentHistoryList";
import { getStudentDashboardNavItems } from "@/lib/dashboardNav";
import { toPaymentHistoryDto } from "@/lib/paymentHistoryPresentation";

/**
 * PAYMENT-HISTORY1 — customer-facing, read-only. STUDENT/PARENT only (the
 * two payer-capable roles today — see paymentHistoryPresentation.ts for
 * why a guardian's own payerUserId-scoped query already keeps a restricted
 * child from ever seeing a guardian's payment history through this path).
 *
 * Mirrors NotificationsPage's exact shape: first page fetched here,
 * server-side, so the page has real content on first paint; PaymentHistoryList
 * takes over pagination from there via getPaymentHistoryPageAction.
 */
const PAGE_LIMIT = 20;
const HISTORY_STATUSES: PaymentStatus[] = ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"];

export default async function PaymentHistoryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  const user = session?.user;
  if (!user || (user.role !== "STUDENT" && user.role !== "PARENT")) {
    redirect({ href: "/login", locale });
    return;
  }

  const t = await getTranslations({ locale, namespace: "paymentHistory" });
  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });
  const navItems = getStudentDashboardNavItems((key) => tNav(key), user.role);

  const rows = await db.payment.findMany({
    where: { payerUserId: user.id, status: { in: HISTORY_STATUSES } },
    select: {
      id: true,
      amountCents: true,
      currency: true,
      refundedAmountCents: true,
      status: true,
      capturedAt: true,
      createdAt: true,
      booking: {
        select: {
          id: true,
          mode: true,
          startAt: true,
          endAt: true,
          timezone: true,
          subject: { select: { slug: true } },
          academicLevel: { select: { slug: true } },
          tutorProfile: { select: { user: { select: { name: true } } } },
        },
      },
      refunds: {
        select: { id: true, amountCents: true, currency: true, status: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ capturedAt: "desc" }, { id: "desc" }],
    take: PAGE_LIMIT + 1,
  });
  const hasMore = rows.length > PAGE_LIMIT;
  const page = hasMore ? rows.slice(0, PAGE_LIMIT) : rows;

  const items = page
    .map((row) =>
      toPaymentHistoryDto({
        id: row.id,
        amountCents: row.amountCents,
        currency: row.currency,
        refundedAmountCents: row.refundedAmountCents,
        status: row.status,
        capturedAt: row.capturedAt,
        createdAt: row.createdAt,
        booking: row.booking
          ? {
              id: row.booking.id,
              subjectSlug: row.booking.subject.slug,
              academicLevelSlug: row.booking.academicLevel?.slug ?? null,
              tutorFirstName: row.booking.tutorProfile.user.name?.split(" ")[0] ?? "",
              mode: row.booking.mode,
              startAt: row.booking.startAt,
              endAt: row.booking.endAt,
              timezone: row.booking.timezone,
            }
          : null,
        refunds: row.refunds,
      })
    )
    .filter((dto): dto is NonNullable<typeof dto> => dto !== null);

  return (
    <DashboardShell navItems={navItems} userName={user.name ?? ""} userImage={user.image}>
      <PageHeader title={t("pageTitle")} description={t("pageDescription")} />
      <PaymentHistoryList
        initialItems={items}
        initialCursor={hasMore ? page[page.length - 1]!.id : null}
      />
    </DashboardShell>
  );
}
