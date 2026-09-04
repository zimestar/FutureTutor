import { z } from "zod";

export const createPriceQuoteSchema = z.object({
  // Phase H.7 — the selected learner (self, or a linked child). Never
  // trusted as authority on its own; every caller re-validates it against
  // H.2's canInitiatePaidBooking before using it for anything.
  studentProfileId: z.string().min(1),
  tutorProfileId: z.string().min(1),
  subjectId: z.string().min(1),
  // BETA-PRICINGFIX1 — required, not optional: an unresolved/"Any level"
  // academic level must never reach quote generation (see
  // FutureTutor_BETA_PRICINGGAP_AUDIT1_REPORT.md). The UI never submits a
  // quote request without a concrete level (see BookingWidget.tsx's
  // quoteKey gating); this is the server-authoritative backstop for a
  // crafted/bypassed request.
  academicLevelId: z.string().min(1),
  startAt: z.coerce.date(),
  // PROD-DIRECT-BOOKING-MODEFIX1 — the customer's actual requested session
  // mode, required only when the tutor's own capability is BOTH (see
  // resolveRequestedTutoringMode). Never "BOTH" — that value is rejected by
  // the resolver, not by this schema, so the same malformed-input path is
  // exercised for every illegal value rather than splitting the check here.
  tutoringMode: z.enum(["ONLINE", "IN_PERSON"]).optional(),
});

export type CreatePriceQuoteInput = z.infer<typeof createPriceQuoteSchema>;
