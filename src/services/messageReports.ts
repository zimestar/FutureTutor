import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { MessageReportReason, MessageReportStatus } from "@/generated/prisma/enums";
import { canReadConversation } from "@/services/messagingAuthorization";
import { writeAuditLog } from "@/lib/audit";
import { createMessageReportSchema } from "@/schemas/messageReports";

/**
 * MESSAGING-MVP1C — message reporting. reporterUserId is always the
 * authenticated caller; a client-supplied messageId is used purely as a
 * lookup key — access to the message's OWN Conversation is re-verified via
 * canReadConversation (the exact same fail-closed gate the messaging
 * domain service itself uses), so guessing a messageId from an unrelated
 * conversation never grants anything.
 */

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export type CreateMessageReportResult =
  | { ok: true; reportId: string; alreadyReported: boolean }
  | { ok: false; reason: "VALIDATION" | "NOT_FOUND" | "NOT_AUTHORIZED" | "SELF_REPORT" };

export async function createMessageReport(
  actorUserId: string,
  input: { messageId: string; reason: string; detail?: string }
): Promise<CreateMessageReportResult> {
  const parsed = createMessageReportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "VALIDATION" };

  const message = await db.message.findUnique({
    where: { id: parsed.data.messageId },
    select: { id: true, conversationId: true, senderUserId: true },
  });
  if (!message) return { ok: false, reason: "NOT_FOUND" };

  // No safety value in self-reporting; only admin-queue noise.
  if (message.senderUserId === actorUserId) return { ok: false, reason: "SELF_REPORT" };

  const authorized = await canReadConversation(db, actorUserId, message.conversationId);
  if (!authorized) return { ok: false, reason: "NOT_AUTHORIZED" };

  try {
    const report = await db.messageReport.create({
      data: {
        messageId: message.id,
        conversationId: message.conversationId,
        reporterUserId: actorUserId,
        reason: parsed.data.reason as MessageReportReason,
        detail: parsed.data.detail,
      },
    });

    // Reason only — never the message body, never the reporter's optional
    // detail text (still PII-adjacent free text), matching the mission's
    // explicit "do NOT put message body in AuditLog" instruction, extended
    // to the report's own free-text detail for the same reason.
    await writeAuditLog({
      actorUserId,
      action: "message_report.created",
      entityType: "MessageReport",
      entityId: report.id,
      metadata: { messageId: message.id, conversationId: message.conversationId, reason: parsed.data.reason },
    });

    return { ok: true, reportId: report.id, alreadyReported: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // @@unique([messageId, reporterUserId]) — the same user reporting the
      // same message again is treated as an idempotent no-op, not an error.
      const existing = await db.messageReport.findUnique({
        where: { messageId_reporterUserId: { messageId: message.id, reporterUserId: actorUserId } },
        select: { id: true },
      });
      if (existing) return { ok: true, reportId: existing.id, alreadyReported: true };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Admin queue — list
// ---------------------------------------------------------------------------

const REPORT_PAGE_LIMIT = 50;

export interface MessageReportListFilters {
  status?: MessageReportStatus;
  reason?: MessageReportReason;
  from?: Date;
  to?: Date;
}

export interface MessageReportListItem {
  id: string;
  status: MessageReportStatus;
  reason: MessageReportReason;
  createdAt: Date;
  reporterName: string;
  reportedSenderName: string;
  studentFirstName: string;
  tutorFirstName: string;
  messagePreview: string;
}

export interface MessageReportListPage {
  items: MessageReportListItem[];
  nextCursor: string | null;
}

/** Caller (the admin page) is responsible for the hasAdminPermission gate
 * — this function itself performs no admin check, matching the same
 * separation the rest of this codebase's admin pages use (page-level
 * guard, not embedded in every domain function). */
export async function listMessageReports(filters: MessageReportListFilters, cursor?: string | null): Promise<MessageReportListPage> {
  const rows = await db.messageReport.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.reason ? { reason: filters.reason } : {}),
      ...(filters.from || filters.to
        ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: REPORT_PAGE_LIMIT + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      status: true,
      reason: true,
      createdAt: true,
      reporter: { select: { name: true } },
      message: { select: { body: true, sender: { select: { name: true } } } },
      conversation: {
        select: {
          studentProfile: { select: { firstName: true } },
          tutorProfile: { select: { user: { select: { name: true } } } },
        },
      },
    },
  });

  const hasMore = rows.length > REPORT_PAGE_LIMIT;
  const page = hasMore ? rows.slice(0, REPORT_PAGE_LIMIT) : rows;

  return {
    items: page.map((row) => ({
      id: row.id,
      status: row.status,
      reason: row.reason,
      createdAt: row.createdAt,
      reporterName: row.reporter.name ?? "",
      reportedSenderName: row.message.sender.name ?? "",
      studentFirstName: row.conversation.studentProfile.firstName,
      tutorFirstName: row.conversation.tutorProfile.user.name?.split(" ")[0] ?? "",
      messagePreview: row.message.body.slice(0, 140),
    })),
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
  };
}

// ---------------------------------------------------------------------------
// Admin queue — detail (bounded conversation context)
// ---------------------------------------------------------------------------

const CONTEXT_MESSAGES_BEFORE = 5;
const CONTEXT_MESSAGES_AFTER = 5;

export interface MessageReportContextMessage {
  id: string;
  senderUserId: string;
  senderName: string;
  body: string;
  createdAt: Date;
  isReportedMessage: boolean;
}

