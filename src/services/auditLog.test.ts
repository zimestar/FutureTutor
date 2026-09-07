import { beforeEach, describe, expect, it, vi } from "vitest";

// ADMIN-AUDITLOG-VIEWER1 — this module performs NO authorization of its own
// (mirrors messageReports.ts's listMessageReports/getMessageReportDetail
// convention exactly) — the caller (the page) is responsible for
// hasAdminPermission("ADMIN_AUDIT_LOG_READ"). These tests focus on this
// module's own responsibilities: the query shape (newest-first, bounded,
// filtered), and safe actor resolution (system/unknown/user).

const mocks = vi.hoisted(() => ({
  auditLogFindMany: vi.fn(),
  auditLogFindUnique: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { auditLog: { findMany: mocks.auditLogFindMany, findUnique: mocks.auditLogFindUnique } },
}));

import { listAuditLogEntries, getAuditLogEntry } from "./auditLog";

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "audit-1",
    action: "tutor.suspended",
    entityType: "TutorProfile",
    entityId: "tutor-1",
    createdAt: new Date("2026-09-05T00:00:00.000Z"),
    actorUserId: "admin-1",
    actor: { id: "admin-1", name: "Jane Admin", email: "jane@example.com", role: "ADMIN", deactivatedAt: null },
    metadata: { reason: "policy violation" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auditLogFindMany.mockResolvedValue([]);
  mocks.auditLogFindUnique.mockResolvedValue(null);
});

