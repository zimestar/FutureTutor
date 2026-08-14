import { z } from "zod";

/**
 * Address fields stay optional at the schema-field level (matching this
 * codebase's existing convention of enforcing mode-conditional requirements
 * in Zod rather than DB constraints — e.g. Booking.academicLevelId) but are
 * required by the superRefine below whenever tutoringMode !== ONLINE. See
 * the TutoringRequest.addressLine1 schema comment (Prisma) for the
 * request/dispatch/booking location-tier reasoning this enforces.
 */
export const createTutoringRequestSchema = z
  .object({
    subjectId: z.string().min(1),
    academicLevelId: z.string().min(1).optional(),
    tutoringMode: z.enum(["ONLINE", "IN_PERSON", "BOTH"]),
    durationMinutes: z.coerce.number().int().min(15).max(240),
    requestedStartAt: z.coerce.date(),
    notes: z.string().max(2000).optional(),
    addressLine1: z.string().min(1).max(200).optional(),
    addressLine2: z.string().max(200).optional(),
    city: z.string().min(1).max(120).optional(),
    province: z.string().min(1).max(120).optional(),
    postalCode: z.string().min(1).max(20).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.tutoringMode === "ONLINE") {
      if (data.addressLine1 || data.addressLine2 || data.postalCode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Address fields must be empty for an online request",
          path: ["addressLine1"],
        });
      }
      return;
    }
    if (!data.addressLine1 || !data.city || !data.province || !data.postalCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A full address is required for an in-person request",
        path: ["addressLine1"],
      });
    }
  });

export type CreateTutoringRequestInput = z.infer<typeof createTutoringRequestSchema>;

export const confirmTutoringRequestSchema = z.object({
  tutoringRequestId: z.string().min(1),
  customerPriceQuoteId: z.string().min(1),
});

export const cancelTutoringRequestSchema = z.object({
  tutoringRequestId: z.string().min(1),
});

export const respondTutorInvitationSchema = z.object({
  tutorInvitationId: z.string().min(1),
});

export const declineTutorInvitationSchema = z.object({
  tutorInvitationId: z.string().min(1),
  declineReason: z.string().max(500).optional(),
});
