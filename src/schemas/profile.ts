import { z } from "zod";

/**
 * Phase H.6 — profile-edit Server Action boundary validation. Every field
 * here is OPTIONAL: only fields the client actually submitted appear as
 * keys in the parsed object (see src/lib/actions/profile.ts, which reads
 * FormData by an explicit enumerated field list rather than
 * Object.fromEntries, so an unknown key never even reaches this schema).
 * This schema validates SHAPE/VALUE only — it has no notion of which
 * fields a given actor is authorized to submit. That authorization-scoped
 * allowlist is a completely separate, server-side check performed by
 * src/services/profileManagement.ts's resolveEditableStudentProfileFields,
 * every time, regardless of what this schema accepts as well-formed.
 */
export const updateStudentProfileSchema = z.object({
  studentProfileId: z.string().trim().min(1),
  firstName: z.string().trim().min(1).max(50).optional(),
  lastName: z.string().trim().min(1).max(50).optional(),
  province: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  academicLevelId: z.string().trim().max(100).optional(),
  tutoringMode: z.enum(["ONLINE", "IN_PERSON", "BOTH"]).optional(),
  preferredLanguage: z.enum(["en", "fr"]).optional(),
});

export const updateParentProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(50).optional(),
  lastName: z.string().trim().min(1).max(50).optional(),
  province: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  preferredLanguage: z.enum(["en", "fr"]).optional(),
});
