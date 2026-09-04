import { z } from "zod";

export const createBookingSchema = z.object({
  // Phase H.7 — the selected learner (self, or a linked child). Untrusted
  // client input, re-authorized server-side against H.2 before use.
  studentProfileId: z.string().min(1),
  tutorProfileId: z.string().min(1),
  subjectId: z.string().min(1),
  academicLevelId: z.string().min(1).optional(),
  startAt: z.coerce.date(),
  // PROD-DIRECT-BOOKING-MODEFIX1 — see schemas/pricing.ts's identical field
  // for the full rationale. Must be the same value submitted at quote-
  // creation time; a mismatch is caught by the quote's own contextHash
  // check inside reserveBookingPendingPayment (QuoteContextMismatchError),
  // not by anything in this schema.
  tutoringMode: z.enum(["ONLINE", "IN_PERSON"]).optional(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const cancelBookingSchema = z.object({
  bookingId: z.string().min(1),
  // Phase H.8 (§18) — optional free-text reason, written to the
  // already-existing BookingStatusHistory.reason field. No migration.
  reason: z.string().max(500).optional(),
});
