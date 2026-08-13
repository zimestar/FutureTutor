import { z } from "zod";

export const createBookingSchema = z.object({
  tutorProfileId: z.string().min(1),
  subjectId: z.string().min(1),
  academicLevelId: z.string().min(1).optional(),
  startAt: z.coerce.date(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const cancelBookingSchema = z.object({
  bookingId: z.string().min(1),
});
