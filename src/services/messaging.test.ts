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
  studentProfileFindUnique: vi.fn(),
  parentProfileFindUnique: vi.fn(),
  parentStudentRelationshipFindMany: vi.fn(),
  bookingFindMany: vi.fn(),
  bookingFindFirst: vi.fn(),
  conversationFindUnique: vi.fn(),
  conversationFindMany: vi.fn(),
  conversationCreate: vi.fn(),
  conversationFindUniqueOrThrow: vi.fn(),
  conversationUpdate: vi.fn(),
  conversationParticipantUpsert: vi.fn(),
  conversationParticipantFindUnique: vi.fn(),
  messageCreate: vi.fn(),
  messageFindMany: vi.fn(),
  messageFindFirst: vi.fn(),
  messageCount: vi.fn(),
  notificationFindFirst: vi.fn(),
  notificationCreate: vi.fn(),
  notificationUpdate: vi.fn(),
  notificationUpdateMany: vi.fn(),
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
    studentProfile: { findUnique: mocks.studentProfileFindUnique },
    parentProfile: { findUnique: mocks.parentProfileFindUnique },
    parentStudentRelationship: { findMany: mocks.parentStudentRelationshipFindMany },
    booking: { findMany: mocks.bookingFindMany, findFirst: mocks.bookingFindFirst },
    conversation: {
      findUnique: mocks.conversationFindUnique,
      findMany: mocks.conversationFindMany,
      create: mocks.conversationCreate,
      findUniqueOrThrow: mocks.conversationFindUniqueOrThrow,
      update: mocks.conversationUpdate,
    },
    conversationParticipant: { upsert: mocks.conversationParticipantUpsert, findUnique: mocks.conversationParticipantFindUnique },
    message: { create: mocks.messageCreate, findMany: mocks.messageFindMany, findFirst: mocks.messageFindFirst, count: mocks.messageCount },
    notification: {
      findFirst: mocks.notificationFindFirst,
      create: mocks.notificationCreate,
      update: mocks.notificationUpdate,
      updateMany: mocks.notificationUpdateMany,
    },
    $transaction: mocks.transaction,
  },
}));

import {
  ensureConversationAccess,
  getConversationParties,
  getConversationSessionContext,
  listConversationMessages,
  listMyConversations,
  listNewerMessages,
  markConversationRead,
  sendMessage,
} from "./messaging";

