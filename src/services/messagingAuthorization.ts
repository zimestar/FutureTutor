import "server-only";
import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import { resolveStudentCapabilities, type StudentAuthorizationClient } from "@/services/studentAuthorization";
import type { ConversationParticipantRole } from "@/generated/prisma/enums";

/**
 * MESSAGING-MVP1A — the fail-closed authorization layer for messaging,
 * mirroring studentAuthorization.ts's exact structure: pure decision logic
 * where possible, every fact re-read from the database, nothing ever
 * trusted from a caller-supplied conversationId/studentId/tutorId/
 * guardianId/participantRole claim.
 *
 * CRITICAL DESIGN RULE (per MESSAGING-MVP-DESIGN1 and this mission's own
 * explicit instruction): ConversationParticipant row EXISTENCE is never,
 * on its own, proof of authorization. Every function below re-derives the
 * current relationship from StudentProfile.managementMode /
 * ParentStudentRelationship.status / TutorProfile.userId+applicationStatus
 * on every call — a stale participant row (e.g. for a since-REVOKED
 * guardian) confers nothing.
 *
 * Deliberately does NOT reuse the broad studentAuthorization.ts
 * `canActForStudent` for the student side, because that function's
 * semantics intentionally include a GUARDIAN_MANAGED student's own
 * restricted login (pure self-view access) — exactly the accidental
 * adult/minor channel this feature must not create. Instead this module
 * reuses `resolveStudentCapabilities`'s already-tested underlying facts
 * (isLinkedStudentSelf, hasActiveGuardianAuthority, managementMode) and
 * applies its OWN, stricter combinator — structurally identical to that
 * module's `canManageStudentAccount` gate, not `canActForStudent`.
 */
export type MessagingAuthorizationClient = PrismaClient | Prisma.TransactionClient;

const MESSAGING_POST_SESSION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // MESSAGING_POST_SESSION_WINDOW_DAYS = 30, see design report — a product communication-window default, never a data-retention rule.

/**
 * The student side of messaging capability. SELF_MANAGED: the linked
 * Student User only. GUARDIAN_MANAGED: an ACTIVE guardian only — never the
 * student's own login, even if one exists. LEGACY_UNKNOWN and a
 * nonexistent student both fail closed (return false), per this mission's
 * explicit instruction not to guess a safe interpretation for
 * LEGACY_UNKNOWN.
 */
export async function canParticipateInTutoringConversation(
  client: StudentAuthorizationClient,
  actorUserId: string,
  studentProfileId: string
): Promise<boolean> {
  const caps = await resolveStudentCapabilities(client, actorUserId, studentProfileId);
  if (caps.managementMode === "SELF_MANAGED") return caps.isLinkedStudentSelf;
  if (caps.managementMode === "GUARDIAN_MANAGED") return caps.hasActiveGuardianAuthority;
  return false;
}

interface ConversationParties {
  conversationId: string;
  studentProfileId: string;
  tutorProfileId: string;
}

async function loadConversationParties(
  client: MessagingAuthorizationClient,
  conversationId: string
): Promise<ConversationParties | null> {
  const conversation = await client.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, studentProfileId: true, tutorProfileId: true },
  });
  if (!conversation) return null;
  return { conversationId: conversation.id, studentProfileId: conversation.studentProfileId, tutorProfileId: conversation.tutorProfileId };
}

export type ConversationActorSide =
  | { kind: "TUTOR" }
  | { kind: "STUDENT_SIDE" }
  | { kind: "NONE" };

/**
 * Which side of the conversation (if any) this actor legitimately occupies
 * — re-derived fresh every call, never from a ConversationParticipant row.
 * A tutor whose own TutorProfile isn't this conversation's tutorProfileId
 * falls through to the student-side check (which will also fail for an
 * unrelated tutor, since they have no guardian relationship or self-link
 * to this student), correctly resolving to NONE.
 */
async function resolveActorSide(
  client: MessagingAuthorizationClient,
  actorUserId: string,
  parties: ConversationParties
): Promise<ConversationActorSide> {
  const tutorProfile = await client.tutorProfile.findUnique({
    where: { id: parties.tutorProfileId },
    select: { userId: true },
  });
  if (tutorProfile?.userId === actorUserId) return { kind: "TUTOR" };

  const canParticipate = await canParticipateInTutoringConversation(client, actorUserId, parties.studentProfileId);
  if (canParticipate) return { kind: "STUDENT_SIDE" };

  return { kind: "NONE" };
}

/**
 * The role a NEW ConversationParticipant row should carry for this actor,
 * given they've already been authorized via resolveActorSide. Only called
 * when lazily creating/updating a participant row (see messaging.ts) — not
 * itself an authorization decision.
 */
export async function resolveParticipantRole(
  client: MessagingAuthorizationClient,
  actorUserId: string,
  parties: ConversationParties
): Promise<ConversationParticipantRole | null> {
  const side = await resolveActorSide(client, actorUserId, parties);
  if (side.kind === "TUTOR") return "TUTOR";
  if (side.kind === "NONE") return null;

  const student = await client.studentProfile.findUnique({
    where: { id: parties.studentProfileId },
    select: { managementMode: true },
  });
  return student?.managementMode === "SELF_MANAGED" ? "STUDENT" : "GUARDIAN";
}

