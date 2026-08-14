import "server-only";
import { db } from "@/lib/db";
import { createRefund } from "@/services/payments";
import { writeAuditLog } from "@/lib/audit";
import { notifyUser } from "@/lib/notify";

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export type CancellationTier = "FULL_REFUND" | "PARTIAL_REFUND" | "NO_REFUND";

/**
 * Exact boundary math, integer milliseconds — >= on both thresholds so no
 * instant falls into two branches: exactly 48h -> 100%, exactly 24h -> 50%.
 * This tier table is a given product specification, not invented here.
 */
export function calculateCancellationRefund(
  sessionStartAt: Date,
  now: Date,
  amountCents: number
): { tier: CancellationTier; refundPercent: number; refundCents: number } {
  const msUntilSession = sessionStartAt.getTime() - now.getTime();

  let tier: CancellationTier;
  let refundPercent: number;
  if (msUntilSession >= FORTY_EIGHT_HOURS_MS) {
    tier = "FULL_REFUND";
    refundPercent = 1;
  } else if (msUntilSession >= TWENTY_FOUR_HOURS_MS) {
    tier = "PARTIAL_REFUND";
    refundPercent = 0.5;
  } else {
    tier = "NO_REFUND";
    refundPercent = 0;
  }

  return { tier, refundPercent, refundCents: Math.round(amountCents * refundPercent) };
}

const CANCELLABLE_STATUSES = ["DRAFT", "PENDING_PAYMENT", "CONFIRMED"] as const;

export class BookingNotCancellableError extends Error {}

/**
 * PRODUCT DECISION REQUIRED (Phase G plan, not yet approved as final
 * policy): tutor compensation on a customer-initiated cancellation, per
 * refund tier. This implements the conservative default named in the
 * plan's readiness check — the tutor's earning is voided regardless of
 * tier (never split/prorated) — pending an explicit decision. Change only
 * this function's earning-handling branch if that decision lands
 * differently; the refund-calculation math itself is the given product
 * spec, not the open question.
 *
 * Tutor-initiated cancellation is a separate, uncontroversial rule: full
 * customer refund regardless of tier, tutor gets no earning — a
 * tutor-caused cancellation is not the customer's fault.
 */
export async function cancelBookingWithRefund(bookingId: string, actorUserId: string): Promise<void> {
  const booking = await db.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { studentProfile: true, tutorProfile: true, payment: true },
  });

  if (!(CANCELLABLE_STATUSES as readonly string[]).includes(booking.status)) {
    throw new BookingNotCancellableError();
  }

  const isTutorCancelling = booking.tutorProfile.userId === actorUserId;
  const now = new Date();
  const fromStatus = booking.status;

  await db.$transaction(async (tx) => {
    const updated = await tx.booking.updateMany({
      where: { id: booking.id, status: { in: [...CANCELLABLE_STATUSES] } },
      data: {
        status: "CANCELLED",
        cancelledByUserId: actorUserId,
        cancelledAt: now,
        cancellationReason: isTutorCancelling ? "Cancelled by tutor" : "Cancelled by customer",
      },
    });
    if (updated.count === 0) throw new BookingNotCancellableError();

    await tx.bookingStatusHistory.create({
      data: { bookingId: booking.id, fromStatus, toStatus: "CANCELLED", changedByUserId: actorUserId },
    });

    // Void the tutor's earning if one already exists — never touches an
    // already-TRANSFERRED earning (that's the "refund after transfer"
    // case, §20 of the Phase G plan: FutureTutor carries that exposure,
    // never an automatic clawback).
    const earning = await tx.tutorEarning.findUnique({ where: { bookingId: booking.id } });
    if (earning) {
      await tx.tutorEarning.updateMany({
        where: { id: earning.id, status: { in: ["PENDING_ELIGIBLE", "ELIGIBLE"] } },
        data: { status: "CANCELLED", cancelledAt: now },
      });
    }
  });

  await writeAuditLog({
    actorUserId,
    action: isTutorCancelling ? "booking.cancelled_by_tutor" : "booking.cancelled_by_customer",
    entityType: "Booking",
    entityId: booking.id,
  });

  if (!booking.payment || booking.payment.status !== "CAPTURED") {
    // Nothing was ever captured (still PENDING_PAYMENT, or payment never
    // reached this booking at all for a legacy pre-Phase-G row) — nothing
    // to refund.
    return;
  }

  const remainingCents = booking.payment.amountCents - booking.payment.refundedAmountCents;
  const refundCents = isTutorCancelling
    ? remainingCents
    : calculateCancellationRefund(booking.startAt, now, booking.payment.amountCents).refundCents;

  if (refundCents <= 0) return;

  const refund = await createRefund({
    bookingId: booking.id,
    paymentId: booking.payment.id,
    amountCents: Math.min(refundCents, remainingCents),
    reason: isTutorCancelling ? "Tutor cancelled the session" : "Customer cancelled the session",
    actorUserId,
  });

  await writeAuditLog({
    actorUserId,
    action: "payment.refunded",
    entityType: "Refund",
    entityId: refund.id,
    metadata: { bookingId: booking.id, amountCents: refund.amountCents },
  });

  await notifyUser(db, {
    userId: booking.studentProfile.userId,
    type: "payment.refunded",
    title: "Refund issued",
    body: `A refund of ${(refund.amountCents / 100).toFixed(2)} ${refund.currency} has been issued for your cancelled session.`,
    metadata: { bookingId: booking.id, refundId: refund.id },
  });
}
