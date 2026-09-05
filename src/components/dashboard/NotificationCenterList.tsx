"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { NotificationListItem } from "@/components/dashboard/NotificationListItem";
import { getNotificationsPageAction, markAllNotificationsReadAction, markNotificationReadAction } from "@/lib/actions/notifications";
import type { NotificationDto } from "@/lib/notificationPresentation";

/**
 * NOTIFICATION-CENTER1 — the full /notifications page's list, cursor-
 * paginated (item 25) so a growing history is never fetched unbounded.
 * Receives its FIRST page pre-fetched server-side (real SSR content, not
 * a client-only spinner on first paint); every subsequent "Load more"
 * click fetches the next page via the same cursor Server Action the bell
 * doesn't need (the bell only ever shows the first page's worth).
 */
export function NotificationCenterList({
  initialItems,
  initialCursor,
  initialUnreadCount,
}: {
  initialItems: NotificationDto[];
  initialCursor: string | null;
  initialUnreadCount: number;
}) {
  const t = useTranslations("notifications");
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [loadingMore, setLoadingMore] = useState(false);

  function handleMarkOne(id: string) {
    setItems((prev) => {
      const wasUnread = prev.some((n) => n.id === id && n.readAt == null);
      if (wasUnread) setUnreadCount((count) => Math.max(0, count - 1));
      return prev.map((n) => (n.id === id && n.readAt == null ? { ...n, readAt: new Date().toISOString() } : n));
    });
    void markNotificationReadAction(id);
  }

  function handleMarkAll() {
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
    setUnreadCount(0);
    void markAllNotificationsReadAction();
  }

  async function handleLoadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const next = await getNotificationsPageAction(cursor);
    setItems((prev) => [...prev, ...next.items]);
    setCursor(next.nextCursor);
    setLoadingMore(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">{t("pageDescription")}</p>
        {unreadCount > 0 && (
          <button type="button" onClick={handleMarkAll} className="shrink-0 text-sm font-semibold text-blue hover:underline" data-testid="mark-all-read-page">
            {t("markAllRead")}
          </button>
        )}
      </div>

      <ul className="mt-6 flex flex-col gap-2" data-testid="notification-page-list">
        {items.length === 0 && <li className="py-12 text-center text-sm text-text-muted">{t("empty")}</li>}
        {items.map((notification) => (
          <NotificationListItem key={notification.id} notification={notification} onMarkRead={handleMarkOne} />
        ))}
      </ul>

      {cursor && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-slate hover:border-blue hover:text-blue disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="load-more"
          >
            {t("loadMore")}
          </button>
        </div>
      )}
    </div>
  );
}
