import { z } from "zod";

export const createBookingSchema = z.object({
  // Phase H.7 — the selected learner (self, or a linked child). Untrusted
  // client input, re-authorized server-side against H.2 before use.
  studentProfileId: z.string().min(1),
  tutorProfileId: z.string().min(1),
  subjectId: z.string().min(1),
  academicLevelId: z.string().min(1).optional(),
  startAt: z.coerce.date(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const cancelBookingSchema = z.object({
  bookingId: z.string().min(1),
});