const ACTOR = "actor-1";
const STUDENT_ID = "student-1";
const TUTOR_PROFILE_ID = "tutor-profile-1";
const CONVERSATION_ID = "conv-1";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tutorProfileFindUnique.mockResolvedValue({ userId: "some-other-tutor" });
  mocks.studentProfileFindUnique.mockResolvedValue(null);
  mocks.parentProfileFindUnique.mockResolvedValue(null);
  mocks.parentStudentRelationshipFindMany.mockResolvedValue([]);
  mocks.bookingFindMany.mockResolvedValue([]);
  mocks.bookingFindFirst.mockResolvedValue(null);
  mocks.canParticipateInTutoringConversation.mockResolvedValue(true);
  mocks.hasEligibleTutoringRelationship.mockResolvedValue(true);
  mocks.conversationFindUnique.mockResolvedValue(null);
  mocks.conversationFindMany.mockResolvedValue([]);
  mocks.conversationCreate.mockResolvedValue({ id: CONVERSATION_ID });
  mocks.resolveParticipantRole.mockResolvedValue("STUDENT");
  mocks.conversationParticipantUpsert.mockResolvedValue({});
  mocks.conversationParticipantFindUnique.mockResolvedValue(null);
  mocks.canSendConversationMessage.mockResolvedValue({ ok: true });
  mocks.canReadConversation.mockResolvedValue(true);
  mocks.conversationFindUniqueOrThrow.mockResolvedValue({ studentProfileId: STUDENT_ID, tutorProfileId: TUTOR_PROFILE_ID });
  mocks.messageCreate.mockResolvedValue({ id: "msg-1", conversationId: CONVERSATION_ID, senderUserId: ACTOR, body: "hello", createdAt: new Date() });
  mocks.messageFindMany.mockResolvedValue([]);
  mocks.messageFindFirst.mockResolvedValue(null);
  mocks.messageCount.mockResolvedValue(0);
  mocks.notificationFindFirst.mockResolvedValue(null);
  mocks.notificationCreate.mockResolvedValue({});
  mocks.notificationUpdate.mockResolvedValue({});
  mocks.notificationUpdateMany.mockResolvedValue({ count: 0 });
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

  it("MESSAGING-MVP1C — message.new Notification writes are now expected (superseded by the dedicated describe block below); this module still never calls an email provider", async () => {
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

describe("listMyConversations", () => {
  it("item 8/20/28 — a tutor's eligible relationships each produce a separate conversation, newest activity first, never merging different children", async () => {
    mocks.tutorProfileFindUnique.mockImplementation(async ({ where }: { where: { userId?: string; id?: string } }) => {
      if (where.userId === ACTOR) return { id: TUTOR_PROFILE_ID };
      if (where.id === TUTOR_PROFILE_ID) return { userId: ACTOR };
      return null;
    });
    mocks.bookingFindMany.mockResolvedValue([{ studentProfileId: "emma" }, { studentProfileId: "noah" }]);
    mocks.conversationCreate.mockImplementation(async ({ data }: { data: { studentProfileId: string } }) => ({ id: `conv-${data.studentProfileId}` }));
    mocks.resolveParticipantRole.mockResolvedValue("TUTOR");
    mocks.conversationFindMany.mockResolvedValue([
      {
        id: "conv-emma",
        studentProfileId: "emma",
        tutorProfileId: TUTOR_PROFILE_ID,
        lastMessageAt: new Date("2026-09-01T00:00:00.000Z"),
        studentProfile: { firstName: "Emma" },
        tutorProfile: { user: { name: "Matthew Allen" } },
      },
      {
        id: "conv-noah",
        studentProfileId: "noah",
        tutorProfileId: TUTOR_PROFILE_ID,
        lastMessageAt: new Date("2026-09-03T00:00:00.000Z"),
        studentProfile: { firstName: "Noah" },
        tutorProfile: { user: { name: "Matthew Allen" } },
      },
    ]);
    mocks.messageFindFirst.mockResolvedValue({ body: "hello" });

    const result = await listMyConversations(ACTOR);

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe("conv-noah");
    expect(result[1]!.id).toBe("conv-emma");
    expect(mocks.conversationCreate).toHaveBeenCalledTimes(2);
  });

  it("item 10 — no eligible relationship anywhere yields an empty list", async () => {
    const result = await listMyConversations(ACTOR);
    expect(result).toEqual([]);
  });

  it("item 5 — a guardian's eligible child produces a conversation entry, with the guardian's own name attached", async () => {
    mocks.parentProfileFindUnique.mockResolvedValue({ id: "parent-1" });
    mocks.parentStudentRelationshipFindMany.mockImplementation(async ({ where }: { where: { parentProfileId?: string; studentProfileId?: string } }) => {
      if (where.parentProfileId === "parent-1") return [{ studentProfileId: "emma" }];
      if (where.studentProfileId === "emma") return [{ parentProfile: { firstName: "Sarah" } }];
      return [];
    });
    mocks.bookingFindMany.mockResolvedValue([{ tutorProfileId: TUTOR_PROFILE_ID }]);
    mocks.conversationCreate.mockResolvedValue({ id: "conv-emma" });
    mocks.resolveParticipantRole.mockResolvedValue("GUARDIAN");
    mocks.conversationFindMany.mockResolvedValue([
      {
        id: "conv-emma",
        studentProfileId: "emma",
        tutorProfileId: TUTOR_PROFILE_ID,
        lastMessageAt: null,
        studentProfile: { firstName: "Emma" },
        tutorProfile: { user: { name: "Matthew Allen" } },
      },
    ]);

    const result = await listMyConversations(ACTOR);
    expect(result).toHaveLength(1);
    expect(result[0]!.studentFirstName).toBe("Emma");
    expect(result[0]!.tutorFirstName).toBe("Matthew");
  });
});

describe("getConversationParties", () => {
  it("item 9 — SELF_MANAGED: names includes the tutor and the student's own userId", async () => {
    mocks.canReadConversation.mockResolvedValue(true);
    mocks.conversationFindUniqueOrThrow.mockResolvedValue({
      studentProfileId: STUDENT_ID,
      tutorProfileId: TUTOR_PROFILE_ID,
      studentProfile: { firstName: "Sam", userId: "student-user-1", managementMode: "SELF_MANAGED" },
      tutorProfile: { userId: "tutor-user-1", user: { name: "Matthew Allen" } },
    });

    const parties = await getConversationParties(ACTOR, CONVERSATION_ID);
    expect(parties).not.toBeNull();
    expect(parties!.names["tutor-user-1"]).toBe("Matthew");
    expect(parties!.names["student-user-1"]).toBe("Sam");
  });

  it("item 9 — GUARDIAN_MANAGED: names includes ACTIVE guardians, never the student's own userId", async () => {
    mocks.canReadConversation.mockResolvedValue(true);
    mocks.conversationFindUniqueOrThrow.mockResolvedValue({
      studentProfileId: STUDENT_ID,
      tutorProfileId: TUTOR_PROFILE_ID,
      studentProfile: { firstName: "Emma", userId: "emma-restricted-login", managementMode: "GUARDIAN_MANAGED" },
      tutorProfile: { userId: "tutor-user-1", user: { name: "Matthew Allen" } },
    });
    mocks.parentStudentRelationshipFindMany.mockResolvedValue([{ parentProfile: { userId: "guardian-user-1", firstName: "Sarah" } }]);

    const parties = await getConversationParties(ACTOR, CONVERSATION_ID);
    expect(parties!.names["guardian-user-1"]).toBe("Sarah");
    expect(parties!.names["emma-restricted-login"]).toBeUndefined();
  });

  it("item 13 — an unauthorized/nonexistent conversation returns null identically", async () => {
    mocks.canReadConversation.mockResolvedValue(false);
    expect(await getConversationParties(ACTOR, CONVERSATION_ID)).toBeNull();
  });
});

describe("getConversationSessionContext", () => {
  it("item 26 — an upcoming CONFIRMED booking is reported as 'upcoming'", async () => {
    mocks.canReadConversation.mockResolvedValue(true);
    mocks.conversationFindUniqueOrThrow.mockResolvedValue({ studentProfileId: STUDENT_ID, tutorProfileId: TUTOR_PROFILE_ID });
    mocks.bookingFindFirst.mockResolvedValueOnce({
      id: "b1",
      subject: { slug: "math" },
      startAt: new Date("2026-09-10T18:00:00.000Z"),
      endAt: new Date("2026-09-10T19:00:00.000Z"),
      timezone: "America/Edmonton",
    });

    const context = await getConversationSessionContext(ACTOR, CONVERSATION_ID, new Date("2026-09-05T00:00:00.000Z"));
    expect(context).toMatchObject({ kind: "upcoming", subjectSlug: "math" });
  });

  it("item 27 — no upcoming booking but a recently-ended one is reported as 'recent'", async () => {
    mocks.canReadConversation.mockResolvedValue(true);
    mocks.conversationFindUniqueOrThrow.mockResolvedValue({ studentProfileId: STUDENT_ID, tutorProfileId: TUTOR_PROFILE_ID });
    mocks.bookingFindFirst.mockResolvedValueOnce(null);
    mocks.bookingFindFirst.mockResolvedValueOnce({
      id: "b0",
      subject: { slug: "physics" },
      startAt: new Date("2026-09-03T17:00:00.000Z"),
      endAt: new Date("2026-09-03T18:00:00.000Z"),
      timezone: "America/Edmonton",
    });

    const context = await getConversationSessionContext(ACTOR, CONVERSATION_ID, new Date("2026-09-05T00:00:00.000Z"));
    expect(context).toMatchObject({ kind: "recent", subjectSlug: "physics" });
  });

  it("no CONFIRMED booking at all is reported as 'none'", async () => {
    mocks.canReadConversation.mockResolvedValue(true);
    mocks.conversationFindUniqueOrThrow.mockResolvedValue({ studentProfileId: STUDENT_ID, tutorProfileId: TUTOR_PROFILE_ID });
    const context = await getConversationSessionContext(ACTOR, CONVERSATION_ID);
    expect(context).toMatchObject({ kind: "none", bookingId: null });
  });

  it("an unauthorized actor gets null, never a session context leak", async () => {
    mocks.canReadConversation.mockResolvedValue(false);
    expect(await getConversationSessionContext(ACTOR, CONVERSATION_ID)).toBeNull();
  });
});

describe("listNewerMessages (polling)", () => {
  it("item 29 — returns only messages strictly newer than the given timestamp, ascending", async () => {
    const after = new Date("2026-09-05T12:00:00.000Z");
    mocks.messageFindMany.mockResolvedValue([{ id: "m2", senderUserId: "tutor-user-1", body: "hi", createdAt: new Date("2026-09-05T12:00:05.000Z") }]);

    const result = await listNewerMessages(ACTOR, CONVERSATION_ID, after);
    expect(result.ok).toBe(true);
    expect(mocks.messageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conversationId: CONVERSATION_ID, createdAt: { gt: after } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })
    );
  });

  it("is bounded (take is set, never unbounded)", async () => {
    await listNewerMessages(ACTOR, CONVERSATION_ID, new Date());
    expect(mocks.messageFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: expect.any(Number) }));
  });

  it("an unauthorized actor gets nothing from polling", async () => {
    mocks.canReadConversation.mockResolvedValue(false);
    const result = await listNewerMessages(ACTOR, CONVERSATION_ID, new Date());
    expect(result).toEqual({ ok: false, reason: "NOT_AUTHORIZED" });
    expect(mocks.messageFindMany).not.toHaveBeenCalled();
  });
});

