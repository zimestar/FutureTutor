"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { NotificationListItem } from "@/components/dashboard/NotificationListItem";
import {
  getNotificationSummaryAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/lib/actions/notifications";
import type { NotificationSummary } from "@/lib/actions/notifications";

/**
 * NOTIFICATION-CENTER1 — self-contained: DashboardShell renders this with
 * no props, and it fetches its own summary via a Server Action rather
 * than requiring every one of the ~15 pages that render DashboardShell to
 * thread notification data through as a new prop. Since DashboardShell
 * itself is rendered fresh per page (not a persistent Next.js layout),
 * this naturally refetches on every navigation — the simplest form of
 * "server-rendered count on navigation" the mission asks for, with no
 * polling and no new realtime dependency.
 *
 * Unread count is always the value the server just returned — never
 * computed by counting client-held items — except for the deliberate,
 * purely-cosmetic optimistic decrement in handleMarkOne (immediately
 * corrected by whatever the server already confirmed via the action's
 * own guarded update; a page reload always shows the authoritative
 * count).
 */
export function NotificationBell() {
  const t = useTranslations("notifications");
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<NotificationSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    getNotificationSummaryAction().then((result) => {
      if (!cancelled) setSummary(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleMarkOne(id: string) {
    setSummary((prev) => {
      if (!prev) return prev;
      const wasUnread = prev.recent.some((n) => n.id === id && n.readAt == null);
      return {
        unreadCount: wasUnread ? Math.max(0, prev.unreadCount - 1) : prev.unreadCount,
        recent: prev.recent.map((n) => (n.id === id && n.readAt == null ? { ...n, readAt: new Date().toISOString() } : n)),
      };
    });
    void markNotificationReadAction(id);
  }

  function handleMarkAll() {
    setSummary((prev) =>
      prev
        ? {
            unreadCount: 0,
            recent: prev.recent.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })),
          }
        : prev
    );
    void markAllNotificationsReadAction();
  }

  const unreadCount = summary?.unreadCount ?? 0;
  const badgeLabel = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("bellLabel", { count: unreadCount })}
        className="relative flex size-11 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-surface-subtle hover:text-text-primary"
        data-testid="notification-bell"
      >
        <Bell className="size-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            className="absolute right-1.5 top-1.5 flex min-w-[1.1rem] items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold leading-none text-white"
            data-testid="notification-unread-badge"
            aria-hidden="true"
          >
            {badgeLabel}
          </span>
        )}
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title={t("title")} closeLabel={t("close")}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-text-muted">{t("recentSubtitle")}</p>
          {unreadCount > 0 && (
            <button type="button" onClick={handleMarkAll} className="text-xs font-semibold text-blue hover:underline" data-testid="mark-all-read">
              {t("markAllRead")}
            </button>
          )}
        </div>
        <ul className="mt-3 flex max-h-96 flex-col gap-2 overflow-y-auto" data-testid="notification-list">
          {summary && summary.recent.length === 0 && <li className="py-8 text-center text-sm text-text-muted">{t("empty")}</li>}
          {summary?.recent.map((notification) => (
            <NotificationListItem key={notification.id} notification={notification} onMarkRead={handleMarkOne} />
          ))}
        </ul>
        <div className="mt-4 text-center">
          <Link href="/notifications" onClick={() => setOpen(false)} className="text-sm font-semibold text-blue hover:underline">
            {t("viewAll")}
          </Link>
        </div>
      </Dialog>
    </>
  );
}
