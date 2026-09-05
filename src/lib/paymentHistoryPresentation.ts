import type { PaymentStatus, RefundStatus, TutoringMode } from "@/generated/prisma/enums";

/**
 * PAYMENT-HISTORY1 — customer-facing payment status mapping.
 *
 * Deliberately covers ONLY the three statuses that ever represent money
 * actually captured (CAPTURED, PARTIALLY_REFUNDED, REFUNDED) — the query
 * that feeds this (getPaymentHistoryPageAction) filters to exactly these
 * three, so every other PaymentStatus (PENDING, REQUIRES_ACTION,
 * AUTHORIZED, FAILED, CANCELLED, CAPTURE_FAILED) never reaches this
 * function in practice. It still returns null for them rather than
 * throwing, as a defensive fallback — this is a presentation function,
 * never the place a filtering decision is enforced twice.
 *
 * Documented policy (mission's own explicit "safely omit and document"
 * option): a customer never sees a payment attempt that didn't result in
 * captured funds. Showing PENDING/AUTHORIZED could wrongly suggest a
 * charge is settled; showing FAILED/CANCELLED would misleadingly present
 * a non-charge as a line item in what is meant to be a list of money
 * actually paid. Per-confirmation-attempt detail (PaymentAttempt rows)
 * is a separate, internal reconciliation concept and is never surfaced
 * here at all.
 */
export type PaymentHistoryStatus = "PAID" | "PARTIALLY_REFUNDED" | "REFUNDED";

export function mapPaymentStatus(status: PaymentStatus): PaymentHistoryStatus | null {
  if (status === "CAPTURED") return "PAID";
  if (status === "PARTIALLY_REFUNDED") return "PARTIALLY_REFUNDED";
  if (status === "REFUNDED") return "REFUNDED";
  return null;
}

export interface RefundHistoryDto {
  id: string;
  amountCents: number;
  currency: string;
  status: RefundStatus;
  createdAt: string;
}

export interface PaymentHistoryBookingDto {
  id: string;
  subjectSlug: string;
  academicLevelSlug: string | null;
  tutorFirstName: string;
  mode: TutoringMode;
  startAt: string;
  endAt: string;
  timezone: string;
}

export interface PaymentHistoryDto {
  id: string;
  amountCents: number;
  currency: string;
  refundedAmountCents: number;
  netAmountCents: number;
  status: PaymentHistoryStatus;
  /** The payment's own capturedAt — "when you actually paid," distinct
   * from the booking's session date. Always non-null for a row that
   * reached this DTO, since only CAPTURED+ statuses are ever queried. */
  paidAt: string;
  /** Null only in the structurally-possible-but-practically-unreachable
   * case of a captured payment with no linked Booking (bookingId is
   * nullable in schema) — the UI must render this safely rather than
   * assume it's always present. */
  booking: PaymentHistoryBookingDto | null;
  /** Every persisted Refund row for this payment, oldest first — never
   * recomputed, never re-derived; refundedAmountCents above is the
   * separate, already-authoritative aggregate this mission was told to
   * reuse rather than re-sum itself. */
  refunds: RefundHistoryDto[];
}

interface PaymentRow {
  id: string;
  amountCents: number;
  currency: string;
  refundedAmountCents: number;
  status: PaymentStatus;
  capturedAt: Date | null;
  createdAt: Date;
  booking: {
    id: string;
    subjectSlug: string;
    academicLevelSlug: string | null;
    tutorFirstName: string;
    mode: TutoringMode;
    startAt: Date;
    endAt: Date;
    timezone: string;
  } | null;
  refunds: Array<{ id: string; amountCents: number; currency: string; status: RefundStatus; createdAt: Date }>;
}

export function toPaymentHistoryDto(row: PaymentRow): PaymentHistoryDto | null {
  const status = mapPaymentStatus(row.status);
  if (!status) return null;

  return {
    id: row.id,
    amountCents: row.amountCents,
    currency: row.currency,
    refundedAmountCents: row.refundedAmountCents,
    netAmountCents: row.amountCents - row.refundedAmountCents,
    status,
    // Falls back to createdAt only in the never-expected case of a
    // CAPTURED+ row missing capturedAt (defensive, never silently 1970).
    paidAt: (row.capturedAt ?? row.createdAt).toISOString(),
    booking: row.booking
      ? {
          id: row.booking.id,
          subjectSlug: row.booking.subjectSlug,
          academicLevelSlug: row.booking.academicLevelSlug,
          tutorFirstName: row.booking.tutorFirstName,
          mode: row.booking.mode,
          startAt: row.booking.startAt.toISOString(),
          endAt: row.booking.endAt.toISOString(),
          timezone: row.booking.timezone,
        }
      : null,
    refunds: row.refunds.map((r) => ({
      id: r.id,
      amountCents: r.amountCents,
      currency: r.currency,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