/**
 * READ authorization — the sole gate for viewing a conversation's messages
 * and for the mark-read operation (per the design report: suspension does
 * not block reading; only relationship currency matters here). Returns
 * false identically for "conversation doesn't exist" and "exists but
 * unauthorized" — no distinguishable response, so a conversationId cannot
 * be used to enumerate/probe for existence.
 */
export async function canReadConversation(
  client: MessagingAuthorizationClient,
  actorUserId: string,
  conversationId: string
): Promise<boolean> {
  const parties = await loadConversationParties(client, conversationId);
  if (!parties) return false;
  const side = await resolveActorSide(client, actorUserId, parties);
  return side.kind !== "NONE";
}

async function isActorSuspended(client: MessagingAuthorizationClient, actorUserId: string): Promise<boolean> {
  const actor = await client.user.findUnique({ where: { id: actorUserId }, select: { deactivatedAt: true } });
  // Fail closed if the actor's own User row is somehow gone.
  return !actor || actor.deactivatedAt !== null;
}

/**
 * Any Booking status other than CONFIRMED is not a legitimate,
 * relationship-establishing fact in this codebase today — Booking.status
 * has no writer that ever sets COMPLETED/NO_SHOW/REFUNDED/RESCHEDULED (the
 * operational outcome lives on Session_.status instead); only CONFIRMED is
 * ever actually reached in practice, so it is the sole qualifying status
 * here, deliberately not reusing bookingCreation.ts's own
 * ACTIVE_BOOKING_STATUSES (which also includes DRAFT/PENDING_PAYMENT — a
 * booking that never actually confirmed/paid never legitimately
 * established a tutoring relationship).
 */
async function hasLegitimateTutoringRelationship(
  client: MessagingAuthorizationClient,
  studentProfileId: string,
  tutorProfileId: string
): Promise<boolean> {
  const booking = await client.booking.findFirst({
    where: { studentProfileId, tutorProfileId, status: "CONFIRMED" },
    select: { id: true },
  });
  return booking !== null;
}

/**
 * The V1 30-day post-session communication window (approved product
 * decision, MESSAGING_POST_SESSION_WINDOW_DAYS = 30 — a communication
 * default, never a data-retention rule). A CONFIRMED booking whose
 * scheduled endAt is >= (now - 30 days) covers BOTH an upcoming/in-progress
 * booking (endAt is in the future, trivially >= that threshold) and a
 * booking that ended within the last 30 days — one simple comparison
 * covers both approved cases without a redundant OR.
 */
async function isWithinCommunicationWindow(
  client: MessagingAuthorizationClient,
  studentProfileId: string,
  tutorProfileId: string,
  now: Date
): Promise<boolean> {
  const windowStart = new Date(now.getTime() - MESSAGING_POST_SESSION_WINDOW_MS);
  const booking = await client.booking.findFirst({
    where: { studentProfileId, tutorProfileId, status: "CONFIRMED", endAt: { gte: windowStart } },
    select: { id: true },
  });
  return booking !== null;
}

export type SendEligibilityReason =
  | "CONVERSATION_NOT_FOUND"
  | "NOT_AUTHORIZED"
  | "ACTOR_SUSPENDED"
  | "TUTOR_NOT_APPROVED"
  | "OUTSIDE_COMMUNICATION_WINDOW";

export interface SendEligibility {
  ok: boolean;
  reason?: SendEligibilityReason;
}

/**
 * SEND authorization — READ authorization plus: the acting User is not
 * suspended (fail-closed on new commitments, per the design report — this
 * does NOT affect read access), a tutor-side actor's TutorProfile must
 * still be APPROVED, and the pair must currently be inside the 30-day
 * communication window. Every fact is read fresh; nothing is cached on the
 * Conversation row itself.
 */
export async function canSendConversationMessage(
  client: MessagingAuthorizationClient,
  actorUserId: string,
  conversationId: string,
  now: Date = new Date()
): Promise<SendEligibility> {
  const parties = await loadConversationParties(client, conversationId);
  if (!parties) return { ok: false, reason: "CONVERSATION_NOT_FOUND" };

  const side = await resolveActorSide(client, actorUserId, parties);
  if (side.kind === "NONE") return { ok: false, reason: "NOT_AUTHORIZED" };

  if (await isActorSuspended(client, actorUserId)) return { ok: false, reason: "ACTOR_SUSPENDED" };

  if (side.kind === "TUTOR") {
    const tutorProfile = await client.tutorProfile.findUnique({
      where: { id: parties.tutorProfileId },
      select: { applicationStatus: true },
    });
    if (tutorProfile?.applicationStatus !== "APPROVED") return { ok: false, reason: "TUTOR_NOT_APPROVED" };
  }

  const withinWindow = await isWithinCommunicationWindow(client, parties.studentProfileId, parties.tutorProfileId, now);
  if (!withinWindow) return { ok: false, reason: "OUTSIDE_COMMUNICATION_WINDOW" };

  return { ok: true };
}

/**
 * Whether a Conversation is legitimately establishable for this
 * (studentProfileId, tutorProfileId) pair right now — "has this pair EVER
 * had a CONFIRMED booking," no time window (the 30-day window only gates
 * NEW SENDS, never conversation existence/readability — history remains
 * readable after the send window closes, per the design report).
 */
export async function hasEligibleTutoringRelationship(
  client: MessagingAuthorizationClient,
  studentProfileId: string,
  tutorProfileId: string
): Promise<boolean> {
  return hasLegitimateTutoringRelationship(client, studentProfileId, tutorProfileId);
}

export { loadConversationParties, resolveActorSide };
export type { ConversationParties };
