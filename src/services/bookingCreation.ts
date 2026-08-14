import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { TutoringMode } from "@/generated/prisma/enums";
import { validateAndConsumeCustomerPriceQuote } from "@/services/customerPricing";
import { validateAndConsumeTutorPayoutQuote } from "@/services/tutorPayout";

export const ACTIVE_BOOKING_STATUSES = ["DRAFT", "PENDING_PAYMENT", "CONFIRMED"] as const;

export class SlotTakenError extends Error {}

/**
 * True interval-overlap conflict check: existing.startAt < newEnd AND
 * existing.endAt > newStart. Replaces the previous exact-startAt-equality
 * check (safe only by accident, since every session used to be a fixed 60
 * minutes) — Quick Match's variable-duration TutoringRequest.durationMinutes
 * would have silently slipped past that check. Shared by both direct
 * booking and Quick Match so there is exactly one definition of "conflict,"
 * not two.
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

export interface CreateBookingFromQuotesInput {
  studentProfileId: string;
  tutorProfileId: string;
  subjectId: string;
  academicLevelId?: string | null;
  startAt: Date;
  endAt: Date;
  timezone: string;
  mode: TutoringMode;
  // The authenticated actor — used both as the quote-ownership check and as
  // the BookingStatusHistory "changed by" actor.
  createdByUserId: string;
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
 * The single authoritative "consume both quotes + create Booking +
 * BookingStatusHistory + Session_" core, called from inside a Serializable
 * transaction by both direct booking (createBookingAction) and Quick Match
 * (acceptTutorInvitationAction) — see each call site for its own
 * slot-conflict / eligibility / concurrency guards, which run around this
 * function, not inside it.
 */
export async function createBookingFromQuotes(tx: Prisma.TransactionClient, input: CreateBookingFromQuotesInput) {
  const conflict = await hasOverlappingActiveBooking(tx, input.tutorProfileId, input.startAt, input.endAt);
  if (conflict) throw new SlotTakenError();

  const durationMinutes = Math.round((input.endAt.getTime() - input.startAt.getTime()) / 60000);

  const customerQuote = await validateAndConsumeCustomerPriceQuote(
    tx,
    input.customerPriceQuoteId,
    input.createdByUserId,
    {
      subjectId: input.subjectId,
      academicLevelId: input.academicLevelId,
      tutoringMode: input.mode,
      durationMinutes,
      requestedStartAt: input.startAt,
    }
  );
  const payoutQuote = await validateAndConsumeTutorPayoutQuote(
    tx,
    input.tutorPayoutQuoteId,
    input.tutorProfileId,
    input.customerPriceQuoteId
  );

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
      status: "CONFIRMED",
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
    data: { bookingId: booking.id, toStatus: "CONFIRMED", changedByUserId: input.createdByUserId },
  });
  await tx.session_.create({ data: { bookingId: booking.id, status: "SCHEDULED" } });

  return { booking, customerQuote, payoutQuote };
}
