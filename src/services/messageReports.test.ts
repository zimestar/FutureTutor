import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

// MESSAGING-MVP1C — messageReports.ts. Authorization is delegated to
// canReadConversation (already covered by its own dedicated test suite),
// mocked here so these tests focus on report creation/duplicate handling/
// self-report denial, the admin queue query shape, bounded context, and
// the status workflow's legal-transition guard.

const mocks = vi.hoisted(() => ({
  canReadConversation: vi.fn(),
  writeAuditLog: vi.fn(),
  messageFindUnique: vi.fn(),
  messageFindUniqueOrThrow: vi.fn(),
  messageFindMany: vi.fn(),
  messageReportCreate: vi.fn(),
  messageReportFindUnique: vi.fn(),
  messageReportFindMany: vi.fn(),
  messageReportUpdateMany: vi.fn(),
  parentStudentRelationshipFindMany: vi.fn(),
}));

vi.mock("@/services/messagingAuthorization", () => ({ canReadConversation: mocks.canReadConversation }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("@/lib/db", () => ({
  db: {
    message: { findUnique: mocks.messageFindUnique, findUniqueOrThrow: mocks.messageFindUniqueOrThrow, findMany: mocks.messageFindMany },
    messageReport: {
      create: mocks.messageReportCreate,
      findUnique: mocks.messageReportFindUnique,
      findMany: mocks.messageReportFindMany,
      updateMany: mocks.messageReportUpdateMany,
    },
    parentStudentRelationship: { findMany: mocks.parentStudentRelationshipFindMany },
  },
}));

import { createMessageReport, getMessageReportDetail, listMessageReports, updateMessageReportStatus } from "./messageReports";

const REPORTER = "reporter-1";
const SENDER = "sender-1";
const MESSAGE_ID = "msg-1";
const CONVERSATION_ID = "conv-1";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.canReadConversation.mockResolvedValue(true);
  mocks.messageFindUnique.mockResolvedValue({ id: MESSAGE_ID, conversationId: CONVERSATION_ID, senderUserId: SENDER });
  mocks.messageReportCreate.mockResolvedValue({ id: "report-1" });
  mocks.messageReportFindUnique.mockResolvedValue(null);
  mocks.messageReportFindMany.mockResolvedValue([]);
  mocks.messageReportUpdateMany.mockResolvedValue({ count: 1 });
  mocks.parentStudentRelationshipFindMany.mockResolvedValue([]);
});

