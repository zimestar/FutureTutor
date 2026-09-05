"use server";

import { auth } from "@/lib/auth";
import {
  listNewerMessages,
  listConversationMessages,
  markConversationRead,
  sendMessage,
} from "@/services/messaging";
import { toMessageDto, type MessageDto } from "@/lib/messagingPresentation";

/**
 * MESSAGING-MVP1B — every function resolves the authenticated user
 * server-side via auth() and passes it as the actor to the domain service,
 * which re-authorizes independently on every call (see
 * messagingAuthorization.ts). No function accepts a userId/studentId/
 * tutorId/guardianId from the caller — conversationId is used purely as a
 * lookup key, never as authority.
 */

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export interface MessagePage {
  items: MessageDto[];
  nextCursor: string | null;
}

/** "Load earlier messages" — older-going cursor pagination, reusing the
 * same bounded domain query the thread page's initial server-side load
 * already uses. */
export async function getOlderMessagesAction(conversationId: string, cursor: string | null): Promise<MessagePage> {
  const userId = await requireUserId();
  if (!userId) return { items: [], nextCursor: null };

  const result = await listConversationMessages(userId, conversationId, cursor);
  if (!result.ok) return { items: [], nextCursor: null };

  return { items: result.page.items.map(toMessageDto), nextCursor: result.page.nextCursor };
}

/** Polling — every message strictly newer than the client's current newest
 * known message, ascending. */
export async function getNewerMessagesAction(conversationId: string, afterCreatedAt: string): Promise<MessageDto[]> {
  const userId = await requireUserId();
  if (!userId) return [];

  const parsed = new Date(afterCreatedAt);
  if (Number.isNaN(parsed.getTime())) return [];

  const result = await listNewerMessages(userId, conversationId, parsed);
  if (!result.ok) return [];

  return result.items.map(toMessageDto);
}

export type SendMessageActionResult =
  | { ok: true; message: MessageDto }
  | { ok: false; reason: "VALIDATION" | "NOT_AUTHORIZED" | "READ_ONLY" | "UNAVAILABLE" };

/** senderUserId is always the authenticated caller's own id — sendMessage's
 * own signature has no parameter through which a caller could supply a
 * different one. */
export async function sendMessageAction(conversationId: string, body: string): Promise<SendMessageActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, reason: "NOT_AUTHORIZED" };

  const result = await sendMessage(userId, conversationId, body);
  if (!result.ok) {
    if (result.reason === "VALIDATION") return { ok: false, reason: "VALIDATION" };
    if (result.reason === "OUTSIDE_COMMUNICATION_WINDOW") return { ok: false, reason: "READ_ONLY" };
    if (result.reason === "CONVERSATION_NOT_FOUND" || result.reason === "NOT_AUTHORIZED") return { ok: false, reason: "NOT_AUTHORIZED" };
    // ACTOR_SUSPENDED / TUTOR_NOT_APPROVED — a real account-state change
    // between page render and send; never expose which one specifically.
    return { ok: false, reason: "UNAVAILABLE" };
  }

  return { ok: true, message: toMessageDto(result.message) };
}

export async function markConversationReadAction(conversationId: string): Promise<{ ok: boolean }> {
  const userId = await requireUserId();
  if (!userId) return { ok: false };

  const result = await markConversationRead(userId, conversationId);
  return { ok: result.ok };
}
