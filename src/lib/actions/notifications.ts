"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { toNotificationDto, type NotificationDto } from "@/lib/notificationPresentation";

/**
 * NOTIFICATION-CENTER1 — every function here resolves the authenticated
 * user server-side via auth() and scopes every read/write to that user's
 * own id. No function accepts a userId parameter from the caller at all
 * — there is structurally no way to pass one in, so a forged client call
 * can never target another user's rows. No admin override exists in this
 * mission (per its own explicit scope limit).
 */

const RECENT_LIMIT = 20;
const PAGE_LIMIT = 20;

export interface NotificationSummary {
  unreadCount: number;
  recent: NotificationDto[];
}

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/** Powers the bell: unread count (always DB-authoritative, never derived
 * from client state) plus the most recent rows for the popover. */
export async function getNotificationSummaryAction(): Promise<NotificationSummary> {
  const userId = await requireUserId();
  if (!userId) return { unreadCount: 0, recent: [] };

  const [unreadCount, rows] = await Promise.all([
    db.notification.count({ where: { userId, readAt: null } }),
    db.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: RECENT_LIMIT,
    }),
  ]);

  return { unreadCount, recent: rows.map(toNotificationDto) };
}

export interface NotificationPage {
  items: NotificationDto[];
  nextCursor: string | null;
}

/** Powers the full /notifications page — cursor-paginated (on `id`, given
 * the stable `[createdAt desc, id desc]` ordering) rather than offset, so
 * a growing history never re-shows/skips rows across pages. */
export async function getNotificationsPageAction(cursor?: string | null): Promise<NotificationPage> {
  const userId = await requireUserId();
  if (!userId) return { items: [], nextCursor: null };

  const rows = await db.notification.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_LIMIT + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > PAGE_LIMIT;
  const page = hasMore ? rows.slice(0, PAGE_LIMIT) : rows;
  return {
    items: page.map(toNotificationDto),
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
  };
}

/** Idempotent: an already-read (or nonexistent, or someone else's) row
 * simply matches zero rows and is a silent no-op — never an error, never
 * a way to discover whether a given id belongs to another user. */
export async function markNotificationReadAction(notificationId: string): Promise<{ ok: boolean }> {
  const userId = await requireUserId();
  if (!userId) return { ok: false };

  await db.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { ok: true };
}

export async function markAllNotificationsReadAction(): Promise<{ ok: boolean }> {
  const userId = await requireUserId();
  if (!userId) return { ok: false };

  await db.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { ok: true };
}
