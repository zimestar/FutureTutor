import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import {
  canParticipateInTutoringConversation,
  canReadConversation,
  canSendConversationMessage,
  hasEligibleTutoringRelationship,
  resolveParticipantRole,
  type MessagingAuthorizationClient,
} from "@/services/messagingAuthorization";
import { messageBodySchema } from "@/schemas/messaging";

/**
 * MESSAGING-MVP1A — the domain service. Every entry point re-authorizes via
 * messagingAuthorization.ts on every call (never trusts a prior check, a
 * ConversationParticipant row, or anything supplied by the client beyond an
 * id used purely as a lookup key). No Notification row is ever written here
 * — that integration is explicitly MESSAGING-MVP1C's scope, not this one's.
 */

const MESSAGE_PAGE_LIMIT = 50;

// ---------------------------------------------------------------------------
// Conversation get-or-create
// ---------------------------------------------------------------------------

/**
 * Race-safe idempotent get-or-create for one (studentProfileId,
 * tutorProfileId) pair, mirroring the established
 * getOrCreatePaymentForQuote/TutorTransfer.tutorEarningId-unique pattern
 * already used twice elsewhere in this codebase: the DB's own
 * @@unique([studentProfileId, tutorProfileId]) constraint is the actual
 * concurrency guard, not a find-then-create check on its own. Does NOT
 * itself authorize anything — callers (ensureConversationAccess below) are
 * responsible for confirming the actor may legitimately access this pair
 * before calling this.
 */
async function getOrCreateConversationForRelationship(
  client: MessagingAuthorizationClient,
  studentProfileId: string,
  tutorProfileId: string
): Promise<{ id: string }> {
  const existing = await client.conversation.findUnique({
    where: { studentProfileId_tutorProfileId: { studentProfileId, tutorProfileId } },
    select: { id: true },
  });
  if (existing) return existing;

  try {
    return await client.conversation.create({
      data: { studentProfileId, tutorProfileId },
      select: { id: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Lost a concurrent create race — the other caller's row is now
      // authoritative; the unique constraint is what actually prevented a
      // duplicate, this is just re-reading its result.
      return client.conversation.findUniqueOrThrow({
        where: { studentProfileId_tutorProfileId: { studentProfileId, tutorProfileId } },
        select: { id: true },
      });
    }
    throw error;
  }
}

/** Idempotent self-heal: ensures the CURRENT actor (already authorized by
 * the caller) has a ConversationParticipant row, creating one with the
 * correct role if absent. Never touches any other user's row. This is a
 * convenience for the unread model / future "who's in this thread" UI, not
 * an authorization mechanism — see messagingAuthorization.ts's own doc
 * comment for why participant rows are never trusted for access control. */
async function ensureOwnParticipantRow(
  client: MessagingAuthorizationClient,
  conversationId: string,
  actorUserId: string,
  studentProfileId: string,
  tutorProfileId: string
): Promise<void> {
  const role = await resolveParticipantRole(client, actorUserId, { conversationId, studentProfileId, tutorProfileId });
  if (!role) return; // defensive — caller should already have confirmed authorization
  await client.conversationParticipant.upsert({
    where: { conversationId_userId: { conversationId, userId: actorUserId } },
    create: { conversationId, userId: actorUserId, role },
    update: {},
  });
}

export type EnsureConversationAccessResult =
  | { ok: true; conversationId: string }
  | { ok: false; reason: "NOT_AUTHORIZED" | "NO_ELIGIBLE_RELATIONSHIP" };

/**
 * The entry point a future UI calls to obtain a conversationId for a given
 * (studentProfileId, tutorProfileId) pair — authorizes the actor FIRST
 * (never materializes a conversation for a pair the actor has no
 * legitimate relation to, even though the row itself carries no directly
 * sensitive data), then lazily gets-or-creates it, then self-heals the
 * actor's own participant row. Every subsequent read/send call operates
 * purely off the returned conversationId, per the design report's
 * "Given conversationId" authorization contract.
 */
export async function ensureConversationAccess(
  actorUserId: string,
  studentProfileId: string,
  tutorProfileId: string
): Promise<EnsureConversationAccessResult> {
  const tutorProfile = await db.tutorProfile.findUnique({ where: { id: tutorProfileId }, select: { userId: true } });
  const isTutor = tutorProfile?.userId === actorUserId;

  const authorized = isTutor || (await canParticipateInTutoringConversation(db, actorUserId, studentProfileId));
  if (!authorized) return { ok: false, reason: "NOT_AUTHORIZED" };

  const eligible = await hasEligibleTutoringRelationship(db, studentProfileId, tutorProfileId);
  if (!eligible) return { ok: false, reason: "NO_ELIGIBLE_RELATIONSHIP" };

  const conversation = await getOrCreateConversationForRelationship(db, studentProfileId, tutorProfileId);
  await ensureOwnParticipantRow(db, conversation.id, actorUserId, studentProfileId, tutorProfileId);
  return { ok: true, conversationId: conversation.id };
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

export type SendMessageResult =
  | { ok: true; message: { id: string; conversationId: string; senderUserId: string; body: string; createdAt: Date } }
  | { ok: false; reason: "VALIDATION" | "CONVERSATION_NOT_FOUND" | "NOT_AUTHORIZED" | "ACTOR_SUSPENDED" | "TUTOR_NOT_APPROVED" | "OUTSIDE_COMMUNICATION_WINDOW" };

/**
 * senderUserId is ALWAYS the authenticated caller's own id — never accepted
 * as a parameter from a request body, closing the forged-sender threat by
 * construction (there is no parameter here through which a caller could
 * even attempt to supply a different one).
 */
export async function sendMessage(actorUserId: string, conversationId: string, rawBody: string): Promise<SendMessageResult> {
  const parsed = messageBodySchema.safeParse(rawBody);
  if (!parsed.success) return { ok: false, reason: "VALIDATION" };
  const body = parsed.data;

  const eligibility = await canSendConversationMessage(db, actorUserId, conversationId);
  if (!eligibility.ok) {
    return { ok: false, reason: eligibility.reason ?? "NOT_AUTHORIZED" };
  }

  const conversation = await db.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    select: { studentProfileId: true, tutorProfileId: true },
  });

  const now = new Date();
  const message = await db.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: { conversationId, senderUserId: actorUserId, body },
    });
    await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: now } });
    // Sending implies having read up to this point — keeps the sender's own
    // unread count correct without a separate client round-trip.
    const role = await resolveParticipantRole(tx, actorUserId, {
      conversationId,
      studentProfileId: conversation.studentProfileId,
      tutorProfileId: conversation.tutorProfileId,
    });
    if (role) {
      await tx.conversationParticipant.upsert({
        where: { conversationId_userId: { conversationId, userId: actorUserId } },
        create: { conversationId, userId: actorUserId, role, lastReadAt: now },
        update: { lastReadAt: now },
      });
    }
    return created;
  });

  return { ok: true, message };
}