describe("createMessageReport", () => {
  it("item 18 — an authorized participant can report another's message", async () => {
    const result = await createMessageReport(REPORTER, { messageId: MESSAGE_ID, reason: "SPAM" });
    expect(result).toEqual({ ok: true, reportId: "report-1", alreadyReported: false });
  });

  it("item 19 — an unrelated user (no read access) is denied", async () => {
    mocks.canReadConversation.mockResolvedValue(false);
    const result = await createMessageReport(REPORTER, { messageId: MESSAGE_ID, reason: "SPAM" });
    expect(result).toEqual({ ok: false, reason: "NOT_AUTHORIZED" });
    expect(mocks.messageReportCreate).not.toHaveBeenCalled();
  });

  it("item 20 — a revoked guardian (canReadConversation false) is denied identically to any other unauthorized actor", async () => {
    mocks.canReadConversation.mockResolvedValue(false);
    const result = await createMessageReport("revoked-guardian", { messageId: MESSAGE_ID, reason: "SAFETY_CONCERN" });
    expect(result.ok).toBe(false);
  });

  it("item 21 — reporterUserId always comes from the function's own actor parameter, never a field in the input object", async () => {
    await createMessageReport(REPORTER, { messageId: MESSAGE_ID, reason: "SPAM" });
    expect(mocks.messageReportCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reporterUserId: REPORTER }) }));
  });

  it("item 22 — conversationId is always resolved from the loaded Message, never trusted from client input (createMessageReport accepts no conversationId parameter at all)", async () => {
    await createMessageReport(REPORTER, { messageId: MESSAGE_ID, reason: "SPAM" });
    expect(mocks.messageReportCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ conversationId: CONVERSATION_ID }) }));
  });

  it("a nonexistent messageId is rejected safely", async () => {
    mocks.messageFindUnique.mockResolvedValue(null);
    const result = await createMessageReport(REPORTER, { messageId: "does-not-exist", reason: "SPAM" });
    expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });
  });

  it("item 23 — a user cannot report their own sent message", async () => {
    const result = await createMessageReport(SENDER, { messageId: MESSAGE_ID, reason: "SPAM" });
    expect(result).toEqual({ ok: false, reason: "SELF_REPORT" });
    expect(mocks.messageReportCreate).not.toHaveBeenCalled();
  });

  it("item 24 — a duplicate report by the same user for the same message is treated as idempotent, not an error", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
    mocks.messageReportCreate.mockRejectedValue(p2002);
    mocks.messageReportFindUnique.mockResolvedValue({ id: "existing-report" });

    const result = await createMessageReport(REPORTER, { messageId: MESSAGE_ID, reason: "SPAM" });
    expect(result).toEqual({ ok: true, reportId: "existing-report", alreadyReported: true });
  });

  it("item 25 — different participants may each independently report the same message", async () => {
    const a = await createMessageReport(REPORTER, { messageId: MESSAGE_ID, reason: "SPAM" });
    mocks.messageReportCreate.mockResolvedValue({ id: "report-2" });
    const b = await createMessageReport("another-participant", { messageId: MESSAGE_ID, reason: "HARASSMENT" });
    expect(a.ok && b.ok).toBe(true);
  });

  it("item 26 — every approved reason is accepted", async () => {
    for (const reason of ["INAPPROPRIATE_CONTENT", "HARASSMENT", "OFF_PLATFORM_REQUEST", "SAFETY_CONCERN", "SPAM", "OTHER"]) {
      const result = await createMessageReport(REPORTER, { messageId: MESSAGE_ID, reason });
      expect(result.ok).toBe(true);
    }
  });

  it("item 27 — an invalid reason is rejected", async () => {
    const result = await createMessageReport(REPORTER, { messageId: MESSAGE_ID, reason: "NOT_A_REAL_REASON" });
    expect(result).toEqual({ ok: false, reason: "VALIDATION" });
    expect(mocks.messageReportCreate).not.toHaveBeenCalled();
  });

  it("item 28 — an over-length detail is rejected", async () => {
    const result = await createMessageReport(REPORTER, { messageId: MESSAGE_ID, reason: "OTHER", detail: "a".repeat(1001) });
    expect(result).toEqual({ ok: false, reason: "VALIDATION" });
  });

  it("a detail at exactly the boundary is accepted", async () => {
    const result = await createMessageReport(REPORTER, { messageId: MESSAGE_ID, reason: "OTHER", detail: "a".repeat(1000) });
    expect(result.ok).toBe(true);
  });

  it("item 29 — report creation writes AuditLog with actor/report/message/conversation/reason", async () => {
    await createMessageReport(REPORTER, { messageId: MESSAGE_ID, reason: "HARASSMENT" });
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: REPORTER,
        action: "message_report.created",
        entityType: "MessageReport",
        entityId: "report-1",
        metadata: expect.objectContaining({ messageId: MESSAGE_ID, conversationId: CONVERSATION_ID, reason: "HARASSMENT" }),
      })
    );
  });

  it("item 30 — no message body is ever written into AuditLog metadata", async () => {
    await createMessageReport(REPORTER, { messageId: MESSAGE_ID, reason: "HARASSMENT", detail: "some detail text" });
    const call = mocks.writeAuditLog.mock.calls[0]![0];
    expect(JSON.stringify(call.metadata)).not.toContain("some detail text");
    expect(call.metadata).not.toHaveProperty("body");
    expect(call.metadata).not.toHaveProperty("detail");
  });
});

