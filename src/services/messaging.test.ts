import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

// MESSAGING-MVP1A — messaging.ts is the domain service; every authorization
// decision is delegated to messagingAuthorization.ts (already covered by
// its own dedicated test suite), mocked here so these tests focus on THIS
// module's own responsibilities: race-safe get-or-create, message
// validation, senderUserId provenance, transactional lastMessageAt/
// lastReadAt updates, bounded pagination, and idempotent mark-read.

const mocks = vi.hoisted(() => ({
  canParticipateInTutoringConversation: vi.fn(),
  canReadConversation: vi.fn(),
  canSendConversationMessage: vi.fn(),
  hasEligibleTutoringRelationship: vi.fn(),
  resolveParticipantRole: vi.fn(),
  tutorProfileFindUnique: vi.fn(),
  conversationFindUnique: vi.fn(),
  conversationCreate: vi.fn(),
  conversationFindUniqueOrThrow: vi.fn(),
  conversationUpdate: vi.fn(),
  conversationParticipantUpsert: vi.fn(),
  messageCreate: vi.fn(),
  messageFindMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/services/messagingAuthorization", () => ({
  canParticipateInTutoringConversation: mocks.canParticipateInTutoringConversation,
  canReadConversation: mocks.canReadConversation,
  canSendConversationMessage: mocks.canSendConversationMessage,
  hasEligibleTutoringRelationship: mocks.hasEligibleTutoringRelationship,
  resolveParticipantRole: mocks.resolveParticipantRole,
}));

vi.mock("@/lib/db", () => ({
  db: {
    tutorProfile: { findUnique: mocks.tutorProfileFindUnique },
    conversation: {
      findUnique: mocks.conversationFindUnique,
      create: mocks.conversationCreate,
      findUniqueOrThrow: mocks.conversationFindUniqueOrThrow,
      update: mocks.conversationUpdate,
    },
    conversationParticipant: { upsert: mocks.conversationParticipantUpsert },
    message: { create: mocks.messageCreate, findMany: mocks.messageFindMany },
    $transaction: mocks.transaction,
  },
}));

import { ensureConversationAccess, listConversationMessages, markConversationRead, sendMessage } from "./messaging";

const ACTOR = "actor-1";
const STUDENT_ID = "student-1";
const TUTOR_PROFILE_ID = "tutor-profile-1";
const CONVERSATION_ID = "conv-1";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tutorProfileFindUnique.mockResolvedValue({ userId: "some-other-tutor" });
  mocks.canParticipateInTutoringConversation.mockResolvedValue(true);
  mocks.hasEligibleTutoringRelationship.mockResolvedValue(true);
  mocks.conversationFindUnique.mockResolvedValue(null);
  mocks.conversationCreate.mockResolvedValue({ id: CONVERSATION_ID });
  mocks.resolveParticipantRole.mockResolvedValue("STUDENT");
  mocks.conversationParticipantUpsert.mockResolvedValue({});
  mocks.canSendConversationMessage.mockResolvedValue({ ok: true });
  mocks.canReadConversation.mockResolvedValue(true);
  mocks.conversationFindUniqueOrThrow.mockResolvedValue({ studentProfileId: STUDENT_ID, tutorProfileId: TUTOR_PROFILE_ID });
  mocks.messageCreate.mockResolvedValue({ id: "msg-1", conversationId: CONVERSATION_ID, senderUserId: ACTOR, body: "hello", createdAt: new Date() });
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      message: { create: mocks.messageCreate },
      conversation: { update: mocks.conversationUpdate },
      conversationParticipant: { upsert: mocks.conversationParticipantUpsert },
    })
  );
});

