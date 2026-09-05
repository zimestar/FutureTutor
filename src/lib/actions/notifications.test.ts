import { beforeEach, describe, expect, it, vi } from "vitest";

// NOTIFICATION-CENTER1 — every read/write in notifications.ts resolves
// the authenticated user server-side via auth() and scopes every query
// to that user's own id; no function accepts a userId parameter at all.
// These tests exercise exactly that boundary, plus the DB-authoritative
// unread count, idempotent mark-read, and ordering/pagination behavior.

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  count: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  db: {
    notification: { count: mocks.count, findMany: mocks.findMany, updateMany: mocks.updateMany },
  },
}));

import {
  getNotificationSummaryAction,
  getNotificationsPageAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "./notifications";

const ROW = {
  id: "notif-1",
  type: "booking.confirmed",
  title: "Booking confirmed",
  body: "Your session is confirmed.",
  readAt: null,
  createdAt: new Date("2026-09-01T12:00:00.000Z"),
  metadata: { bookingId: "booking-1" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.count.mockResolvedValue(0);
  mocks.findMany.mockResolvedValue([]);
  mocks.updateMany.mockResolvedValue({ count: 1 });
});

describe("getNotificationSummaryAction", () => {
  it("item 1 — returns the authenticated user's own notifications, scoped by their real session id", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.findMany.mockResolvedValue([ROW]);
    mocks.count.mockResolvedValue(1);

    const result = await getNotificationSummaryAction();

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-1" } }));
    expect(mocks.count).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-1", readAt: null } }));
    expect(result.unreadCount).toBe(1);
    expect(result.recent).toHaveLength(1);
  });

  it("item 2 — an unauthenticated caller (no session) sees zero notifications, never another user's rows by omission", async () => {
    mocks.auth.mockResolvedValue(null);
    const result = await getNotificationSummaryAction();
    expect(result).toEqual({ unreadCount: 0, recent: [] });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("item 3 — unread count comes from a DB count query, never derived by counting the returned rows client-side", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.count.mockResolvedValue(7);
    mocks.findMany.mockResolvedValue([]); // deliberately empty — proves unreadCount isn't derived from `recent`
    const result = await getNotificationSummaryAction();
    expect(result.unreadCount).toBe(7);
  });

  it("item 6 — orders newest first (createdAt desc, id desc tiebreaker)", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    await getNotificationSummaryAction();
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ createdAt: "desc" }, { id: "desc" }] })
    );
  });

  it("item 22 — the DTO never carries raw metadata to the client, only a pre-resolved href", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.findMany.mockResolvedValue([ROW]);
    const result = await getNotificationSummaryAction();
    expect(result.recent[0]).not.toHaveProperty("metadata");
    expect(result.recent[0]!.href).toBe("/session/booking-1");
  });

  it("item 23 — an unrecognized/future notification type renders safely with no link, never throws", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.findMany.mockResolvedValue([{ ...ROW, type: "NEW_MESSAGE", metadata: { conversationId: "c1" } }]);
    const result = await getNotificationSummaryAction();
    expect(result.recent[0]!.href).toBeNull();
  });

  it("item 24 — empty state: zero rows, zero unread, no error", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    const result = await getNotificationSummaryAction();
    expect(result).toEqual({ unreadCount: 0, recent: [] });
  });
});

describe("getNotificationsPageAction", () => {
  it("item 25 — requests one extra row to detect a next page, and returns a cursor only when one exists", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    const rows = Array.from({ length: 21 }, (_, i) => ({ ...ROW, id: `notif-${i}` }));
    mocks.findMany.mockResolvedValue(rows);

    const result = await getNotificationsPageAction();

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 21 }));
    expect(result.items).toHaveLength(20);
    expect(result.nextCursor).toBe("notif-19");
  });

  it("returns no cursor when fewer rows exist than the page size", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.findMany.mockResolvedValue([ROW]);
    const result = await getNotificationsPageAction();
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it("a supplied cursor is passed through to the query, scoped to the authenticated user", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    await getNotificationsPageAction("notif-19");
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" }, cursor: { id: "notif-19" }, skip: 1 })
    );
  });
});

describe("markNotificationReadAction", () => {
  it("item 8 — marks the specified notification read, scoped to the authenticated user and to still-unread rows", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    await markNotificationReadAction("notif-1");
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "notif-1", userId: "user-1", readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });

  it("item 9 — marking an already-read notification again is a harmless no-op (matches zero rows, never errors)", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(markNotificationReadAction("already-read")).resolves.toEqual({ ok: true });
  });

  it("item 11 — cannot mark another user's notification read: the guard is baked into the WHERE clause (userId + the caller's own id), never a separate ownership check that could be bypassed", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    await markNotificationReadAction("someone-elses-notification");
    const whereClause = mocks.updateMany.mock.calls[0]![0].where;
    expect(whereClause.userId).toBe("user-1");
  });

  it("an unauthenticated caller cannot mark anything read", async () => {
    mocks.auth.mockResolvedValue(null);
    const result = await markNotificationReadAction("notif-1");
    expect(result).toEqual({ ok: false });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});

describe("markAllNotificationsReadAction", () => {
  it("item 10 — marks every unread notification for the authenticated user only", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    await markAllNotificationsReadAction();
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
});

describe("item 20/21 — no email or financial side effects exist in this module", () => {
  it("the notifications action module never imports any email/Stripe/payment code", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(new URL("./notifications.ts", import.meta.url), "utf-8");
    expect(source).not.toMatch(/stripe|resend|email|payment/i);
  });
});
