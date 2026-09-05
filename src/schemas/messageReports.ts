import { z } from "zod";

/** MESSAGING-MVP1C — plain text only, bounded, same discipline as Message.body. */
export const MESSAGE_REPORT_DETAIL_MAX_LENGTH = 1000;

export const MESSAGE_REPORT_REASONS = [
  "INAPPROPRIATE_CONTENT",
  "HARASSMENT",
  "OFF_PLATFORM_REQUEST",
  "SAFETY_CONCERN",
  "SPAM",
  "OTHER",
] as const;

export const createMessageReportSchema = z.object({
  messageId: z.string().trim().min(1),
  reason: z.enum(MESSAGE_REPORT_REASONS),
  detail: z
    .string()
    .trim()
    .max(MESSAGE_REPORT_DETAIL_MAX_LENGTH, "too_long")
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
});

export type CreateMessageReportInput = z.infer<typeof createMessageReportSchema>;
