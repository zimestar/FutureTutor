import { z } from "zod";

export const createPriceQuoteSchema = z.object({
  // Phase H.7 — the selected learner (self, or a linked child). Never
  // trusted as authority on its own; every caller re-validates it against
  // H.2's canInitiatePaidBooking before using it for anything.
  studentProfileId: z.string().min(1),
  tutorProfileId: z.string().min(1),
  subjectId: z.string().min(1),
  academicLevelId: z.string().min(1).optional(),
  startAt: z.coerce.date(),
});

export type CreatePriceQuoteInput = z.infer<typeof createPriceQuoteSchema>;