// ---------------------------------------------------------------------------
// Read / pagination
// ---------------------------------------------------------------------------

export interface ConversationMessagePage {
  items: Array<{ id: string; senderUserId: string; body: string; createdAt: Date }>;
  nextCursor: string | null;
}

export type ListMessagesResult = { ok: true; page: ConversationMessagePage } | { ok: false; reason: "NOT_AUTHORIZED" };

/**
 * Newest-first, cursor-paginated, always bounded (take: limit + 1 to detect
 * a next page) — mirrors the established cursor-pagination convention used
 * throughout this codebase (notifications, payment history). No caller can
 * ever trigger an unbounded query.
 */
export async function listConversationMessages(
  actorUserId: string,
  conversationId: string,
  cursor?: string | null
): Promise<ListMessagesResult> {
  const authorized = await canReadConversation(db, actorUserId, conversationId);
  if (!authorized) return { ok: false, reason: "NOT_AUTHORIZED" };

  const rows = await db.message.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MESSAGE_PAGE_LIMIT + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true, senderUserId: true, body: true, createdAt: true },
  });

  const hasMore = rows.length > MESSAGE_PAGE_LIMIT;
  const page = hasMore ? rows.slice(0, MESSAGE_PAGE_LIMIT) : rows;

  return {
    ok: true,
    page: { items: page, nextCursor: hasMore ? page[page.length - 1]!.id : null },
  };
}

export type ListNewerMessagesResult =
  | { ok: true; items: Array<{ id: string; senderUserId: string; body: string; createdAt: Date }> }
  | { ok: false; reason: "NOT_AUTHORIZED" };

