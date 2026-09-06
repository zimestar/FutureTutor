import type { MessageDto } from "@/lib/messagingPresentation";

/**
 * MESSAGING-DUPLICATE-SEND-FIX1 — identity-based (Message.id) dedupe, used
 * by MessageThread.tsx at every point new messages are merged into local
 * state: the send-response append, the polling-response append, and the
 * older-pagination prepend. Never dedupes by body/sender/timestamp — two
 * intentional identical-body messages are distinct rows and must both
 * render; only Message.id determines duplication.
 *
 * `first` is kept in full and placed first in the result; any item in
 * `second` whose id already appears in `first` is dropped (the two are the
 * same row from two different fetches — which copy survives is
 * immaterial). Calling this as mergeByMessageId(prev, newer) appends
 * (poll/send-response paths); calling it as mergeByMessageId(older, prev)
 * prepends (pagination path) — one function covers both, since the caller
 * controls order by which array goes first.
 *
 * This is a UI-level safety net for a specific named race (send succeeds
 * and appends its own response, then a poll tick — using a
 * latestCreatedAtRef captured before the send's own append — independently
 * returns that same just-sent Message and appends it again) and for
 * ordinary poll/pagination overlap. It is not a replacement for the
 * server-side clientMessageId idempotency guarantee (messaging.ts's
 * sendMessage) — that is what prevents a second Message ROW from ever
 * being persisted in the first place; this only prevents the same
 * already-persisted row from being rendered twice.
 *
 * Extracted to its own module (rather than living inline in
 * MessageThread.tsx) specifically so it can be unit-tested directly — that
 * component's own import chain (next-intl, Server Actions) cannot be
 * loaded in this codebase's Node-environment Vitest setup, but this pure
 * function has no such dependency.
 */
export function mergeByMessageId(first: MessageDto[], second: MessageDto[]): MessageDto[] {
  if (second.length === 0) return first;
  const seen = new Set(first.map((m) => m.id));
  return [...first, ...second.filter((m) => !seen.has(m.id))];
}
