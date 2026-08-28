"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canActForStudent } from "@/services/studentAuthorization";
import {
  resolveExactLocationAccess,
  toApproximateLocationDto,
  toExactLocationDto,
  type ApproximateLocationDto,
  type ExactLocationDto,
} from "@/services/bookingLocationAccess";

/**
 * BETA-IP1-A — the one server-side entry point either a Tutor or the
 * booking's own Student/Parent may call to learn an in-person Booking's
 * tutoring location. Never returns a raw Booking row; always one of the two
 * privacy-safe projections from bookingLocationAccess.ts, or a typed denial.
 *
 * Authorization is resolved fresh from the database on every call — no
 * client-supplied role, ownership, or confirmation claim is ever trusted
 * (per the mission's explicit §8 instruction).
 */
export type BookingLocationActionError = "notFound" | "notInPerson" | "denied";

export type BookingLocationActionResult =
  | { success: true; exact: true; location: ExactLocationDto }
  | { success: true; exact: false; location: ApproximateLocationDto }
  | { success: false; error: BookingLocationActionError };

export async function getBookingLocationAction(bookingId: string): Promise<BookingLocationActionResult> {
  const session = await auth();
  if (!session?.user || !bookingId) return { success: false, error: "denied" };

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      mode: true,
      status: true,
      tutorProfileId: true,
      studentProfileId: true,
      bookingAddressLine1: true,
      bookingAddressLine2: true,
      bookingCity: true,
      bookingProvince: true,
      bookingPostalCode: true,
    },
  });
  if (!booking) return { success: false, error: "notFound" };
  if (booking.mode !== "IN_PERSON") return { success: false, error: "notInPerson" };

  // The booking's own Student/Parent always sees the exact location they
  // (or their authorized guardian) submitted — no privacy boundary applies
  // to the party who provided the data. Checked first since it's the
  // simpler, already-established authorization primitive.
  const isOwner = await canActForStudent(db, session.user.id, booking.studentProfileId);
  if (isOwner) {
    return { success: true, exact: true, location: toExactLocationDto(booking) };
  }

  const access = await resolveExactLocationAccess(db, session.user.id, booking);
  if (access.granted) {
    return { success: true, exact: true, location: toExactLocationDto(booking) };
  }

  // A Tutor who is genuinely this booking's own Tutor, just not yet at the
  // confirmed stage, still gets the approximate view (same truncation as
  // the Quick Match dispatch payload). Anyone else — an unrelated Tutor, an
  // expired/losing invitation holder, a different Student/Parent — is
  // denied outright, never even the approximate view.
  if (access.reason === "BOOKING_NOT_CONFIRMED") {
    return { success: true, exact: false, location: toApproximateLocationDto(booking) };
  }

  return { success: false, error: "denied" };
}