/**
 * Powers polling: every message strictly newer than `afterCreatedAt`,
 * ascending, bounded at MESSAGE_PAGE_LIMIT. No cursor/nextCursor — a
 * 5-10s poll interval means a burst large enough to hit the bound would be
 * exceptional, and the UI simply polls again immediately after, rather
 * than this function pretending to support unbounded catch-up in one call.
 */
export async function listNewerMessages(
  actorUserId: string,
  conversationId: string,
  afterCreatedAt: Date
): Promise<ListNewerMessagesResult> {
  const authorized = await canReadConversation(db, actorUserId, conversationId);
  if (!authorized) return { ok: false, reason: "NOT_AUTHORIZED" };

  const items = await db.message.findMany({
    where: { conversationId, createdAt: { gt: afterCreatedAt } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: MESSAGE_PAGE_LIMIT,
    select: { id: true, senderUserId: true, body: true, createdAt: true },
  });

  return { ok: true, items };
}

// ---------------------------------------------------------------------------
// Mark read
// ---------------------------------------------------------------------------

export type MarkReadResult = { ok: true } | { ok: false; reason: "NOT_AUTHORIZED" };

/**
 * Updates ONLY the authenticated caller's own ConversationParticipant row
 * — the WHERE clause is keyed on (conversationId, actorUserId), never on a
 * client-supplied participant/user id, exactly mirroring
 * markNotificationReadAction's own "ownership is baked into the WHERE
 * clause" precedent. Idempotent: calling it repeatedly just re-sets
 * lastReadAt to the current time, never errors, never creates a duplicate
 * row (guarded by the same upsert + unique constraint as everywhere else
 * in this file).
 */
// ---------------------------------------------------------------------------
// Conversation list — lazy relationship discovery
// ---------------------------------------------------------------------------

export interface ConversationSessionContext {
  kind: "upcoming" | "recent" | "none";
  bookingId: string | null;
  subjectSlug: string | null;
  startAt: Date | null;
  endAt: Date | null;
  timezone: string | null;
}

/** The most relevant CONFIRMED booking for a (student, tutor) pair, for
 * display context only — never assumes one booking per conversation.
 * Prefers the nearest upcoming/in-progress booking; falls back to the most
 * recently ended one. No relation to the 30-day send window (a purely
 * display-oriented lookup, re-run fresh every call). */
async function resolveSessionContext(
  studentProfileId: string,
  tutorProfileId: string,
  now: Date
): Promise<ConversationSessionContext> {
  const select = {
    id: true,
    subject: { select: { slug: true } },
    startAt: true,
    endAt: true,
    timezone: true,
  } as const;

  const upcoming = await db.booking.findFirst({
    where: { studentProfileId, tutorProfileId, status: "CONFIRMED", endAt: { gte: now } },
    orderBy: { startAt: "asc" },
    select,
  });
  if (upcoming) return { kind: "upcoming", bookingId: upcoming.id, subjectSlug: upcoming.subject.slug, startAt: upcoming.startAt, endAt: upcoming.endAt, timezone: upcoming.timezone };

  const recent = await db.booking.findFirst({
    where: { studentProfileId, tutorProfileId, status: "CONFIRMED", endAt: { lt: now } },
    orderBy: { endAt: "desc" },
    select,
  });
  if (recent) return { kind: "recent", bookingId: recent.id, subjectSlug: recent.subject.slug, startAt: recent.startAt, endAt: recent.endAt, timezone: recent.timezone };

  return { kind: "none", bookingId: null, subjectSlug: null, startAt: null, endAt: null, timezone: null };
}

/** Unread = messages newer than the actor's own lastReadAt, excluding the
 * actor's own messages. A plain count query per conversation — deliberately
 * NOT a MessageReceipt table (see the design report): at this app's actual
 * per-user conversation-list scale (a handful of relationships), one count
 * query per row is cheap and exact; a disproportionately-larger scale would
 * warrant revisiting this, not V1. */
async function resolveUnreadCount(client: MessagingAuthorizationClient, conversationId: string, actorUserId: string): Promise<number> {
  const participant = await client.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: actorUserId } },
    select: { lastReadAt: true },
  });
  return client.message.count({
    where: {
      conversationId,
      senderUserId: { not: actorUserId },
      createdAt: { gt: participant?.lastReadAt ?? new Date(0) },
    },
  });
}

export interface ConversationSummary {
  id: string;
  studentProfileId: string;
  tutorProfileId: string;
  studentFirstName: string;
  tutorFirstName: string;
  /** Every currently-ACTIVE guardian's first name, for the tutor's own list
   * view ("student name + guardian context where appropriate" — design
   * report). Empty for a SELF_MANAGED student. */
  guardianFirstNames: string[];
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  sessionContext: ConversationSessionContext;
}