export interface MessageReportDetail {
  id: string;
  status: MessageReportStatus;
  reason: MessageReportReason;
  detail: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedByName: string | null;
  reporterName: string;
  studentFirstName: string;
  tutorFirstName: string;
  guardianFirstNames: string[];
  /** A BOUNDED window around the reported message (5 before / 5 after) —
   * never the full lifetime conversation history. No "load more" this
   * phase; a fixed bounded window is enough for a safety review and avoids
   * the admin view polling/paging over private message content. */
  context: MessageReportContextMessage[];
}

/**
 * Writes admin.conversation_viewed to AuditLog exactly once per call — one
 * meaningful server page load, never per client poll (this page does not
 * poll). Never writes message content into AuditLog, only the report id
 * and conversation id.
 */
export async function getMessageReportDetail(adminUserId: string, reportId: string): Promise<MessageReportDetail | null> {
  const report = await db.messageReport.findUnique({
    where: { id: reportId },
    select: {
      id: true,
      status: true,
      reason: true,
      detail: true,
      createdAt: true,
      resolvedAt: true,
      resolvedByUser: { select: { name: true } },
      reporter: { select: { name: true } },
      messageId: true,
      conversationId: true,
      message: { select: { createdAt: true } },
      conversation: {
        select: {
          studentProfileId: true,
          studentProfile: { select: { firstName: true } },
          tutorProfile: { select: { user: { select: { name: true } } } },
        },
      },
    },
  });
  if (!report) return null;

  const messageSelect = {
    id: true,
    senderUserId: true,
    body: true,
    createdAt: true,
    sender: { select: { name: true } },
  } as const;

  const [reportedMessage, before, after, guardians] = await Promise.all([
    db.message.findUniqueOrThrow({ where: { id: report.messageId }, select: messageSelect }),
    db.message.findMany({
      where: { conversationId: report.conversationId, createdAt: { lt: report.message.createdAt } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: CONTEXT_MESSAGES_BEFORE,
      select: messageSelect,
    }),
    db.message.findMany({
      where: { conversationId: report.conversationId, createdAt: { gt: report.message.createdAt } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: CONTEXT_MESSAGES_AFTER,
      select: messageSelect,
    }),
    db.parentStudentRelationship.findMany({
      where: { studentProfileId: report.conversation.studentProfileId, status: "ACTIVE" },
      select: { parentProfile: { select: { firstName: true } } },
    }),
  ]);

  const toContextMessage = (m: typeof reportedMessage, isReportedMessage: boolean): MessageReportContextMessage => ({
    id: m.id,
    senderUserId: m.senderUserId,
    senderName: m.sender.name ?? "",
    body: m.body,
    createdAt: m.createdAt,
    isReportedMessage,
  });

  const context: MessageReportContextMessage[] = [
    ...before.slice().reverse().map((m) => toContextMessage(m, false)),
    toContextMessage(reportedMessage, true),
    ...after.map((m) => toContextMessage(m, false)),
  ];

  await writeAuditLog({
    actorUserId: adminUserId,
    action: "admin.conversation_viewed",
    entityType: "MessageReport",
    entityId: reportId,
    metadata: { conversationId: report.conversationId },
  });

  return {
    id: report.id,
    status: report.status,
    reason: report.reason,
    detail: report.detail,
    createdAt: report.createdAt,
    resolvedAt: report.resolvedAt,
    resolvedByName: report.resolvedByUser?.name ?? null,
    reporterName: report.reporter.name ?? "",
    studentFirstName: report.conversation.studentProfile.firstName,
    tutorFirstName: report.conversation.tutorProfile.user.name?.split(" ")[0] ?? "",
    guardianFirstNames: guardians.map((g) => g.parentProfile.firstName),
    context,
  };
}

// ---------------------------------------------------------------------------
// Admin queue — status workflow
// ---------------------------------------------------------------------------

const LEGAL_TRANSITIONS: Record<MessageReportStatus, MessageReportStatus[]> = {
  OPEN: ["UNDER_REVIEW", "RESOLVED"],
  UNDER_REVIEW: ["RESOLVED"],
  RESOLVED: [],
};

export type UpdateReportStatusResult = { ok: true } | { ok: false; reason: "NOT_FOUND" | "ILLEGAL_TRANSITION" };

/**
 * Minimal workflow only: OPEN -> UNDER_REVIEW, UNDER_REVIEW -> RESOLVED,
 * OPEN -> RESOLVED. No delete/edit/impersonate/send-as-user/ban/suspend/
 * refund capability exists anywhere in this module — status is the only
 * thing an admin can change here.
 */
export async function updateMessageReportStatus(
  adminUserId: string,
  reportId: string,
  newStatus: MessageReportStatus
): Promise<UpdateReportStatusResult> {
  const report = await db.messageReport.findUnique({ where: { id: reportId }, select: { status: true } });
  if (!report) return { ok: false, reason: "NOT_FOUND" };

  if (!LEGAL_TRANSITIONS[report.status].includes(newStatus)) return { ok: false, reason: "ILLEGAL_TRANSITION" };

  const updated = await db.messageReport.updateMany({
    where: { id: reportId, status: report.status },
    data: {
      status: newStatus,
      ...(newStatus === "RESOLVED" ? { resolvedAt: new Date(), resolvedByUserId: adminUserId } : {}),
    },
  });
  if (updated.count === 0) return { ok: false, reason: "ILLEGAL_TRANSITION" }; // lost a race — status changed underneath us

  await writeAuditLog({
    actorUserId: adminUserId,
    action: "message_report.status_changed",
    entityType: "MessageReport",
    entityId: reportId,
    metadata: { fromStatus: report.status, toStatus: newStatus },
  });

  return { ok: true };
}