describe("ensureConversationAccess (get-or-create)", () => {
  it("item 18 — lazily creates a conversation for an eligible, authorized actor", async () => {
    const result = await ensureConversationAccess(ACTOR, STUDENT_ID, TUTOR_PROFILE_ID);
    expect(result).toEqual({ ok: true, conversationId: CONVERSATION_ID });
    expect(mocks.conversationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { studentProfileId: STUDENT_ID, tutorProfileId: TUTOR_PROFILE_ID } })
    );
  });

  it("returns the existing row instead of creating a duplicate on a second call", async () => {
    mocks.conversationFindUnique.mockResolvedValue({ id: CONVERSATION_ID });
    const result = await ensureConversationAccess(ACTOR, STUDENT_ID, TUTOR_PROFILE_ID);
    expect(result).toEqual({ ok: true, conversationId: CONVERSATION_ID });
    expect(mocks.conversationCreate).not.toHaveBeenCalled();
  });

  it("item 19 — a concurrent-create race (P2002) does not throw or create a duplicate; it re-reads the winning row", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
    mocks.conversationCreate.mockRejectedValue(p2002);
    mocks.conversationFindUniqueOrThrow.mockResolvedValue({ id: CONVERSATION_ID });
    const result = await ensureConversationAccess(ACTOR, STUDENT_ID, TUTOR_PROFILE_ID);
    expect(result).toEqual({ ok: true, conversationId: CONVERSATION_ID });
  });

  it("a non-P2002 error from create still propagates (never silently swallowed)", async () => {
    mocks.conversationCreate.mockRejectedValue(new Error("boom"));
    await expect(ensureConversationAccess(ACTOR, STUDENT_ID, TUTOR_PROFILE_ID)).rejects.toThrow("boom");
  });

  it("an unauthorized actor never causes a conversation to be created", async () => {
    mocks.canParticipateInTutoringConversation.mockResolvedValue(false);
    const result = await ensureConversationAccess(ACTOR, STUDENT_ID, TUTOR_PROFILE_ID);
    expect(result).toEqual({ ok: false, reason: "NOT_AUTHORIZED" });
    expect(mocks.conversationCreate).not.toHaveBeenCalled();
  });

  it("no eligible CONFIRMED-booking relationship blocks creation even for an otherwise-authorized actor", async () => {
    mocks.hasEligibleTutoringRelationship.mockResolvedValue(false);
    const result = await ensureConversationAccess(ACTOR, STUDENT_ID, TUTOR_PROFILE_ID);
    expect(result).toEqual({ ok: false, reason: "NO_ELIGIBLE_RELATIONSHIP" });
    expect(mocks.conversationCreate).not.toHaveBeenCalled();
  });

  it("item 20 — different students with the same tutor resolve to different (studentProfileId, tutorProfileId) pairs, never merged", async () => {
    await ensureConversationAccess(ACTOR, "emma-student-id", TUTOR_PROFILE_ID);
    await ensureConversationAccess(ACTOR, "noah-student-id", TUTOR_PROFILE_ID);
    expect(mocks.conversationCreate).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: { studentProfileId: "emma-student-id", tutorProfileId: TUTOR_PROFILE_ID } }));
    expect(mocks.conversationCreate).toHaveBeenNthCalledWith(2, expect.objectContaining({ data: { studentProfileId: "noah-student-id", tutorProfileId: TUTOR_PROFILE_ID } }));
  });

  it("items 21/22/23 — the SAME (studentProfileId, tutorProfileId) pair always resolves to the SAME existing conversation regardless of subject/mode/booking count", async () => {
    mocks.conversationFindUnique.mockResolvedValue({ id: CONVERSATION_ID });
    const a = await ensureConversationAccess(ACTOR, STUDENT_ID, TUTOR_PROFILE_ID);
    const b = await ensureConversationAccess(ACTOR, STUDENT_ID, TUTOR_PROFILE_ID);
    expect(a).toEqual(b);
    expect(mocks.conversationCreate).not.toHaveBeenCalled();
  });
});

