import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { TutoringMode } from "@/generated/prisma/enums";
import { canInitiatePaidBooking } from "@/services/studentAuthorization";
import { validateAndConsumeCustomerPriceQuote } from "@/services/customerPricing";
import { validateAndConsumeTutorPayoutQuote } from "@/services/tutorPayout";

export const ACTIVE_BOOKING_STATUSES = ["DRAFT", "PENDING_PAYMENT", "CONFIRMED"] as const;

export class SlotTakenError extends Error {}
/** Phase H.7 — the transaction-bound H.2 re-check (§17 of the H.7 prompt)
 * failed: the actor's authority over the learner was revoked (or never
 * existed) between the pre-check and this mutation. */
export class NotAuthorizedForLearnerError extends Error {}
/** Phase H.7 (§15/§27) — the CustomerPriceQuote being consumed was priced
 * for a DIFFERENT StudentProfile than the one this reservation targets. A
 * quote is bound to the exact learner it was calculated for; a Parent
 * selecting Child B while consuming a quote generated for Child A must
 * fail, never silently book Child B (or Child A) instead. */
export class QuoteLearnerMismatchError extends Error {}
/**
 * BETA-1 / P1-02 — the Payment named by input.paymentId is not a valid,
 * usable payment for this exact reservation: missing, belongs to a
 * different payer, was authorized against a different CustomerPriceQuote,
 * carries an amount/currency that no longer matches that quote, or is not
 * in a capturable (AUTHORIZED) or already-settled (CAPTURED, the
 * PAYMENT_MODE=disabled_dev bypass) state. Thrown BEFORE the Booking row
 * or the Payment/Booking link is created, so no Stripe capture is ever
 * reachable for a mismatched Payment.
 */
export class PaymentReservationMismatchError extends Error {}
/**
 * BETA-1 / P1-02 — the exclusive, conditional Payment -> Booking
 * attachment (`bookingId: null` guard) affected zero rows: the Payment was
 * concurrently attached to a different Booking between this function's own
 * pre-check and the write. Required invariant is exactly one row affected;
 * anything else aborts the whole reservation transaction before any Stripe
 * capture is attempted.
 */
