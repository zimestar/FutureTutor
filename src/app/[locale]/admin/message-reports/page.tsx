import type { MessageReportReason, MessageReportStatus } from "@/generated/prisma/enums";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect, Link } from "@/i18n/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Surface } from "@/components/ui/Surface";
import { adminNavItems } from "@/lib/adminNav";
import { homePathForRole } from "@/lib/authorization";
import { hasAdminPermission } from "@/lib/adminPermission";
import { listMessageReports } from "@/services/messageReports";

/**
 * MESSAGING-MVP1C — the ONLY admin entry point into private messaging
 * content: a report-driven queue (option A from the design report), never
 * a general "browse every conversation" page. Real permission enforcement
 * (ADMIN_MESSAGE_REPORTS_READ), not just role — this content is materially
 * more sensitive than what every other admin page currently gates on role
 * alone.
 */
const STATUSES: MessageReportStatus[] = ["OPEN", "UNDER_REVIEW", "RESOLVED"];
const REASONS: MessageReportReason[] = ["INAPPROPRIATE_CONTENT", "HARASSMENT", "OFF_PLATFORM_REQUEST", "SAFETY_CONCERN", "SPAM", "OTHER"];

const STATUS_BADGE: Record<MessageReportStatus, "outline" | "blue" | "mint"> = {
  OPEN: "outline",
  UNDER_REVIEW: "blue",
  RESOLVED: "mint",
};

export default async function MessageReportQueuePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; reason?: string; from?: string; to?: string; cursor?: string }>;
}) {
  const { locale } = await params;
  const { status = "", reason = "", from = "", to = "", cursor = "" } = await searchParams;
  setRequestLocale(locale);

  const session = await auth();
  const user = session?.user;
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
    redirect({ href: "/login", locale });
    return;
  }
  const permitted = await hasAdminPermission(user, "ADMIN_MESSAGE_REPORTS_READ");
  if (!permitted) {
    redirect({ href: homePathForRole(user.role), locale });
    return;
  }

  const t = await getTranslations({ locale, namespace: "admin.messageReports" });
  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });

  const statusFilter = STATUSES.includes(status as MessageReportStatus) ? (status as MessageReportStatus) : undefined;
  const reasonFilter = REASONS.includes(reason as MessageReportReason) ? (reason as MessageReportReason) : undefined;
  const fromDate = from ? new Date(from) : undefined;
  const toDate = to ? new Date(to) : undefined;

  const page = await listMessageReports(
    {
      status: statusFilter,
      reason: reasonFilter,
      from: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined,
      to: toDate && !Number.isNaN(toDate.getTime()) ? toDate : undefined,
    },
    cursor || null
  );

  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  return (
    <DashboardShell navItems={await adminNavItems(tNav, user)} userName={user.name ?? ""}>
      <PageHeader title={t("title")} description={t("description")} />

      <form className="mt-6 grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-4">
        <label className="text-sm font-bold">
          {t("filters.status")}
          <select name="status" defaultValue={status} className="mt-1 h-11 w-full rounded-md border border-border px-3 font-normal">
            <option value="">{t("filters.all")}</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`status.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold">
          {t("filters.reason")}
          <select name="reason" defaultValue={reason} className="mt-1 h-11 w-full rounded-md border border-border px-3 font-normal">
            <option value="">{t("filters.all")}</option>
            {REASONS.map((value) => (
              <option key={value} value={value}>
                {t(`reason.${value}`)}
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
        <button type="submit" className="min-h-11 self-end rounded-md bg-blue px-5 font-bold text-white sm:col-span-4 sm:w-fit">
          {t("filters.apply")}
        </button>
      </form>

      <div className="mt-6 flex flex-col gap-3" data-testid="message-report-queue">
        {page.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-text-secondary">{t("empty")}</p>
        ) : (
          page.items.map((item) => (
            <Surface key={item.id} padding="sm" data-testid="message-report-row">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-navy">
                    {t("reportedBy", { reporter: item.reporterName, sender: item.reportedSenderName })}
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {item.studentFirstName} — {item.tutorFirstName}
                  </p>
                  <p className="mt-1 truncate text-sm text-text-secondary">{item.messagePreview}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge variant={STATUS_BADGE[item.status]}>{t(`status.${item.status}`)}</Badge>
                  <span className="text-xs text-text-muted">{t(`reason.${item.reason}`)}</span>
                  <span className="text-xs text-text-muted">{dateFormatter.format(item.createdAt)}</span>
                </div>
              </div>
              <div className="mt-3">
                <Link href={`/admin/message-reports/${item.id}`} className="text-sm font-semibold text-blue hover:underline">
                  {t("viewDetail")}
                </Link>
              </div>
            </Surface>
          ))
        )}
      </div>

      {page.nextCursor && (
        <div className="mt-6 text-center">
          <Link
            href={`/admin/message-reports?status=${status}&reason=${reason}&from=${from}&to=${to}&cursor=${page.nextCursor}`}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-slate hover:border-blue hover:text-blue"
            data-testid="next-page"
          >
            {t("nextPage")}
          </Link>
        </div>
      )}
    </DashboardShell>
  );
}
