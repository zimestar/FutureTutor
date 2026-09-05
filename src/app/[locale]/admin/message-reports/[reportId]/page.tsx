import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Surface } from "@/components/ui/Surface";
import { adminNavItems } from "@/lib/adminNav";
import { homePathForRole } from "@/lib/authorization";
import { hasAdminPermission } from "@/lib/adminPermission";
import { getMessageReportDetail } from "@/services/messageReports";
import { MessageReportStatusActions } from "@/components/dashboard/MessageReportStatusActions";

/**
 * MESSAGING-MVP1C — bounded conversation context (5 messages before / 5
 * after the reported one) for a safety review, never the full lifetime
 * conversation. Every successful load writes AuditLog
 * (admin.conversation_viewed) inside getMessageReportDetail itself — one
 * write per real page visit, since this page does not poll.
 */
export default async function MessageReportDetailPage({
  params,
}: {
  params: Promise<{ locale: string; reportId: string }>;
}) {
  const { locale, reportId } = await params;
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
  const canManage = await hasAdminPermission(user, "ADMIN_MESSAGE_REPORTS_MANAGE");

  const t = await getTranslations({ locale, namespace: "admin.messageReports" });
  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });

  const report = await getMessageReportDetail(user.id, reportId);
  if (!report) notFound();

  const dateTimeFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  return (
    <DashboardShell navItems={await adminNavItems(tNav, user)} userName={user.name ?? ""}>
      <PageHeader title={t("detailTitle")} description={t("detailDescription")} />

      <Surface className="mt-6" padding="sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-navy">
              {report.studentFirstName} — {report.tutorFirstName}
            </p>
            {report.guardianFirstNames.length > 0 && (
              <p className="mt-0.5 text-xs text-text-muted">{t("guardianContext", { names: report.guardianFirstNames.join(", ") })}</p>
            )}
            <p className="mt-1 text-sm text-text-secondary">{t("reportedByLine", { reporter: report.reporterName })}</p>
            <p className="mt-1 text-sm text-text-secondary">
              {t("reason.label")}: {t(`reason.${report.reason}`)}
            </p>
            {report.detail && <p className="mt-1 text-sm text-text-secondary" data-testid="report-detail-text">{report.detail}</p>}
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant={report.status === "RESOLVED" ? "mint" : report.status === "UNDER_REVIEW" ? "blue" : "outline"}>{t(`status.${report.status}`)}</Badge>
            <span className="text-xs text-text-muted">{dateTimeFormatter.format(report.createdAt)}</span>
          </div>
        </div>

        {canManage && <MessageReportStatusActions reportId={report.id} status={report.status} />}
      </Surface>

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-bold text-navy">{t("contextTitle")}</h2>
        <p className="mb-3 text-xs text-text-muted">{t("contextBoundedNote")}</p>
        <ul className="flex flex-col gap-2" data-testid="report-context-messages">
          {report.context.map((message) => (
            <li
              key={message.id}
              data-testid={message.isReportedMessage ? "reported-message" : "context-message"}
              className={message.isReportedMessage ? "rounded-lg border-2 border-error bg-error-light p-3" : "rounded-lg border border-neutral-200 bg-white p-3"}
            >
              <p className="text-xs font-semibold text-text-muted">
                {message.senderName} · {dateTimeFormatter.format(message.createdAt)}
                {message.isReportedMessage && <span className="ml-2 font-bold text-error">{t("reportedMessageLabel")}</span>}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-[15px] text-navy">{message.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </DashboardShell>
  );
}
