import { z } from "zod";

/**
 * MESSAGING-MVP1A — plain text only, no Markdown, no HTML rendering.
 * Trimmed and length-bounded at this boundary before ever reaching the
 * domain service; the domain service re-validates independently (never
 * trusts a caller already validated).
 */
export const MESSAGE_MAX_LENGTH = 4000;

export const messageBodySchema = z
  .string()
  .trim()
  .min(1, "empty")
  .max(MESSAGE_MAX_LENGTH, "too_long");

/**
 * MESSAGING-DUPLICATE-SEND-FIX1 — a client-generated (crypto.randomUUID())
 * idempotency token for one logical send attempt. Validated for shape only
 * — never trusted for authorization, and never used to derive
 * senderUserId/conversationId (those remain server-resolved as before).
 */
export const clientMessageIdSchema = z.string().uuid();

export const sendMessageSchema = z.object({
  conversationId: z.string().trim().min(1),
  body: messageBodySchema,
  clientMessageId: clientMessageIdSchema,
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
