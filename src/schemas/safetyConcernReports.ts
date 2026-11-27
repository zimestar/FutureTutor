import { z } from "zod";

/** SAFETY-REPORTS1 — input rules for a safety concern report (plain text only). */
export const SAFETY_CONCERN_CATEGORIES = [
  "CHILD_SAFETY",
  "INAPPROPRIATE_BEHAVIOUR",
  "HARASSMENT_OR_THREAT",
  "OFF_PLATFORM_CONTACT",
  "PRIVACY_OR_SECURITY",
  "OTHER",
] as const;

export const SAFETY_CONCERN_STATUSES = ["OPEN", "UNDER_REVIEW", "RESOLVED"] as const;

export const SAFETY_CONCERN_DESCRIPTION_MIN_LENGTH = 20;
export const SAFETY_CONCERN_DESCRIPTION_MAX_LENGTH = 4000;
export const SAFETY_CONCERN_CONCERNING_MAX_LENGTH = 300;
export const SAFETY_CONCERN_NOTE_MAX_LENGTH = 4000;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "too_long")
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined));

export const createSafetyConcernReportSchema = z.object({
  category: z.enum(SAFETY_CONCERN_CATEGORIES),
  immediateDanger: z.boolean(),
  concerning: optionalText(SAFETY_CONCERN_CONCERNING_MAX_LENGTH),
  description: z
    .string()
    .trim()
    .min(SAFETY_CONCERN_DESCRIPTION_MIN_LENGTH, "too_short")
    .max(SAFETY_CONCERN_DESCRIPTION_MAX_LENGTH, "too_long"),
});

export type CreateSafetyConcernReportInput = z.input<typeof createSafetyConcernReportSchema>;

export const updateSafetyConcernReportSchema = z.object({
  status: z.enum(SAFETY_CONCERN_STATUSES),
  resolutionNote: optionalText(SAFETY_CONCERN_NOTE_MAX_LENGTH),
});