describe("sendMessage", () => {
  it("item 24 — senderUserId is always the authenticated actor, never a parameter the caller could forge", async () => {
    await sendMessage(ACTOR, CONVERSATION_ID, "hello");
    expect(mocks.messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ senderUserId: ACTOR }) })
    );
  });

  it("item 25 — a message at exactly 4000 characters is accepted", async () => {
    const body = "a".repeat(4000);
    const result = await sendMessage(ACTOR, CONVERSATION_ID, body);
    expect(result.ok).toBe(true);
  });

  it("item 26 — a message over 4000 characters is rejected before ever touching the database", async () => {
    const body = "a".repeat(4001);
    const result = await sendMessage(ACTOR, CONVERSATION_ID, body);
    expect(result).toEqual({ ok: false, reason: "VALIDATION" });
    expect(mocks.messageCreate).not.toHaveBeenCalled();
  });

  it("item 27 — an empty-after-trim message is rejected", async () => {
    const result = await sendMessage(ACTOR, CONVERSATION_ID, "   \n\t  ");
    expect(result).toEqual({ ok: false, reason: "VALIDATION" });
    expect(mocks.messageCreate).not.toHaveBeenCalled();
  });

  it("item 28 — internal newlines are preserved (only leading/trailing whitespace is trimmed)", async () => {
    await sendMessage(ACTOR, CONVERSATION_ID, "  line one\nline two  ");
    expect(mocks.messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ body: "line one\nline two" }) })
    );
  });

  it("item 29 — HTML-looking content is stored verbatim as plain text, never stripped/escaped/transformed at the storage layer (escaping is a render-time concern for a future UI, not a storage-layer transformation — double-escaping would corrupt the text)", async () => {
    const body = "<script>alert(1)</script> & <b>bold</b>";
    await sendMessage(ACTOR, CONVERSATION_ID, body);
    expect(mocks.messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ body }) })
    );
  });

  it("unauthorized send is rejected with the specific reason from the authorization layer", async () => {
    mocks.canSendConversationMessage.mockResolvedValue({ ok: false, reason: "OUTSIDE_COMMUNICATION_WINDOW" });
    const result = await sendMessage(ACTOR, CONVERSATION_ID, "hello");
    expect(result).toEqual({ ok: false, reason: "OUTSIDE_COMMUNICATION_WINDOW" });
    expect(mocks.messageCreate).not.toHaveBeenCalled();
  });

  it("item 34 — Conversation.lastMessageAt is updated in the SAME transaction as the message insert", async () => {
    await sendMessage(ACTOR, CONVERSATION_ID, "hello");
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.messageCreate).toHaveBeenCalled();
    expect(mocks.conversationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CONVERSATION_ID }, data: expect.objectContaining({ lastMessageAt: expect.any(Date) }) })
    );
  });

  it("sending marks the sender's own participant row as read up to now (their own unread count stays correct)", async () => {
    await sendMessage(ACTOR, CONVERSATION_ID, "hello");
    expect(mocks.conversationParticipantUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId_userId: { conversationId: CONVERSATION_ID, userId: ACTOR } },
        update: { lastReadAt: expect.any(Date) },
      })
    );
  });

  it("item 30 — no edit/delete/update-body export exists on this module", async () => {
    const moduleExports = await import("./messaging");
    expect(Object.keys(moduleExports)).not.toContain("editMessage");
    expect(Object.keys(moduleExports)).not.toContain("deleteMessage");
    expect(Object.keys(moduleExports)).not.toContain("updateMessage");
  });

  it("item 38 — never touches Payment/Refund/TutorEarning/TutorTransfer/Booking financial state", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(new URL("./messaging.ts", import.meta.url), "utf-8");
    expect(source).not.toMatch(/db\.payment\.|db\.refund\.|db\.tutorEarning\.|db\.tutorTransfer\.|db\.booking\.(update|create|delete)/);
  });

  it("item 36 — never creates a Notification row", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(new URL("./messaging.ts", import.meta.url), "utf-8");
    expect(source).not.toMatch(/notification\.create|notifyUser/);
  });

  it("item 37 — never calls an email provider", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(new URL("./messaging.ts", import.meta.url), "utf-8");
    expect(source.toLowerCase()).not.toMatch(/resend|sendemail|email\.send/);
  });
});

describe("listConversationMessages", () => {
  it("item 33 — requests one extra row to detect a next page, bounded, never unbounded", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({ id: `m${i}`, senderUserId: ACTOR, body: "x", createdAt: new Date() }));
    mocks.messageFindMany.mockResolvedValue(rows);
    const result = await listConversationMessages(ACTOR, CONVERSATION_ID);
    expect(result.ok).toBe(true);
    expect(mocks.messageFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 51 }));
    if (result.ok) {
      expect(result.page.items).toHaveLength(50);
      expect(result.page.nextCursor).toBe("m49");
    }
  });

  it("returns no cursor when fewer rows exist than the page size", async () => {
    mocks.messageFindMany.mockResolvedValue([{ id: "m1", senderUserId: ACTOR, body: "x", createdAt: new Date() }]);
    const result = await listConversationMessages(ACTOR, CONVERSATION_ID);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.page.nextCursor).toBeNull();
  });

  it("item 35 — an unauthorized read is denied without ever querying messages", async () => {
    mocks.canReadConversation.mockResolvedValue(false);
    const result = await listConversationMessages(ACTOR, CONVERSATION_ID);
    expect(result).toEqual({ ok: false, reason: "NOT_AUTHORIZED" });
    expect(mocks.messageFindMany).not.toHaveBeenCalled();
  });
});

describe("markConversationRead", () => {
  it("item 31 — updates only the authenticated actor's own participant row", async () => {
    await markConversationRead(ACTOR, CONVERSATION_ID);
    expect(mocks.conversationParticipantUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conversationId_userId: { conversationId: CONVERSATION_ID, userId: ACTOR } } })
    );
  });

  it("item 32 — calling it twice is idempotent: no error, both calls succeed", async () => {
    const first = await markConversationRead(ACTOR, CONVERSATION_ID);
    const second = await markConversationRead(ACTOR, CONVERSATION_ID);
    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: true });
    expect(mocks.conversationParticipantUpsert).toHaveBeenCalledTimes(2);
  });

  it("an unauthorized actor cannot mark another conversation's participant row read", async () => {
    mocks.canReadConversation.mockResolvedValue(false);
    const result = await markConversationRead(ACTOR, CONVERSATION_ID);
    expect(result).toEqual({ ok: false, reason: "NOT_AUTHORIZED" });
    expect(mocks.conversationParticipantUpsert).not.toHaveBeenCalled();
  });
});