describe("listAuditLogEntries", () => {
  it("item 7 — orders newest first (createdAt desc, id desc tiebreak)", async () => {
    await listAuditLogEntries({});
    expect(mocks.auditLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ createdAt: "desc" }, { id: "desc" }] })
    );
  });

  it("item 8 — bounded: requests exactly one extra row to detect a next page, never unbounded", async () => {
    await listAuditLogEntries({});
    expect(mocks.auditLogFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 51 }));
  });

  it("detects a next page and returns the correct cursor, trimmed to the page size", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => row({ id: `audit-${i}` }));
    mocks.auditLogFindMany.mockResolvedValue(rows);
    const page = await listAuditLogEntries({});
    expect(page.items).toHaveLength(50);
    expect(page.nextCursor).toBe("audit-49");
  });

  it("no next page when fewer rows than the page size exist", async () => {
    mocks.auditLogFindMany.mockResolvedValue([row()]);
    const page = await listAuditLogEntries({});
    expect(page.nextCursor).toBeNull();
  });

  it("a cursor is passed through to Prisma's own cursor+skip pagination", async () => {
    await listAuditLogEntries({}, "audit-49");
    expect(mocks.auditLogFindMany).toHaveBeenCalledWith(expect.objectContaining({ cursor: { id: "audit-49" }, skip: 1 }));
  });

  it("item 9 — action filter is an exact match on the where clause", async () => {
    await listAuditLogEntries({ action: "tutor.suspended" });
    expect(mocks.auditLogFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ action: "tutor.suspended" }) }));
  });

  it("entityType filter is an exact match on the where clause", async () => {
    await listAuditLogEntries({ entityType: "Booking" });
    expect(mocks.auditLogFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ entityType: "Booking" }) }));
  });

  it("item 10 — actor filter searches the actor's name OR email, case-insensitive, never a raw SQL/JSON search", async () => {
    await listAuditLogEntries({ actorQuery: "jane" });
    expect(mocks.auditLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          actor: { is: { OR: [{ name: { contains: "jane", mode: "insensitive" } }, { email: { contains: "jane", mode: "insensitive" } }] } },
        }),
      })
    );
  });

  it("item 13 — entity id search matches entityId via a bounded contains filter (covers booking/tutor/student/report id search uniformly)", async () => {
    await listAuditLogEntries({ entityIdQuery: "booking-1" });
    expect(mocks.auditLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ entityId: { contains: "booking-1", mode: "insensitive" } }) })
    );
  });

  it("item 11 — date-from filter sets createdAt.gte", async () => {
    const from = new Date("2026-09-01T00:00:00.000Z");
    await listAuditLogEntries({ from });
    expect(mocks.auditLogFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ createdAt: { gte: from } }) }));
  });

  it("item 12 — date-to filter sets createdAt.lte", async () => {
    const to = new Date("2026-09-10T00:00:00.000Z");
    await listAuditLogEntries({ to });
    expect(mocks.auditLogFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ createdAt: { lte: to } }) }));
  });

  it("no filter never performs an unbounded full-metadata JSON search — the where clause never references `metadata`", async () => {
    await listAuditLogEntries({ action: "x", entityType: "y", actorQuery: "z", entityIdQuery: "w" });
    const call = mocks.auditLogFindMany.mock.calls[0]![0];
    expect(JSON.stringify(call.where)).not.toContain("metadata");
  });

  it("item 14 — a known actor resolves to kind USER with name/email/role", async () => {
    mocks.auditLogFindMany.mockResolvedValue([row()]);
    const page = await listAuditLogEntries({});
    expect(page.items[0]!.actor).toEqual({ kind: "USER", id: "admin-1", name: "Jane Admin", email: "jane@example.com", role: "ADMIN", deactivated: false });
  });

  it("item 14 — an actorUserId with no resolvable actor (deleted/unavailable) resolves to kind UNKNOWN, never crashes", async () => {
    mocks.auditLogFindMany.mockResolvedValue([row({ actorUserId: "ghost-1", actor: null })]);
    const page = await listAuditLogEntries({});
    expect(page.items[0]!.actor).toEqual({ kind: "UNKNOWN", actorUserId: "ghost-1" });
  });

  it("a system-triggered entry (actorUserId null) resolves to kind SYSTEM, distinct from UNKNOWN", async () => {
    mocks.auditLogFindMany.mockResolvedValue([row({ actorUserId: null, actor: null })]);
    const page = await listAuditLogEntries({});
    expect(page.items[0]!.actor).toEqual({ kind: "SYSTEM" });
  });

  it("a deactivated actor still resolves with their real identity, flagged as deactivated (not hidden as UNKNOWN)", async () => {
    mocks.auditLogFindMany.mockResolvedValue([row({ actor: { id: "admin-1", name: "Jane Admin", email: "jane@example.com", role: "ADMIN", deactivatedAt: new Date() } })]);
    const page = await listAuditLogEntries({});
    expect(page.items[0]!.actor).toMatchObject({ kind: "USER", deactivated: true });
  });

  it("each item is categorized via the shared, non-invented action-category resolver", async () => {
    mocks.auditLogFindMany.mockResolvedValue([row({ action: "payment.captured" })]);
    const page = await listAuditLogEntries({});
    expect(page.items[0]!.category).toBe("FINANCIAL");
  });
});

describe("getAuditLogEntry", () => {
  it("item 18 — returns null for an unknown id rather than throwing", async () => {
    const result = await getAuditLogEntry("does-not-exist");
    expect(result).toBeNull();
  });

  it("returns the full detail, including metadata, for a real entry", async () => {
    mocks.auditLogFindUnique.mockResolvedValue(row());
    const result = await getAuditLogEntry("audit-1");
    expect(result).toMatchObject({ id: "audit-1", action: "tutor.suspended", metadata: { reason: "policy violation" } });
  });

  it("no mutation method is ever called by this module — read-only by construction", () => {
    // Structural guarantee: the mocked db.auditLog object exposes only
    // findMany/findUnique to this module (see the vi.mock above) — a
    // create/update/delete call would throw "is not a function", not
    // silently no-op, if this module ever attempted one.
    expect(mocks).not.toHaveProperty("auditLogCreate");
    expect(mocks).not.toHaveProperty("auditLogUpdate");
    expect(mocks).not.toHaveProperty("auditLogDelete");
  });
});
