import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect, Link } from "@/i18n/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { adminNavItems } from "@/lib/adminNav";
import { homePathForRole } from "@/lib/authorization";
import { hasAdminPermission } from "@/lib/adminPermission";
import { listAuditLogEntries, ALL_KNOWN_AUDIT_ENTITY_TYPES, type AuditLogActorSummary } from "@/services/auditLog";
import { ALL_KNOWN_AUDIT_ACTIONS, AUDIT_ACTION_CATEGORIES, type AuditActionCategory } from "@/lib/auditLogPresentation";
import { resolveAuditEntityDetailHref } from "@/lib/auditLogEntityLinks";
import { AdminAuditLogRow } from "@/components/dashboard/AdminAuditLogRow";

/**
 * ADMIN-AUDITLOG-VIEWER1 — read-only AuditLog browser. Real permission
 * enforcement (ADMIN_AUDIT_LOG_READ), not just role — mirrors
 * message-reports' own precedent exactly (this content is materially more
 * sensitive than what most other admin pages currently gate on role
 * alone). No mutation control anywhere on this page or its detail route.
 */
export default async function AdminAuditLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ action?: string; entityType?: string; actor?: string; entityId?: string; from?: string; to?: string; cursor?: string }>;
}) {
  const { locale } = await params;
  const { action = "", entityType = "", actor = "", entityId = "", from = "", to = "", cursor = "" } = await searchParams;
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

  const actionFilter = ALL_KNOWN_AUDIT_ACTIONS.includes(action) ? action : undefined;
  const entityTypeFilter = ALL_KNOWN_AUDIT_ENTITY_TYPES.includes(entityType) ? entityType : undefined;
  const fromDate = from ? new Date(from) : undefined;
  const toDate = to ? new Date(to) : undefined;

  const page = await listAuditLogEntries(
    {
      action: actionFilter,
      entityType: entityTypeFilter,
      actorQuery: actor || undefined,
      entityIdQuery: entityId || undefined,
      from: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined,
      to: toDate && !Number.isNaN(toDate.getTime()) ? toDate : undefined,
    },
    cursor || null
  );

  const dateTimeFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  function actorLabel(summary: AuditLogActorSummary): string {
    if (summary.kind === "SYSTEM") return t("actor.system");
    if (summary.kind === "UNKNOWN") return `${t("actor.unknown")} (${t("actor.unknownId", { id: summary.actorUserId })})`;
    const base = `${summary.name ?? summary.email} · ${summary.role}`;
    return summary.deactivated ? `${base} ${t("actor.deactivated")}` : base;
  }

  return (
    <DashboardShell navItems={await adminNavItems(tNav, user)} userName={user.name ?? ""}>
      <PageHeader title={t("title")} description={t("description")} />

      <form className="mt-6 grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-3 lg:grid-cols-6">
        <label className="text-sm font-bold">
          {t("filters.action")}
          <select name="action" defaultValue={action} className="mt-1 h-11 w-full rounded-md border border-border px-3 font-normal">
            <option value="">{t("filters.all")}</option>
            {(Object.entries(AUDIT_ACTION_CATEGORIES) as Array<[Exclude<AuditActionCategory, "OTHER">, readonly string[]]>).map(([category, actions]) => (
              <optgroup key={category} label={t(`category.${category}`)}>
                {actions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold">
          {t("filters.entityType")}
          <select name="entityType" defaultValue={entityType} className="mt-1 h-11 w-full rounded-md border border-border px-3 font-normal">
            <option value="">{t("filters.all")}</option>
            {ALL_KNOWN_AUDIT_ENTITY_TYPES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold">
          {t("filters.actor")}
          <input name="actor" defaultValue={actor} placeholder={t("filters.actorPlaceholder")} className="mt-1 h-11 w-full rounded-md border border-border px-3 font-normal" />
        </label>
        <label className="text-sm font-bold">
          {t("filters.entityId")}
          <input name="entityId" defaultValue={entityId} placeholder={t("filters.entityIdPlaceholder")} className="mt-1 h-11 w-full rounded-md border border-border px-3 font-normal" />
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

      <div className="mt-6 flex flex-col gap-3" data-testid="audit-log-list">
        {page.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-text-secondary">{t("empty")}</p>
        ) : (
          page.items.map((item) => {
            const entityHref = resolveAuditEntityDetailHref(item.entityType, item.entityId);
            const entityLabel = item.entityId ? `${item.entityType} · ${item.entityId}` : item.entityType;
            return (
              <AdminAuditLogRow
                key={item.id}
                timestampLabel={dateTimeFormatter.format(item.createdAt)}
                actionCode={item.action}
                category={item.category}
                categoryLabel={t(`category.${item.category}`)}
                actorLabel={actorLabel(item.actor)}
                entityLabel={entityLabel}
                entityHref={entityHref}
                detailHref={`/admin/audit-log/${item.id}`}
                viewDetailLabel={t("viewDetail")}
              />
            );
          })
        )}
      </div>

      {page.nextCursor && (
        <div className="mt-6 text-center">
          <Link
            href={`/admin/audit-log?action=${action}&entityType=${entityType}&actor=${encodeURIComponent(actor)}&entityId=${encodeURIComponent(entityId)}&from=${from}&to=${to}&cursor=${page.nextCursor}`}
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