describe("listMessageReports (admin queue)", () => {
  it("item 37 — bounded and cursor-paginated, never unbounded", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({
      id: `report-${i}`,
      status: "OPEN",
      reason: "SPAM",
      createdAt: new Date(),
      reporter: { name: "Reporter" },
      message: { body: "x", sender: { name: "Sender" } },
      conversation: { studentProfile: { firstName: "Sam" }, tutorProfile: { user: { name: "Matthew Allen" } } },
    }));
    mocks.messageReportFindMany.mockResolvedValue(rows);

    const page = await listMessageReports({});
    expect(mocks.messageReportFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 51 }));
    expect(page.items).toHaveLength(50);
    expect(page.nextCursor).toBe("report-49");
  });

  it("item 38 — filters by status", async () => {
    await listMessageReports({ status: "UNDER_REVIEW" });
    expect(mocks.messageReportFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: "UNDER_REVIEW" }) }));
  });

  it("item 39 — filters by reason", async () => {
    await listMessageReports({ reason: "HARASSMENT" });
    expect(mocks.messageReportFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ reason: "HARASSMENT" }) }));
  });

  it("never exposes the full message body — only a bounded preview", async () => {
    mocks.messageReportFindMany.mockResolvedValue([
      {
        id: "r1",
        status: "OPEN",
        reason: "SPAM",
        createdAt: new Date(),
        reporter: { name: "Reporter" },
        message: { body: "a".repeat(500), sender: { name: "Sender" } },
        conversation: { studentProfile: { firstName: "Sam" }, tutorProfile: { user: { name: "Matthew Allen" } } },
      },
    ]);
    const page = await listMessageReports({});
    expect(page.items[0]!.messagePreview.length).toBeLessThanOrEqual(140);
  });
});

describe("getMessageReportDetail (admin)", () => {
  const ADMIN = "admin-1";
  const REPORT_ROW = {
    id: "report-1",
    status: "OPEN" as const,
    reason: "SPAM" as const,
    detail: null,
    createdAt: new Date("2026-09-05T00:00:00.000Z"),
    resolvedAt: null,
    resolvedByUser: null,
    reporter: { name: "Reporter" },
    messageId: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    message: { createdAt: new Date("2026-09-05T00:00:00.000Z") },
    conversation: {
      studentProfileId: "student-1",
      studentProfile: { firstName: "Sam" },
      tutorProfile: { user: { name: "Matthew Allen" } },
    },
  };

  function contextMessage(id: string, offsetMinutes: number) {
    return {
      id,
      senderUserId: "someone",
      body: `message ${id}`,
      createdAt: new Date(REPORT_ROW.message.createdAt.getTime() + offsetMinutes * 60_000),
      sender: { name: "Someone" },
    };
  }

  beforeEach(() => {
    mocks.messageReportFindUnique.mockResolvedValue(REPORT_ROW);
    mocks.messageFindUniqueOrThrow.mockResolvedValue(contextMessage(MESSAGE_ID, 0));
    mocks.messageFindMany.mockResolvedValue([]);
  });

  it("returns null for a nonexistent report", async () => {
    mocks.messageReportFindUnique.mockResolvedValue(null);
    expect(await getMessageReportDetail(ADMIN, "does-not-exist")).toBeNull();
  });

  it("item 40 — the reported message is flagged distinctly from context messages", async () => {
    const detail = await getMessageReportDetail(ADMIN, "report-1");
    const flagged = detail!.context.filter((m) => m.isReportedMessage);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]!.id).toBe(MESSAGE_ID);
  });

  it("item 41 — context is bounded to at most 5 before and 5 after (never the full conversation)", async () => {
    await getMessageReportDetail(ADMIN, "report-1");
    const beforeCall = mocks.messageFindMany.mock.calls.find((c) => c[0].where.createdAt?.lt);
    const afterCall = mocks.messageFindMany.mock.calls.find((c) => c[0].where.createdAt?.gt);
    expect(beforeCall![0].take).toBe(5);
    expect(afterCall![0].take).toBe(5);
  });

  it("item 42 — a successful view writes AuditLog (admin.conversation_viewed), scoped to admin + reportId + conversationId, never message content", async () => {
    await getMessageReportDetail(ADMIN, "report-1");
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: ADMIN,
        action: "admin.conversation_viewed",
        entityType: "MessageReport",
        entityId: "report-1",
        metadata: { conversationId: CONVERSATION_ID },
      })
    );
  });

  it("item 43 — no message content appears anywhere in the AuditLog call", async () => {
    mocks.messageFindUniqueOrThrow.mockResolvedValue(contextMessage(MESSAGE_ID, 0));
    await getMessageReportDetail(ADMIN, "report-1");
    const call = mocks.writeAuditLog.mock.calls[0]![0];
    expect(JSON.stringify(call)).not.toContain(`message ${MESSAGE_ID}`);
  });
});

