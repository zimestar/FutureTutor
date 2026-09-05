import type { ConversationSessionContext, ConversationSummary } from "@/services/messaging";

/**
 * MESSAGING-MVP1B — client-facing DTOs. Dates cross the server/client
 * boundary as ISO strings only (never a raw Date), matching every other
 * Server-Action DTO already established in this codebase (notifications,
 * payment history).
 */

export interface MessageDto {
  id: string;
  senderUserId: string;
  body: string;
  createdAt: string;
}

export function toMessageDto(row: { id: string; senderUserId: string; body: string; createdAt: Date }): MessageDto {
  return { id: row.id, senderUserId: row.senderUserId, body: row.body, createdAt: row.createdAt.toISOString() };
}

export interface ConversationSessionContextDto {
  kind: "upcoming" | "recent" | "none";
  bookingId: string | null;
  subjectSlug: string | null;
  startAt: string | null;
  endAt: string | null;
  timezone: string | null;
}

export function toSessionContextDto(context: ConversationSessionContext): ConversationSessionContextDto {
  return {
    kind: context.kind,
    bookingId: context.bookingId,
    subjectSlug: context.subjectSlug,
    startAt: context.startAt ? context.startAt.toISOString() : null,
    endAt: context.endAt ? context.endAt.toISOString() : null,
    timezone: context.timezone,
  };
}

export interface ConversationSummaryDto {
  id: string;
  studentFirstName: string;
  tutorFirstName: string;
  guardianFirstNames: string[];
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  sessionContext: ConversationSessionContextDto;
}

export function toConversationSummaryDto(summary: ConversationSummary): ConversationSummaryDto {
  return {
    id: summary.id,
    studentFirstName: summary.studentFirstName,
    tutorFirstName: summary.tutorFirstName,
    guardianFirstNames: summary.guardianFirstNames,
    lastMessageAt: summary.lastMessageAt ? summary.lastMessageAt.toISOString() : null,
    lastMessagePreview: summary.lastMessagePreview,
    unreadCount: summary.unreadCount,
    sessionContext: toSessionContextDto(summary.sessionContext),
  };
}
