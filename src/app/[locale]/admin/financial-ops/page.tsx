import type { TutorEarningStatus, TutorTransferStatus } from "@/generated/prisma/enums";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Surface } from "@/components/ui/Surface";
import { AdminEarningRow } from "@/components/dashboard/AdminEarningRow";
import { adminNavItems } from "@/lib/adminNav";
import { reconstructNoShowOutcome } from "@/services/sessionLifecycle";
import { classifyTutorEarningForAdmin, type AdminEarningReasonKey } from "@/lib/adminFinancialOpsPresentation";
import type { TutorEarningSessionFacts } from "@/lib/tutorEarningPresentation";

/**
 * ADMIN-FINANCIAL-OPS1A — read-only financial observability console.
 *
 * CRITICAL: this page renders zero financial mutation controls. It never
 * calls Stripe, never writes TutorEarning/TutorTransfer, never invokes
 * convergeTutorEarningFromSession or processEligibleTransfers. It is a pure
 * read/classify/render pipeline over already-persisted facts, exactly the
 * same authoritative facts /tutor/payouts' own transparency work
 * (TUTOR-PAYOUT-TRANSPARENCY1) reads — this file has no write path at all.
 */

const EARNING_STATUSES: TutorEarningStatus[] = ["PENDING_ELIGIBLE", "ELIGIBLE", "TRANSFERRED", "HELD", "CANCELLED"];
const TRANSFER_STATUSES: TutorTransferStatus[] = ["PENDING", "COMPLETED", "FAILED"];
const REASON_KEYS: AdminEarningReasonKey[] = [
  "pendingSessionOutcome",
  "waiting24h",
  "awaitingConvergence",
  "eligible",
  "heldTutorNoShow",
  "heldNoShowUnresolved",
  "heldInterrupted",
  "heldUnknown",
  "transferPending",
  "transferred",
  "transferFailed",
  "cancelled",
];
const HELD_REASON_KEYS: AdminEarningReasonKey[] = ["heldTutorNoShow", "heldNoShowUnresolved", "heldInterrupted", "heldUnknown"];
const QUERY_BOUND = 200;

