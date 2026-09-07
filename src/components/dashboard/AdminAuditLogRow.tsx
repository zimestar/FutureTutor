import { Badge } from "@/components/ui/Badge";
import { Surface } from "@/components/ui/Surface";
import { Link } from "@/i18n/navigation";
import type { AuditActionCategory } from "@/lib/auditLogPresentation";

/**
 * ADMIN-AUDITLOG-VIEWER1 — one AuditLog row on /admin/audit-log. Pure
 * presentational shell, no interactivity, no mutation control of any
 * kind — every string/link target is resolved by the caller. Mirrors
 * AdminEarningRow.tsx's own established shape for this codebase's
 * read-only admin list surfaces.
 */
const CATEGORY_BADGE_VARIANT: Record<AuditActionCategory, "mint" | "blue" | "neutral" | "outline" | "navy"> = {
  AUTH_USER: "neutral",
  TUTOR_APPLICATION: "blue",
  BOOKING_SESSION: "blue",
  FINANCIAL: "mint",
  MESSAGING_SAFETY: "outline",
  ADMIN: "navy",
  OTHER: "outline",
};

export function AdminAuditLogRow({
  timestampLabel,
  actionCode,
  categoryLabel,
  category,
  actorLabel,
  entityLabel,
  entityHref,
  detailHref,
  viewDetailLabel,
}: {
  timestampLabel: string;
  actionCode: string;
  categoryLabel: string;
  category: AuditActionCategory;
  actorLabel: string;
  entityLabel: string;
  entityHref: string | null;
  detailHref: string;
  viewDetailLabel: string;
}) {
  return (
    <Surface padding="sm" className="flex flex-col gap-2 text-sm" data-testid="audit-log-row">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-text-muted" data-testid="audit-log-action-code">{actionCode}</p>
          <p className="mt-1 font-semibold text-navy" data-testid="audit-log-actor">{actorLabel}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge variant={CATEGORY_BADGE_VARIANT[category]}>{categoryLabel}</Badge>
          <span className="text-xs text-text-muted">{timestampLabel}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-2">
        {entityHref ? (
          <Link href={entityHref} className="truncate text-sm font-semibold text-blue hover:underline" data-testid="audit-log-entity-link">
            {entityLabel}
          </Link>
        ) : (
          <span className="truncate text-sm text-text-secondary" data-testid="audit-log-entity-plain">{entityLabel}</span>
        )}
        <Link href={detailHref} className="shrink-0 text-sm font-semibold text-blue hover:underline" data-testid="audit-log-view-detail">
          {viewDetailLabel}
        </Link>
      </div>
    </Surface>
  );
}