/** Every (studentProfileId, tutorProfileId) pair this actor could
 * legitimately have a conversation for, derived from their own CONFIRMED
 * bookings — a discovery convenience only. Every pair returned here is
 * still re-authorized via ensureConversationAccess before anything is
 * created or returned to the caller (see listMyConversations below); this
 * function itself grants nothing. A user can appear in more than one branch
 * (e.g. a tutor who is also a parent) — not mutually exclusive. */
async function resolveEligiblePairsForActor(actorUserId: string): Promise<Array<{ studentProfileId: string; tutorProfileId: string }>> {
  const pairs: Array<{ studentProfileId: string; tutorProfileId: string }> = [];

  const tutorProfile = await db.tutorProfile.findUnique({ where: { userId: actorUserId }, select: { id: true } });
  if (tutorProfile) {
    const rows = await db.booking.findMany({
      where: { tutorProfileId: tutorProfile.id, status: "CONFIRMED" },
      distinct: ["studentProfileId"],
      select: { studentProfileId: true },
    });
    for (const row of rows) pairs.push({ studentProfileId: row.studentProfileId, tutorProfileId: tutorProfile.id });
  }

  const studentProfile = await db.studentProfile.findUnique({ where: { userId: actorUserId }, select: { id: true, managementMode: true } });
  if (studentProfile?.managementMode === "SELF_MANAGED") {
    const rows = await db.booking.findMany({
      where: { studentProfileId: studentProfile.id, status: "CONFIRMED" },
      distinct: ["tutorProfileId"],
      select: { tutorProfileId: true },
    });
    for (const row of rows) pairs.push({ studentProfileId: studentProfile.id, tutorProfileId: row.tutorProfileId });
  }

  const parentProfile = await db.parentProfile.findUnique({ where: { userId: actorUserId }, select: { id: true } });
  if (parentProfile) {
    const relationships = await db.parentStudentRelationship.findMany({
      where: { parentProfileId: parentProfile.id, status: "ACTIVE" },
      select: { studentProfileId: true },
    });
    for (const relationship of relationships) {
      const rows = await db.booking.findMany({
        where: { studentProfileId: relationship.studentProfileId, status: "CONFIRMED" },
        distinct: ["tutorProfileId"],
        select: { tutorProfileId: true },
      });
      for (const row of rows) pairs.push({ studentProfileId: relationship.studentProfileId, tutorProfileId: row.tutorProfileId });
    }
  }

  return pairs;
}

/**
 * The /messages list entry point. Lazily ensures a Conversation row exists
 * for every one of the actor's own legitimate relationships (bounded to
 * their own bookings — never a global/bulk backfill), then returns a
 * newest-activity-first summary of each. A relationship with no Conversation
 * row yet and no messages sent still appears (lastMessageAt: null, sorted
 * last), matching the design report's "messaging becomes available"
 * framing rather than requiring a first message to appear in the list.
 */
export async function listMyConversations(actorUserId: string, now: Date = new Date()): Promise<ConversationSummary[]> {
  const pairs = await resolveEligiblePairsForActor(actorUserId);

  const conversationIds: string[] = [];
  for (const pair of pairs) {
    const access = await ensureConversationAccess(actorUserId, pair.studentProfileId, pair.tutorProfileId);
    if (access.ok) conversationIds.push(access.conversationId);
  }
  if (conversationIds.length === 0) return [];

  const conversations = await db.conversation.findMany({
    where: { id: { in: conversationIds } },
    select: {
      id: true,
      studentProfileId: true,
      tutorProfileId: true,
      lastMessageAt: true,
      studentProfile: { select: { firstName: true } },
      tutorProfile: { select: { user: { select: { name: true } } } },
    },
  });

  const summaries = await Promise.all(
    conversations.map(async (conversation) => {
      const [lastMessage, unreadCount, guardianRows, sessionContext] = await Promise.all([
        db.message.findFirst({ where: { conversationId: conversation.id }, orderBy: { createdAt: "desc" }, select: { body: true } }),
        resolveUnreadCount(db, conversation.id, actorUserId),
        db.parentStudentRelationship.findMany({
          where: { studentProfileId: conversation.studentProfileId, status: "ACTIVE" },
          select: { parentProfile: { select: { firstName: true } } },
        }),
        resolveSessionContext(conversation.studentProfileId, conversation.tutorProfileId, now),
      ]);

      return {
        id: conversation.id,
        studentProfileId: conversation.studentProfileId,
        tutorProfileId: conversation.tutorProfileId,
        studentFirstName: conversation.studentProfile.firstName,
        tutorFirstName: conversation.tutorProfile.user.name?.split(" ")[0] ?? "",
        guardianFirstNames: guardianRows.map((r) => r.parentProfile.firstName),
        lastMessageAt: conversation.lastMessageAt,
        lastMessagePreview: lastMessage?.body.slice(0, 140) ?? null,
        unreadCount,
        sessionContext,
      };
    })
  );

  return summaries.sort((a, b) => (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0));
}

