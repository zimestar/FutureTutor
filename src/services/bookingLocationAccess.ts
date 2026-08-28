import "server-only";
import type { BookingStatus, PrismaClient, TutoringMode } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";

/**
 * BETA-IP1-A — in-person tutoring location privacy boundary.
 *
 * Mirrors the established authority/window-eligibility shape already used
 * for video-join (src/services/videoJoinAuthorization.ts): a pure decision
 * function fed server-derived facts, plus an IO wrapper that re-resolves
 * those facts fresh from the database and never trusts client-supplied
 * booking-ownership/confirmation claims. Two independent concerns, composed
 * at the call site rather than merged into one function — same reasoning
 * as computeVideoJoinAuthority vs. computeVideoJoinWindowEligibility.
 *
 * Product rule (see the mission's own §1/§9): before a Booking reaches
 * CONFIRMED, even the Tutor who ultimately wins the match sees only an
 * approximate location (city/province/FSA) — the full address is written
 * onto the Booking row at claim time (bookingCreation.ts, Step A, before
 * Stripe capture) but this module is what governs whether it may ever be
 * READ back out to the Tutor, independent of when it was written.
 */

/** Booking statuses in which the Tutor was legitimately booked and should
 * retain exact-location access — including after the session concludes
 * (COMPLETED/NO_SHOW), since access already granted at CONFIRMED time must
 * not be silently revoked once the session is over (records/disputes). A
 * booking that never confirmed or was later invalidated (DRAFT,
 * PENDING_PAYMENT, DECLINED, CANCELLED, REFUNDED, RESCHEDULED) never
 * reaches this list. */
const EXACT_ACCESS_BOOKING_STATUSES: ReadonlySet<BookingStatus> = new Set(["CONFIRMED", "COMPLETED", "NO_SHOW"]);

export type ExactLocationDenialReason = "NOT_IN_PERSON" | "NOT_BOOKING_TUTOR" | "BOOKING_NOT_CONFIRMED";

export type ExactLocationAccessResult = { granted: true } | { granted: false; reason: ExactLocationDenialReason };

/** Pure — no I/O. Every input is a fact the caller must already have
 * resolved from authoritative state; this function makes no DB calls and
 * trusts nothing it wasn't explicitly given. */
export function computeExactLocationAccess(input: {
  bookingMode: TutoringMode;
  bookingStatus: BookingStatus;
  isBookingTutor: boolean;
}): ExactLocationAccessResult {
  if (input.bookingMode !== "IN_PERSON") return { granted: false, reason: "NOT_IN_PERSON" };
  if (!input.isBookingTutor) return { granted: false, reason: "NOT_BOOKING_TUTOR" };
  if (!EXACT_ACCESS_BOOKING_STATUSES.has(input.bookingStatus)) return { granted: false, reason: "BOOKING_NOT_CONFIRMED" };
  return { granted: true };
}

/** IO wrapper — re-resolves "is this actor actually the booking's own
 * Tutor" fresh from the database every call (never trusts a client-supplied
 * role/ownership claim, per the mission's explicit §8 instruction). Accepts
 * a transaction client so callers can compose this inside the same
 * transaction as the read it's guarding, closing the same TOCTOU window
 * studentAuthorization.ts's own doc comment documents. */
export async function resolveExactLocationAccess(
  client: Prisma.TransactionClient | PrismaClient,
  actorUserId: string,
  booking: { mode: TutoringMode; status: BookingStatus; tutorProfileId: string }
): Promise<ExactLocationAccessResult> {
  const tutorProfile = await client.tutorProfile.findUnique({ where: { userId: actorUserId }, select: { id: true } });
  const isBookingTutor = tutorProfile?.id === booking.tutorProfileId;
  return computeExactLocationAccess({ bookingMode: booking.mode, bookingStatus: booking.status, isBookingTutor });
}

// ---------------------------------------------------------------------------
// Privacy-safe projections — the ONLY two shapes this feature ever returns
// to a Tutor. Never expose a raw Booking/TutoringRequest row.
// ---------------------------------------------------------------------------

export interface ApproximateLocationDto {
  mode: "IN_PERSON";
  exactAddressAvailable: false;
  city: string | null;
  province: string | null;
  /** First 3 characters of the postal code (Canadian FSA) — same
   * truncation already used for Quick Match dispatch payloads
   * (tutor/quick-match/page.tsx's dispatchLocation projection). Never the
   * full postal code. */
  postalCodePrefix: string | null;
}

export interface ExactLocationDto {
  mode: "IN_PERSON";
  exactAddressAvailable: true;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  country: "CA";
}

/** Source shape both projections read from — the Booking row's own
 * immutable location snapshot (bookingCreation.ts), never the live
 * TutoringRequest (which is not gated the same way and may not even still
 * exist by the time this is called). */
export interface BookingLocationSnapshotSource {
  bookingAddressLine1: string | null;
  bookingAddressLine2: string | null;
  bookingCity: string | null;
  bookingProvince: string | null;
  bookingPostalCode: string | null;
}

export function toApproximateLocationDto(snapshot: BookingLocationSnapshotSource): ApproximateLocationDto {
  return {
    mode: "IN_PERSON",
    exactAddressAvailable: false,
    city: snapshot.bookingCity,
    province: snapshot.bookingProvince,
    postalCodePrefix: snapshot.bookingPostalCode?.slice(0, 3) ?? null,
  };
}

export function toExactLocationDto(snapshot: BookingLocationSnapshotSource): ExactLocationDto {
  return {
    mode: "IN_PERSON",
    exactAddressAvailable: true,
    addressLine1: snapshot.bookingAddressLine1,
    addressLine2: snapshot.bookingAddressLine2,
    city: snapshot.bookingCity,
    province: snapshot.bookingProvince,
    postalCode: snapshot.bookingPostalCode,
    country: "CA",
  };
}