export class PaymentAlreadyAttachedError extends Error {}

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
  // Phase H.7 — the authenticated actor performing this reservation: the
  // Student themselves (direct booking, SELF_MANAGED) or the original
  // TutoringRequest.createdByUserId (Quick Match — the actor re-checked
  // here is the requester who initiated matching, never the tutor
  // accepting the invitation, who has no learner/payer role at all).
  actorUserId: string;
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
 *
 * Phase H.7 (§17/§23/§28): this is the ONE place both Direct Booking and
 * Quick Match actually create the reservation row, so it is also the one
 * place the mandatory transaction-bound authority re-check belongs —
 * `canInitiatePaidBooking(tx, input.actorUserId, input.studentProfileId)`,
 * re-read fresh from inside this same Serializable transaction, immediately
 * before the protected mutation. A guardian relationship revoked after an
 * earlier pre-check (createBookingAction's own check, or the moment a
 * TutoringRequest was confirmed) is caught here, every time, regardless of
 * caller. Also enforces that the quote being consumed was actually priced
 * for this exact learner (`customerQuote.studentProfileId ===
 * input.studentProfileId`) — closing the "Child A quote + Child B selector"
 * gap a client-supplied studentProfileId could otherwise exploit.
 *
 * BETA-1 / P1-02 — this is also now the ONE place the complete immutable
 * booking/payment context is authoritatively validated BEFORE any Stripe
 * capture becomes reachable (captureAuthorizedPayment is only ever called
 * by the caller after this transaction has committed successfully). Quote
 * consumption (both customer and payout) moved here from post-capture
 * convergence (src/services/payments.ts's convergeToCaptured) — that
 * function's own consumeCustomerQuoteForConvergence /
 * consumeTutorPayoutQuoteForConvergence already no-op cleanly when a quote
 * is found already CONSUMED, so moving consumption earlier needs no change
 * on that side; it simply becomes a defense-in-depth idempotent re-check.
 * Previously, a client-supplied startAt/subjectId/academicLevelId/mode that
 * did not match the CustomerPriceQuote's own locked context was never
 * compared against it here at all — only the learner (studentProfileId)
 * was checked — so a valid, unconsumed quote/payment pair could reserve
 * (and then capture) a Booking for a different, non-overlapping slot or
 * subject than what was actually priced and authorized.
 */
export async function reserveBookingPendingPayment(
  tx: Prisma.TransactionClient,
  input: ReserveBookingPendingPaymentInput
) {
  const authorized = await canInitiatePaidBooking(tx, input.actorUserId, input.studentProfileId);
  if (!authorized) throw new NotAuthorizedForLearnerError();

  const conflict = await hasOverlappingActiveBooking(tx, input.tutorProfileId, input.startAt, input.endAt);
  if (conflict) throw new SlotTakenError();

  const preCheckCustomerQuote = await tx.customerPriceQuote.findUniqueOrThrow({
    where: { id: input.customerPriceQuoteId },
  });
  if (preCheckCustomerQuote.studentProfileId !== input.studentProfileId) {
    throw new QuoteLearnerMismatchError();
  }

  // Payment validation — BEFORE either quote is consumed and BEFORE the
  // Booking row exists, so a mismatched Payment aborts the whole
  // transaction with nothing written and no Stripe call ever reachable.
  const payment = await tx.payment.findUnique({ where: { id: input.paymentId } });
  if (
    !payment ||
    payment.payerUserId !== input.actorUserId ||
    payment.customerPriceQuoteId !== input.customerPriceQuoteId ||
    payment.bookingId !== null ||
    payment.amountCents !== preCheckCustomerQuote.totalCents ||
    payment.currency !== preCheckCustomerQuote.currency ||
    (payment.status !== "AUTHORIZED" && payment.status !== "CAPTURED")
  ) {
    throw new PaymentReservationMismatchError();
  }

  const durationMinutes = Math.round((input.endAt.getTime() - input.startAt.getTime()) / 60000);

  // Consumes the customer quote exactly here — validates ownership, status
  // (ACTIVE-with-TTL or LOCKED), and the full context fingerprint (subject,
  // academic level, mode, duration, requested start) against the quote's
  // own immutable contextHash. Throws (aborting this transaction, before
  // any Stripe call) on any mismatch or reuse attempt.
  const customerQuote = await validateAndConsumeCustomerPriceQuote(tx, input.customerPriceQuoteId, input.actorUserId, {
    subjectId: input.subjectId,
    academicLevelId: input.academicLevelId ?? null,
    tutoringMode: input.mode,
    durationMinutes,
    requestedStartAt: input.startAt,
  });

  // Consumes the payout quote exactly here — validates it belongs to the
  // intended Tutor and to this exact customer quote (closing "another
  // Tutor's payout quote" / "unrelated quote pairing" reuse), and that its
  // status is consumable. Throws (aborting this transaction) otherwise.
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

  // Exclusive attachment — the pre-check above already confirmed
  // payment.bookingId === null moments ago inside this same transaction,
  // but under Serializable isolation the authoritative signal is this
  // guarded write's own affected-row count, not the earlier read. Exactly
  // one row must be affected; zero (a concurrent attachment won the race,
  // or the row no longer matches) aborts the whole reservation — and with
  // it, both quote consumptions above — before any Stripe capture is ever
  // attempted. BETA-1 / P1-02: this count was previously never checked.
  const attachment = await tx.payment.updateMany({
    where: { id: input.paymentId, bookingId: null },
    data: { bookingId: booking.id },
  });
  if (attachment.count !== 1) {
    throw new PaymentAlreadyAttachedError();
  }

  return booking;
}
