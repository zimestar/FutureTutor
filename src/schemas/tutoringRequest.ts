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
    // Phase H.7 — the selected learner (self, or a linked child). Untrusted
    // client input, re-authorized server-side against H.2 before use.
    studentProfileId: z.string().min(1),
    subjectId: z.string().min(1),
    // BETA-PRICINGFIX1 — required, not optional: see the identical comment
    // in src/schemas/pricing.ts. An unresolved/"Any level" academic level
    // must never reach quote generation.
    academicLevelId: z.string().min(1),
    tutoringMode: z.enum(["ONLINE", "IN_PERSON", "BOTH"]),
    durationMinutes: z.coerce.number().int().min(15).max(240),
    requestedStartAt: z.coerce.date(),
    notes: z.string().max(2000).optional(),
    addressLine1: z.string().min(1).max(200).optional(),
    addressLine2: z.string().max(200).optional(),
    city: z.string().min(1).max(120).optional(),
    province: z.string().min(1).max(120).optional(),
    postalCode: z.string().min(1).max(20).optional(),
    // BETA-IP1-C — optional free-text arrival guidance, same privacy tier
    // and mode-conditional handling as the address fields above. A 500-char
    // cap is generous for real human directions ("use the side entrance
    // and ring the bell") while bounding payload size, matching this
    // schema's existing declineReason field's own max-length discipline.
    arrivalInstructions: z.string().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.tutoringMode === "ONLINE") {
      if (data.addressLine1 || data.addressLine2 || data.postalCode || data.arrivalInstructions) {
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