describe("updateMessageReportStatus (admin workflow)", () => {
  const ADMIN = "admin-1";

  it("item 44 — OPEN -> UNDER_REVIEW is legal", async () => {
    mocks.messageReportFindUnique.mockResolvedValue({ status: "OPEN" });
    const result = await updateMessageReportStatus(ADMIN, "report-1", "UNDER_REVIEW");
    expect(result).toEqual({ ok: true });
    expect(mocks.messageReportUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "report-1", status: "OPEN" }, data: expect.objectContaining({ status: "UNDER_REVIEW" }) })
    );
  });

  it("item 45 — UNDER_REVIEW -> RESOLVED is legal and stamps resolvedAt/resolvedByUserId", async () => {
    mocks.messageReportFindUnique.mockResolvedValue({ status: "UNDER_REVIEW" });
    const result = await updateMessageReportStatus(ADMIN, "report-1", "RESOLVED");
    expect(result).toEqual({ ok: true });
    expect(mocks.messageReportUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "RESOLVED", resolvedByUserId: ADMIN, resolvedAt: expect.any(Date) }) })
    );
  });

  it("OPEN -> RESOLVED is also legal", async () => {
    mocks.messageReportFindUnique.mockResolvedValue({ status: "OPEN" });
    const result = await updateMessageReportStatus(ADMIN, "report-1", "RESOLVED");
    expect(result).toEqual({ ok: true });
  });

  it("RESOLVED -> anything is illegal (terminal state)", async () => {
    mocks.messageReportFindUnique.mockResolvedValue({ status: "RESOLVED" });
    const result = await updateMessageReportStatus(ADMIN, "report-1", "UNDER_REVIEW");
    expect(result).toEqual({ ok: false, reason: "ILLEGAL_TRANSITION" });
    expect(mocks.messageReportUpdateMany).not.toHaveBeenCalled();
  });

  it("UNDER_REVIEW -> OPEN (backwards) is illegal", async () => {
    mocks.messageReportFindUnique.mockResolvedValue({ status: "UNDER_REVIEW" });
    const result = await updateMessageReportStatus(ADMIN, "report-1", "OPEN");
    expect(result).toEqual({ ok: false, reason: "ILLEGAL_TRANSITION" });
  });

  it("a nonexistent report is reported as not found", async () => {
    mocks.messageReportFindUnique.mockResolvedValue(null);
    const result = await updateMessageReportStatus(ADMIN, "does-not-exist", "RESOLVED");
    expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });
  });

  it("item 46 — every legal transition writes AuditLog with from/to status", async () => {
    mocks.messageReportFindUnique.mockResolvedValue({ status: "OPEN" });
    await updateMessageReportStatus(ADMIN, "report-1", "UNDER_REVIEW");
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: ADMIN,
        action: "message_report.status_changed",
        entityType: "MessageReport",
        entityId: "report-1",
        metadata: { fromStatus: "OPEN", toStatus: "UNDER_REVIEW" },
      })
    );
  });

  it("a lost race (status changed underneath) is reported as an illegal transition, not a silent success", async () => {
    mocks.messageReportFindUnique.mockResolvedValue({ status: "OPEN" });
    mocks.messageReportUpdateMany.mockResolvedValue({ count: 0 });
    const result = await updateMessageReportStatus(ADMIN, "report-1", "UNDER_REVIEW");
    expect(result).toEqual({ ok: false, reason: "ILLEGAL_TRANSITION" });
  });
});

describe("item 47/48/49 — no admin send-as-user/edit/delete capability exists in this module", () => {
  it("never imports or exposes an admin send/edit/delete function", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(new URL("./messageReports.ts", import.meta.url), "utf-8");
    const sourceWithoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(sourceWithoutComments).not.toMatch(/sendAsUser|editMessage|deleteMessage|impersonate/i);
    const moduleExports = await import("./messageReports");
    expect(Object.keys(moduleExports)).not.toContain("sendMessageAsUser");
    expect(Object.keys(moduleExports)).not.toContain("deleteMessage");
    expect(Object.keys(moduleExports)).not.toContain("editMessage");
  });

  it("item 56 — never touches financial models or calls Stripe", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(new URL("./messageReports.ts", import.meta.url), "utf-8");
    expect(source.toLowerCase()).not.toMatch(/stripe|payment\.|refund\.|tutorearning\.|tutortransfer\./);
  });
});
