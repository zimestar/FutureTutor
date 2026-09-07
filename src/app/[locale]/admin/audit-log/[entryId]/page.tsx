import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Surface } from "@/components/ui/Surface";
import { Link } from "@/i18n/navigation";
import { adminNavItems } from "@/lib/adminNav";
import { homePathForRole } from "@/lib/authorization";
import { hasAdminPermission } from "@/lib/adminPermission";
import { getAuditLogEntry } from "@/services/auditLog";
import { redactAuditMetadata } from "@/lib/auditLogPresentation";
import { resolveAuditEntityDetailHref } from "@/lib/auditLogEntityLinks";
import { AuditMetadataViewer } from "@/components/dashboard/AuditMetadataViewer";

/**
 * ADMIN-AUDITLOG-VIEWER1 — single audit-event detail. Read-only: no
 * mutation control, no replay, no rollback, no impersonation anywhere on
 * this page. metadata is rendered exclusively through redactAuditMetadata
 * — the raw Json value is never passed to a client component or
 * JSON.stringify'd into the page.
 */
export default async function AdminAuditLogDetailPage({
  params,
}: {
  params: Promise<{ locale: string; entryId: string }>;
}) {
  const { locale, entryId } = await params;
  setRequestLocale(locale);

  const session = await auth();
  const user = session?.user;
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
    redirect({ href: "/login", locale });
    return;
  }
  const permitted = await hasAdminPermission(user, "ADMIN_AUDIT_LOG_READ");
  if (!permitted) {
    redirect({ href: homePathForRole(user.role), locale });
    return;
  }

  const t = await getTranslations({ locale, namespace: "admin.auditLog" });
  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });

  const entry = await getAuditLogEntry(entryId);
  if (!entry) notFound();

  const dateTimeFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "medium" });
  const entityHref = resolveAuditEntityDetailHref(entry.entityType, entry.entityId);

  const actorDisplay =
    entry.actor.kind === "SYSTEM"
      ? t("actor.system")
      : entry.actor.kind === "UNKNOWN"
        ? `${t("actor.unknown")} (${t("actor.unknownId", { id: entry.actor.actorUserId })})`
        : `${entry.actor.name ?? entry.actor.email}${entry.actor.deactivated ? ` ${t("actor.deactivated")}` : ""}`;

  const metadataFields = redactAuditMetadata(entry.metadata);

  return (
    <DashboardShell navItems={await adminNavItems(tNav, user)} userName={user.name ?? ""}>
      <PageHeader title={t("detailTitle")} description={t("detailDescription")} />

      <Surface className="mt-6" padding="sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-sm text-navy" data-testid="audit-detail-action">{entry.action}</p>
            <Badge className="mt-2" variant="neutral">{t(`category.${entry.category}`)}</Badge>
          </div>
          <span className="shrink-0 text-sm text-text-muted" data-testid="audit-detail-timestamp">
            {dateTimeFormatter.format(entry.createdAt)}
          </span>
        </div>

        <dl className="mt-5 grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-text-muted">{t("actor.roleLabel")}</dt>
            <dd className="mt-1 text-sm font-semibold text-text-primary" data-testid="audit-detail-actor">
              {entry.actor.kind === "USER" ? `${actorDisplay} · ${entry.actor.role}` : actorDisplay}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-text-muted">{t("entity.label")}</dt>
            <dd className="mt-1 text-sm font-semibold text-text-primary" data-testid="audit-detail-entity">
              {entityHref && entry.entityId ? (
                <Link href={entityHref} className="text-blue hover:underline">
                  {entry.entityType} · {entry.entityId}
                </Link>
              ) : entry.entityId ? (
                `${entry.entityType} · ${entry.entityId}`
              ) : (
                `${entry.entityType} · ${t("entity.none")}`
              )}
            </dd>
          </div>
        </dl>
      </Surface>

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-bold text-navy">{t("metadata.title")}</h2>
        <Surface padding="sm">
          <AuditMetadataViewer fields={metadataFields} emptyLabel={t("metadata.empty")} redactedLabel={t("metadata.redacted")} />
        </Surface>
        <p className="mt-3 text-xs text-text-muted">{t("correlationNote")}</p>
      </section>
    </DashboardShell>
  );
}