export default async function AdminFinancialOpsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; earningStatus?: string; transferStatus?: string; reason?: string; from?: string; to?: string }>;
}) {
  const { locale } = await params;
  const { q = "", earningStatus = "", transferStatus = "", reason = "", from = "", to = "" } = await searchParams;
  setRequestLocale(locale);

  const session = await auth();
  const user = session?.user;
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
    redirect({ href: "/login", locale });
    return;
  }

  const t = await getTranslations({ locale, namespace: "admin.financialOps" });
  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });
  const tSubjects = await getTranslations({ locale, namespace: "subjects.items" });

  const earningStatusFilter = EARNING_STATUSES.includes(earningStatus as TutorEarningStatus) ? (earningStatus as TutorEarningStatus) : null;
  const transferStatusFilter = TRANSFER_STATUSES.includes(transferStatus as TutorTransferStatus) ? (transferStatus as TutorTransferStatus) : null;
  const reasonFilter = REASON_KEYS.includes(reason as AdminEarningReasonKey) ? (reason as AdminEarningReasonKey) : null;
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;

  const rows = await db.tutorEarning.findMany({
    where: {
      ...(earningStatusFilter ? { status: earningStatusFilter } : {}),
      ...(transferStatus === "NONE" ? { transfer: null } : transferStatusFilter ? { transfer: { status: transferStatusFilter } } : {}),
      ...(q
        ? {
            OR: [
              { id: { contains: q, mode: "insensitive" as const } },
              { bookingId: { contains: q, mode: "insensitive" as const } },
              { tutorProfile: { is: { user: { is: { name: { contains: q, mode: "insensitive" as const } } } } } },
            ],
          }
        : {}),
      ...(fromDate || toDate
        ? {
            booking: {
              is: {
                startAt: {
                  ...(fromDate && !Number.isNaN(fromDate.getTime()) ? { gte: fromDate } : {}),
                  ...(toDate && !Number.isNaN(toDate.getTime()) ? { lte: toDate } : {}),
                },
              },
            },
          }
        : {}),
    },
    include: {
      tutorProfile: { select: { id: true, user: { select: { name: true } } } },
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
              attendanceEvents: { where: { eventType: "CHECK_IN" }, select: { participantRole: true } },
            },
          },
        },
      },
      transfer: { select: { id: true, status: true, completedAt: true, createdAt: true, stripeTransferId: true } },
    },
    orderBy: { createdAt: "desc" },
    take: QUERY_BOUND,
  });

  const now = new Date();

  const classified = rows.map((row) => {
    const sessionRow = row.booking.session;
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
    const classification = classifyTutorEarningForAdmin(row, sessionFacts, row.transfer, now);
    return { row, sessionFacts, classification };
  });

  // Summary reflects everything matched by search/status/date filters (the
  // set the reason filter itself further narrows below) — a stable legend
  // for what's currently in scope, not re-scoped by the reason click itself.
  const summaryCounts: Record<AdminEarningReasonKey, number> = Object.fromEntries(REASON_KEYS.map((k) => [k, 0])) as Record<AdminEarningReasonKey, number>;
  let totalAmountCents = 0;
  let currency = "CAD";
  for (const { row, classification } of classified) {
    summaryCounts[classification.key]++;
    totalAmountCents += row.amountCents;
    currency = row.currency;
  }
  const heldCount = HELD_REASON_KEYS.reduce((sum, key) => sum + summaryCounts[key], 0);

  const visible = reasonFilter ? classified.filter((c) => c.classification.key === reasonFilter) : classified;

  const currencyFormatter = new Intl.NumberFormat(locale, { style: "currency", currency });
  const dateTimeFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  const summaryTiles: Array<{ key: string; label: string; value: string }> = [
    { key: "totalCount", label: t("summary.totalCount"), value: String(classified.length) },
    { key: "totalAmount", label: t("summary.totalAmount"), value: currencyFormatter.format(totalAmountCents / 100) },
    { key: "pendingSessionOutcome", label: t("summary.pendingSessionOutcome"), value: String(summaryCounts.pendingSessionOutcome) },
    { key: "waiting24h", label: t("summary.waiting24h"), value: String(summaryCounts.waiting24h) },
    { key: "awaitingConvergence", label: t("summary.awaitingConvergence"), value: String(summaryCounts.awaitingConvergence) },
    { key: "eligible", label: t("summary.eligible"), value: String(summaryCounts.eligible) },
    { key: "held", label: t("summary.held"), value: String(heldCount) },
    { key: "transferPending", label: t("summary.transferPending"), value: String(summaryCounts.transferPending) },
    { key: "transferred", label: t("summary.transferred"), value: String(summaryCounts.transferred) },
    { key: "transferFailed", label: t("summary.transferFailed"), value: String(summaryCounts.transferFailed) },
  ];

  return (
    <DashboardShell navItems={await adminNavItems(tNav, user)} userName={user.name ?? ""}>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5" data-testid="financial-ops-summary">
        {summaryTiles.map((tile) => (
          <Surface key={tile.key} padding="sm">
            <p className="text-xs font-semibold text-text-muted">{tile.label}</p>
            <p className="mt-1 text-lg font-extrabold text-navy">{tile.value}</p>
          </Surface>
        ))}
      </div>

      <p className="mt-4 text-xs text-text-muted" data-testid="bank-payout-note">
        {t("bankPayoutNote")}
      </p>

      <form className="mt-6 grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-3 lg:grid-cols-6">
        <label className="text-sm font-bold">
          {t("filters.search")}
          <input name="q" defaultValue={q} placeholder={t("filters.searchPlaceholder")} className="mt-1 h-11 w-full rounded-md border border-border px-3 font-normal" />
        </label>
        <label className="text-sm font-bold">
          {t("filters.earningStatus")}
          <select name="earningStatus" defaultValue={earningStatus} className="mt-1 h-11 w-full rounded-md border border-border px-3 font-normal">
            <option value="">{t("filters.all")}</option>
            {EARNING_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold">
          {t("filters.transferStatus")}
          <select name="transferStatus" defaultValue={transferStatus} className="mt-1 h-11 w-full rounded-md border border-border px-3 font-normal">
            <option value="">{t("filters.all")}</option>
            <option value="NONE">{t("filters.none")}</option>
            {TRANSFER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold">
          {t("filters.reason")}
          <select name="reason" defaultValue={reason} className="mt-1 h-11 w-full rounded-md border border-border px-3 font-normal">
            <option value="">{t("filters.all")}</option>
            {REASON_KEYS.map((value) => (
              <option key={value} value={value}>
                {t(`reason.${value}.label`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold">
          {t("filters.from")}
          <input type="date" name="from" defaultValue={from} className="mt-1 h-11 w-full rounded-md border border-border px-3 font-normal" />
        </label>
        <label className="text-sm font-bold">
          {t("filters.to")}
          <input type="date" name="to" defaultValue={to} className="mt-1 h-11 w-full rounded-md border border-border px-3 font-normal" />
        </label>
        <button type="submit" className="min-h-11 self-end rounded-md bg-blue px-5 font-bold text-white sm:col-span-3 lg:col-span-1">
          {t("filters.apply")}
        </button>
      </form>

      <div className="mt-6 flex flex-col gap-3" data-testid="financial-ops-list">
        {visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-text-secondary">{t("empty")}</p>
        ) : (
          visible.map(({ row, classification }) => {
            const sessionOutcomeLabel = row.booking.session ? t(`sessionOutcome.${row.booking.session.status}`) : t("sessionOutcome.none");
            const eligibilityDateLabel = classification.eligibilityDate
              ? classification.eligibilityDateIsExpected
                ? `${t("table.expectedEligibility")}: ${dateTimeFormatter.format(classification.eligibilityDate)}`
                : `${t("table.persistedEligibleAt")}: ${dateTimeFormatter.format(classification.eligibilityDate)}`
              : t("table.notYetPersisted");
            const transferStatusLabel = row.transfer ? row.transfer.status : t("table.noTransfer");
            const transferReference = row.transfer?.stripeTransferId ?? null;

            return (
              <AdminEarningRow
                key={row.id}
                tutorName={row.tutorProfile.user.name ?? ""}
                amountLabel={new Intl.NumberFormat(locale, { style: "currency", currency: row.currency }).format(row.amountCents / 100)}
                subjectLabel={tSubjects(row.booking.subject.slug)}
                sessionDateLabel={dateTimeFormatter.format(row.booking.startAt)}
                sessionOutcomeLabel={sessionOutcomeLabel}
                reasonKey={classification.key}
                reasonLabel={t(`reason.${classification.key}.label`)}
                reasonDescription={t(`reason.${classification.key}.description`)}
                delayAnchorLabel={`${t("table.delayAnchor")}: ${t(`delayAnchor.${classification.delayAnchor}`)}`}
                eligibilityFieldLabel={t("table.expectedEligibility")}
                eligibilityDateLabel={eligibilityDateLabel}
                transferFieldLabel={t("table.transfer")}
                transferStatusLabel={transferStatusLabel}
                transferReference={transferReference}
                bookingId={row.booking.id}
                viewBookingLabel={t("table.viewBooking")}
                tutorProfileId={row.tutorProfile.id}
                viewTutorLabel={t("table.viewTutor")}
              />
            );
          })
        )}
      </div>
    </DashboardShell>
  );
}
