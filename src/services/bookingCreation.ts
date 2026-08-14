import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { TutoringMode } from "@/generated/prisma/enums";

export const ACTIVE_BOOKING_STATUSES = ["DRAFT", "PENDING_PAYMENT", "CONFIRMED"] as const;

export class SlotTakenError extends Error {}

/**
 * True interval-overlap conflict check: existing.startAt < newEnd AND
 * existing.endAt > newStart. PENDING_PAYMENT is included in
 * ACTIVE_BOOKING_STATUSES deliberately (Phase G) — a durable slot
 * reservation blocks a second overlapping reservation attempt for the same
 * tutor the same way a CONFIRMED booking already does, closing the race
 * before it would ever reach Stripe. Shared by both direct booking and
 * Quick Match so there is exactly one definition of "conflict," not two.
 */
export async function hasOverlappingActiveBooking(
  tx: Prisma.TransactionClient,
  tutorProfileId: string,
  startAt: Date,
  endAt: Date
): Promise<boolean> {
  const conflict = await tx.booking.findFirst({
    where: {
      tutorProfileId,
      status: { in: [...ACTIVE_BOOKING_STATUSES] },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    select: { id: true },
  });
  return conflict != null;
}

export interface BookingLocationSnapshot {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
}

export interface ReserveBookingPendingPaymentInput {
  studentProfileId: string;
  tutorProfileId: string;
  subjectId: string;
  academicLevelId?: string | null;
  startAt: Date;
  endAt: Date;
  timezone: string;
  mode: TutoringMode;
  // The already-authorized Payment (Payment.status === AUTHORIZED) this
  // reservation is being made against — linked here, consumed later in
  // src/services/payments.ts's convergeToCaptured once capture succeeds.
  paymentId: string;
  // Read for their already-locked/accepted values but NOT consumed here —
  // consumption happens only in convergeToCaptured, once payment capture
  // has actually been confirmed by Stripe (see the Payment model's schema
  // domain comment for the full Step A/B/C rationale).
  customerPriceQuoteId: string;
  tutorPayoutQuoteId: string;
  // Set only by Quick Match; direct/Browse-Tutors bookings leave this null.
  tutoringRequestId?: string | null;
  // Set only by Quick Match in-person bookings — the authoritative location
  // snapshot (see Booking.bookingAddressLine1 etc. schema comment). Direct
  // booking collects no address today, so this stays absent for that flow.
  location?: BookingLocationSnapshot | null;
}

/**
 * Step A of the payment-aware booking flow (see the Payment model's schema
 * domain comment) — the single authoritative "reserve the tutor slot"
 * core, called from inside a Serializable transaction by both direct
 * booking (createBookingAction) and Quick Match (acceptTutorInvitationAction)
 * before Stripe is ever called. No external network call happens inside
 * this function or its caller's transaction. Creates a PENDING_PAYMENT
 * Booking — quotes stay LOCKED/ACCEPTED, not yet consumed; Session_ is not
 * created yet either, since it represents a real scheduled session and this
 * reservation might still fail to reach CONFIRMED (see
 * src/services/payments.ts's convergeToCaptured / convergeToCaptureFailed
 * for the two possible resolutions).
 */
export async function reserveBookingPendingPayment(
  tx: Prisma.TransactionClient,
  input: ReserveBookingPendingPaymentInput
) {
  const conflict = await hasOverlappingActiveBooking(tx, input.tutorProfileId, input.startAt, input.endAt);
  if (conflict) throw new SlotTakenError();

  const customerQuote = await tx.customerPriceQuote.findUniqueOrThrow({ where: { id: input.customerPriceQuoteId } });
  const payoutQuote = await tx.tutorPayoutQuote.findUniqueOrThrow({ where: { id: input.tutorPayoutQuoteId } });

  const grossSpreadCents = customerQuote.subtotalCents - payoutQuote.totalPayoutCents;

  const booking = await tx.booking.create({
    data: {
      studentProfileId: input.studentProfileId,
      tutorProfileId: input.tutorProfileId,
      subjectId: input.subjectId,
      academicLevelId: input.academicLevelId ?? null,
      startAt: input.startAt,
      endAt: input.endAt,
      timezone: input.timezone,
      mode: input.mode,
      platformFeeCentsSnapshot: 0,
      totalCents: customerQuote.totalCents,
      status: "PENDING_PAYMENT",
      customerPriceQuoteId: customerQuote.id,
      tutorPayoutQuoteId: payoutQuote.id,
      customerBasePriceCents: customerQuote.basePriceCents,
      customerAdjustmentCents: customerQuote.adjustmentsTotalCents,
      customerSubtotalCents: customerQuote.subtotalCents,
      taxCents: customerQuote.taxCents,
      tutorPayoutBaseCents: payoutQuote.basePayoutCents,
      tutorPayoutAdjustmentCents: payoutQuote.adjustmentsTotalCents,
      tutorPayoutCents: payoutQuote.totalPayoutCents,
      grossSpreadCents,
      customerPricingVersion: customerQuote.pricingVersion,
      tutorPayoutVersion: payoutQuote.payoutVersion,
      tutoringRequestId: input.tutoringRequestId ?? null,
      bookingAddressLine1: input.location?.addressLine1 ?? null,
      bookingAddressLine2: input.location?.addressLine2 ?? null,
      bookingCity: input.location?.city ?? null,
      bookingProvince: input.location?.province ?? null,
      bookingPostalCode: input.location?.postalCode ?? null,
    },
  });

  await tx.bookingStatusHistory.create({
    data: { bookingId: booking.id, toStatus: "PENDING_PAYMENT" },
  });

  // Guarded — only links if this Payment hasn't already been linked to a
  // different booking (shouldn't happen given Payment.bookingId's own
  // uniqueness, but the guard costs nothing and documents the invariant).
  await tx.payment.updateMany({
    where: { id: input.paymentId, bookingId: null },
    data: { bookingId: booking.id },
  });

  return booking;
}