// ---------------------------------------------------------------------------
// Thread page support — party directory + session context, both re-checked
// via canReadConversation independently (never assumes the caller already
// authorized elsewhere in the same request).
// ---------------------------------------------------------------------------

export interface ConversationPartyDirectory {
  studentProfileId: string;
  tutorProfileId: string;
  studentFirstName: string;
  tutorFirstName: string;
  /** userId -> display first name, for every CURRENT legitimate participant
   * (the tutor, and either the self-managed student or every ACTIVE
   * guardian) — resolved fresh, never from stale ConversationParticipant
   * rows, so a message from a since-revoked guardian still displays their
   * historical name correctly even though they can no longer read/send. */
  names: Record<string, string>;
}

export async function getConversationParties(actorUserId: string, conversationId: string): Promise<ConversationPartyDirectory | null> {
  const authorized = await canReadConversation(db, actorUserId, conversationId);
  if (!authorized) return null;

  const conversation = await db.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    select: {
      studentProfileId: true,
      tutorProfileId: true,
      studentProfile: { select: { firstName: true, userId: true, managementMode: true } },
      tutorProfile: { select: { userId: true, user: { select: { name: true } } } },
    },
  });

  const names: Record<string, string> = {};
  const tutorFirstName = conversation.tutorProfile.user.name?.split(" ")[0] ?? "";
  names[conversation.tutorProfile.userId] = tutorFirstName;

  if (conversation.studentProfile.managementMode === "SELF_MANAGED" && conversation.studentProfile.userId) {
    names[conversation.studentProfile.userId] = conversation.studentProfile.firstName;
  } else {
    const guardians = await db.parentStudentRelationship.findMany({
      where: { studentProfileId: conversation.studentProfileId, status: "ACTIVE" },
      select: { parentProfile: { select: { userId: true, firstName: true } } },
    });
    for (const guardian of guardians) names[guardian.parentProfile.userId] = guardian.parentProfile.firstName;
  }

  return {
    studentProfileId: conversation.studentProfileId,
    tutorProfileId: conversation.tutorProfileId,
    studentFirstName: conversation.studentProfile.firstName,
    tutorFirstName,
    names,
  };
}

export async function getConversationSessionContext(
  actorUserId: string,
  conversationId: string,
  now: Date = new Date()
): Promise<ConversationSessionContext | null> {
  const authorized = await canReadConversation(db, actorUserId, conversationId);
  if (!authorized) return null;
  const conversation = await db.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    select: { studentProfileId: true, tutorProfileId: true },
  });
  return resolveSessionContext(conversation.studentProfileId, conversation.tutorProfileId, now);
}

export async function markConversationRead(actorUserId: string, conversationId: string): Promise<MarkReadResult> {
  const authorized = await canReadConversation(db, actorUserId, conversationId);
  if (!authorized) return { ok: false, reason: "NOT_AUTHORIZED" };

  const conversation = await db.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    select: { studentProfileId: true, tutorProfileId: true },
  });
  const role = await resolveParticipantRole(db, actorUserId, {
    conversationId,
    studentProfileId: conversation.studentProfileId,
    tutorProfileId: conversation.tutorProfileId,
  });
  if (!role) return { ok: false, reason: "NOT_AUTHORIZED" }; // defensive — canReadConversation already confirmed this above

  const now = new Date();
  await db.conversationParticipant.upsert({
    where: { conversationId_userId: { conversationId, userId: actorUserId } },
    create: { conversationId, userId: actorUserId, role, lastReadAt: now },
    update: { lastReadAt: now },
  });

  return { ok: true };
}
