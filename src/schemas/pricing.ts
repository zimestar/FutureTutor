import { z } from "zod";

export const createPriceQuoteSchema = z.object({
  tutorProfileId: z.string().min(1),
  subjectId: z.string().min(1),
  academicLevelId: z.string().min(1).optional(),
  startAt: z.coerce.date(),
});

export type CreatePriceQuoteInput = z.infer<typeof createPriceQuoteSchema>;
