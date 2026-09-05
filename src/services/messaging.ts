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