describe("sendMessage — message.new Notification integration", () => {
  const TUTOR_USER_ID = "tutor-user-1";
  const STUDENT_USER_ID = "student-user-1";
  const GUARDIAN_A = "guardian-user-a";
  const GUARDIAN_B = "guardian-user-b";

  function selfManagedConversationRow() {
    return {
      studentProfileId: STUDENT_ID,
      tutorProfileId: TUTOR_PROFILE_ID,
      studentProfile: { firstName: "Sam", userId: STUDENT_USER_ID, managementMode: "SELF_MANAGED" },
      tutorProfile: { userId: TUTOR_USER_ID, user: { name: "Matthew Allen" } },
    };
  }

  function guardianManagedConversationRow() {
    return {
      studentProfileId: STUDENT_ID,
      tutorProfileId: TUTOR_PROFILE_ID,
      studentProfile: { firstName: "Emma", userId: "emma-restricted-login", managementMode: "GUARDIAN_MANAGED" },
      tutorProfile: { userId: TUTOR_USER_ID, user: { name: "Matthew Allen" } },
    };
  }

  it("item 1/3 — self-managed: tutor sends -> the student is notified", async () => {
    mocks.conversationFindUniqueOrThrow.mockResolvedValue(selfManagedConversationRow());
    mocks.resolveParticipantRole.mockImplementation(async (_c: unknown, userId: string) => (userId === TUTOR_USER_ID ? "TUTOR" : userId === STUDENT_USER_ID ? "STUDENT" : null));

    await sendMessage(TUTOR_USER_ID, CONVERSATION_ID, "hello");

    expect(mocks.notificationCreate).toHaveBeenCalledTimes(1);
    const call = mocks.notificationCreate.mock.calls[0]![0];
    expect(call.data.userId).toBe(STUDENT_USER_ID);
    expect(call.data.type).toBe("message.new");
  });

  it("item 2/4 — self-managed: student sends -> the tutor is notified, sender never notified", async () => {
    mocks.conversationFindUniqueOrThrow.mockResolvedValue(selfManagedConversationRow());
    mocks.resolveParticipantRole.mockImplementation(async (_c: unknown, userId: string) => (userId === TUTOR_USER_ID ? "TUTOR" : userId === STUDENT_USER_ID ? "STUDENT" : null));

    await sendMessage(STUDENT_USER_ID, CONVERSATION_ID, "hello");

    expect(mocks.notificationCreate).toHaveBeenCalledTimes(1);
    expect(mocks.notificationCreate.mock.calls[0]![0].data.userId).toBe(TUTOR_USER_ID);
  });

  it("item 5/6 — guardian-managed: a guardian sends -> tutor + the OTHER active guardian notified, sender excluded", async () => {
    mocks.conversationFindUniqueOrThrow.mockResolvedValue(guardianManagedConversationRow());
    mocks.parentStudentRelationshipFindMany.mockResolvedValue([
      { parentProfile: { userId: GUARDIAN_A, firstName: "Sarah" } },
      { parentProfile: { userId: GUARDIAN_B, firstName: "Alex" } },
    ]);
    mocks.resolveParticipantRole.mockImplementation(async (_c: unknown, userId: string) =>
      userId === TUTOR_USER_ID ? "TUTOR" : userId === GUARDIAN_A || userId === GUARDIAN_B ? "GUARDIAN" : null
    );

    await sendMessage(GUARDIAN_A, CONVERSATION_ID, "hello");

    const notifiedUserIds = mocks.notificationCreate.mock.calls.map((c) => c[0]!.data.userId).sort();
    expect(notifiedUserIds).toEqual([GUARDIAN_B, TUTOR_USER_ID].sort());
  });

  it("item 5 — guardian-managed: tutor sends -> ALL active guardians notified", async () => {
    mocks.conversationFindUniqueOrThrow.mockResolvedValue(guardianManagedConversationRow());
    mocks.parentStudentRelationshipFindMany.mockResolvedValue([
      { parentProfile: { userId: GUARDIAN_A, firstName: "Sarah" } },
      { parentProfile: { userId: GUARDIAN_B, firstName: "Alex" } },
    ]);
    mocks.resolveParticipantRole.mockImplementation(async (_c: unknown, userId: string) =>
      userId === TUTOR_USER_ID ? "TUTOR" : userId === GUARDIAN_A || userId === GUARDIAN_B ? "GUARDIAN" : null
    );

    await sendMessage(TUTOR_USER_ID, CONVERSATION_ID, "hello");

    const notifiedUserIds = mocks.notificationCreate.mock.calls.map((c) => c[0]!.data.userId).sort();
    expect(notifiedUserIds).toEqual([GUARDIAN_A, GUARDIAN_B].sort());
  });

  it("item 7 — a REVOKED guardian (absent from the authoritative party directory) is never notified", async () => {
    mocks.conversationFindUniqueOrThrow.mockResolvedValue(guardianManagedConversationRow());
    // Only the still-ACTIVE guardian is returned — a revoked one is simply
    // absent, exactly like getConversationParties itself derives it.
    mocks.parentStudentRelationshipFindMany.mockResolvedValue([{ parentProfile: { userId: GUARDIAN_A, firstName: "Sarah" } }]);
    mocks.resolveParticipantRole.mockImplementation(async (_c: unknown, userId: string) => (userId === TUTOR_USER_ID ? "TUTOR" : userId === GUARDIAN_A ? "GUARDIAN" : null));

    await sendMessage(TUTOR_USER_ID, CONVERSATION_ID, "hello");

    const notifiedUserIds = mocks.notificationCreate.mock.calls.map((c) => c[0]!.data.userId);
    expect(notifiedUserIds).toEqual([GUARDIAN_A]);
  });

  it("item 8 — a GUARDIAN_MANAGED student's own userId is never notified", async () => {
    const row = guardianManagedConversationRow();
    mocks.conversationFindUniqueOrThrow.mockResolvedValue(row);
    mocks.parentStudentRelationshipFindMany.mockResolvedValue([{ parentProfile: { userId: GUARDIAN_A, firstName: "Sarah" } }]);
    mocks.resolveParticipantRole.mockImplementation(async (_c: unknown, userId: string) => (userId === TUTOR_USER_ID ? "TUTOR" : userId === GUARDIAN_A ? "GUARDIAN" : null));

    await sendMessage(TUTOR_USER_ID, CONVERSATION_ID, "hello");

    const notifiedUserIds = mocks.notificationCreate.mock.calls.map((c) => c[0]!.data.userId);
    expect(notifiedUserIds).not.toContain(row.studentProfile.userId);
  });

  it("item 9 — notification metadata carries ONLY conversationId", async () => {
    mocks.conversationFindUniqueOrThrow.mockResolvedValue(selfManagedConversationRow());
    mocks.resolveParticipantRole.mockImplementation(async (_c: unknown, userId: string) => (userId === TUTOR_USER_ID ? "TUTOR" : userId === STUDENT_USER_ID ? "STUDENT" : null));

    await sendMessage(TUTOR_USER_ID, CONVERSATION_ID, "hello");

    const call = mocks.notificationCreate.mock.calls[0]![0];
    expect(call.data.metadata).toEqual({ conversationId: CONVERSATION_ID });
    expect(Object.keys(call.data.metadata)).toEqual(["conversationId"]);
  });

  it("item 12 — no message body is ever included in the Notification title/body", async () => {
    mocks.conversationFindUniqueOrThrow.mockResolvedValue(selfManagedConversationRow());
    mocks.resolveParticipantRole.mockImplementation(async (_c: unknown, userId: string) => (userId === TUTOR_USER_ID ? "TUTOR" : userId === STUDENT_USER_ID ? "STUDENT" : null));

    await sendMessage(TUTOR_USER_ID, CONVERSATION_ID, "this is the private message body");

    const call = mocks.notificationCreate.mock.calls[0]![0];
    expect(call.data.title).not.toContain("this is the private message body");
    expect(call.data.body).not.toContain("this is the private message body");
  });

  it("item 13 — a second rapid message from the same sender UPDATES the existing unread notification rather than creating a second row", async () => {
    mocks.conversationFindUniqueOrThrow.mockResolvedValue(selfManagedConversationRow());
    mocks.resolveParticipantRole.mockImplementation(async (_c: unknown, userId: string) => (userId === TUTOR_USER_ID ? "TUTOR" : userId === STUDENT_USER_ID ? "STUDENT" : null));
    mocks.notificationFindFirst.mockResolvedValue({ id: "existing-notif-1" });

    await sendMessage(TUTOR_USER_ID, CONVERSATION_ID, "second message");

    expect(mocks.notificationCreate).not.toHaveBeenCalled();
    expect(mocks.notificationUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "existing-notif-1" } }));
  });

  it("item 14/15 — the collapse lookup is scoped to BOTH the specific recipient and the specific conversation", async () => {
    mocks.conversationFindUniqueOrThrow.mockResolvedValue(selfManagedConversationRow());
    mocks.resolveParticipantRole.mockImplementation(async (_c: unknown, userId: string) => (userId === TUTOR_USER_ID ? "TUTOR" : userId === STUDENT_USER_ID ? "STUDENT" : null));

    await sendMessage(TUTOR_USER_ID, CONVERSATION_ID, "hello");

    expect(mocks.notificationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: STUDENT_USER_ID,
          type: "message.new",
          readAt: null,
          metadata: { path: ["conversationId"], equals: CONVERSATION_ID },
        }),
      })
    );
  });

  it("item 17 — a Notification failure never fails or rolls back the Message send", async () => {
    mocks.conversationFindUniqueOrThrow.mockResolvedValue(selfManagedConversationRow());
    mocks.resolveParticipantRole.mockImplementation(async (_c: unknown, userId: string) => (userId === TUTOR_USER_ID ? "TUTOR" : userId === STUDENT_USER_ID ? "STUDENT" : null));
    mocks.notificationFindFirst.mockRejectedValue(new Error("notification db down"));

    const result = await sendMessage(TUTOR_USER_ID, CONVERSATION_ID, "hello");
    expect(result.ok).toBe(true);
  });

  it("no notification is ever attempted for an unauthorized/failed send", async () => {
    mocks.canSendConversationMessage.mockResolvedValue({ ok: false, reason: "OUTSIDE_COMMUNICATION_WINDOW" });
    await sendMessage(TUTOR_USER_ID, CONVERSATION_ID, "hello");
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
    expect(mocks.notificationUpdate).not.toHaveBeenCalled();
  });
});

describe("markConversationRead — Notification read sync", () => {
  it("item 16 — marking a conversation read also marks its unread message.new Notification read, scoped to the caller only", async () => {
    await markConversationRead(ACTOR, CONVERSATION_ID);
    expect(mocks.notificationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: ACTOR,
          type: "message.new",
          readAt: null,
          metadata: { path: ["conversationId"], equals: CONVERSATION_ID },
        }),
      })
    );
  });

  it("a failure marking notifications read never fails the primary mark-read operation", async () => {
    mocks.notificationUpdateMany.mockRejectedValue(new Error("db down"));
    const result = await markConversationRead(ACTOR, CONVERSATION_ID);
    expect(result).toEqual({ ok: true });
  });
});
