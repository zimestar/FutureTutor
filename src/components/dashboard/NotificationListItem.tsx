"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { NotificationDto } from "@/lib/notificationPresentation";

/**
 * NOTIFICATION-CENTER1 — shared between the bell popover and the full
 * /notifications page. Unread state is signalled by THREE independent,
 * non-color cues (bold title text, an explicit "Unread" text label, and a
 * filled dot) so it never depends on color alone.
 *
 * Read-on-click policy (documented once, applied consistently): clicking
 * ALWAYS marks the notification read, whether or not it has a safe
 * destination. If `href` is set, the click also navigates there (the
 * existing destination page's own authorization is the real gate, not
 * this component). If `href` is null, the click has no navigation effect
 * — the notification simply becomes visually read in place, still fully
 * readable in the center per the mission's explicit requirement.
 */
export function NotificationListItem({
  notification,
  onMarkRead,
}: {
  notification: NotificationDto;
  onMarkRead: (id: string) => void;
}) {
  const t = useTranslations("notifications");
  const locale = useLocale();
  const isUnread = notification.readAt == null;
  const timestamp = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(notification.createdAt));

  const content = (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 transition-colors",
        isUnread ? "border-blue/30 bg-blue/5" : "border-border bg-surface"
      )}
    >
      <span
        className={cn("mt-1.5 size-2 shrink-0 rounded-full", isUnread ? "bg-blue" : "bg-transparent")}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className={cn("truncate text-sm", isUnread ? "font-bold text-text-primary" : "font-semibold text-text-secondary")}>
            {notification.title}
          </p>
          {isUnread && (
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-blue" data-testid="notification-unread-label">
              {t("unreadLabel")}
            </span>
          )}
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">{notification.body}</p>
        <p className="mt-1 text-[11px] text-text-muted">{timestamp}</p>
      </div>
    </div>
  );

  if (notification.href) {
    return (
      <li>
        <Link href={notification.href} onClick={() => onMarkRead(notification.id)} className="block" data-testid="notification-item-link">
          {content}
        </Link>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => onMarkRead(notification.id)}
        className="block w-full text-left"
        data-testid="notification-item-no-link"
      >
        {content}
      </button>
    </li>
  );
}
