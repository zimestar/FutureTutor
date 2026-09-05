import { beforeEach, describe, expect, it, vi } from "vitest";

// PAYMENT-HISTORY1 — getPaymentHistoryPageAction resolves the authenticated
// user server-side via auth() and scopes every query to
// Payment.payerUserId == that user's own id; the function accepts no
// payerUserId parameter from the caller at all. These tests exercise that
// boundary, the status filter, ordering/pagination, and the safe empty
// response for an unauthenticated caller.

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  db: {
    payment: { findMany: mocks.findMany },
  },
}));

import { getPaymentHistoryPageAction } from "./paymentHistory";

const ROW = {
  id: "pay-1",
  amountCents: 10000,
  currency: "CAD",
  refundedAmountCents: 0,
  status: "CAPTURED",
  capturedAt: new Date("2026-09-01T12:00:00.000Z"),
  createdAt: new Date("2026-08-30T12:00:00.000Z"),
  booking: {
    id: "booking-1",
    mode: "ONLINE",
    startAt: new Date("2026-09-05T18:00:00.000Z"),
    endAt: new Date("2026-09-05T19:00:00.000Z"),
    timezone: "America/Toronto",
    subject: { slug: "math" },
    academicLevel: { slug: "high-school" },
    tutorProfile: { user: { name: "Taylor Tutor" } },
  },
  refunds: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([]);
});

describe("getPaymentHistoryPageAction", () => {
  it("scopes the query to the authenticated caller's own payerUserId, never a client-supplied one", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    await getPaymentHistoryPageAction();
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ payerUserId: "user-1" }) })
    );
  });

  it("an unauthenticated caller gets an empty page, never a query", async () => {
    mocks.auth.mockResolvedValue(null);
    const result = await getPaymentHistoryPageAction();
    expect(result).toEqual({ items: [], nextCursor: null });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("filters to only CAPTURED/PARTIALLY_REFUNDED/REFUNDED — a failed/cancelled attempt is never shown as a paid line item", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    await getPaymentHistoryPageAction();
    const where = mocks.findMany.mock.calls[0]![0].where;
    expect(where.status.in.sort()).toEqual(["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"].sort());
  });

  it("orders newest-paid-first (capturedAt desc, id desc tiebreaker)", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    await getPaymentHistoryPageAction();
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ capturedAt: "desc" }, { id: "desc" }] })
    );
  });

  it("requests one extra row to detect a next page, returning a cursor only when one exists", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    const rows = Array.from({ length: 21 }, (_, i) => ({ ...ROW, id: `pay-${i}` }));
    mocks.findMany.mockResolvedValue(rows);

    const result = await getPaymentHistoryPageAction();

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 21 }));
    expect(result.items).toHaveLength(20);
    expect(result.nextCursor).toBe("pay-19");
  });

  it("returns no cursor when fewer rows exist than the page size", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.findMany.mockResolvedValue([ROW]);
    const result = await getPaymentHistoryPageAction();
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it("a supplied cursor is passed through to the query, scoped to the authenticated user", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    await getPaymentHistoryPageAction("pay-19");
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: "pay-19" }, skip: 1 })
    );
  });

  it("maps a payment without a linked booking safely (bookingId nullable), never throwing", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.findMany.mockResolvedValue([{ ...ROW, booking: null }]);
    const result = await getPaymentHistoryPageAction();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.booking).toBeNull();
  });

  it("empty state: zero rows, no error", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    const result = await getPaymentHistoryPageAction();
    expect(result).toEqual({ items: [], nextCursor: null });
  });

  it("never performs a Stripe call, financial mutation, or refund-policy recomputation — the module only ever reads", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(new URL("./paymentHistory.ts", import.meta.url), "utf-8");
    expect(source).not.toMatch(/from ["']stripe["']|cancellationPolicy|calculateCancellationRefund|\.(update|create|delete|updateMany|deleteMany)\(/);
  });
});
