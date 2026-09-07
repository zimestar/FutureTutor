import { db } from "@/lib/db";
import type { TutoringMode } from "@/generated/prisma/enums";

/**
 * STUDENT-PARENT-DASHBOARD-UPCOMING1 — a single, shared query for "which
 * real upcoming sessions should the dashboard home page show," used by
 * BOTH the Student and Parent branches of dashboard/page.tsx. Deliberately
 * NOT an authorization function: the caller is responsible for resolving
 * `studentProfileIds` to a server-authorized set FIRST (own StudentProfile
 * for a Student, listBookableStudentsForActor's result for a Parent —
 * mirroring the exact same discovery this codebase's own
 * /dashboard/bookings page already uses) — this function only ever queries
 * bookings for the ids it's given, never derives which ids are legitimate
 * itself. Passing an empty array is safe and always returns an empty list
 * without ever reaching the database, so a caller with zero authorized
 * students never needs its own separate short-circuit.
 *
 * "Upcoming" here is deliberately stricter than /dashboard/bookings' own
 * plain `endAt >= now` split (which intentionally also lists
 * DRAFT/PENDING_PAYMENT/CANCELLED bookings for a full history view): this
 * is a dashboard-home widget answering "do I have a real session coming
 * up," so only `status: "CONFIRMED"` counts — CANCELLED, DECLINED, and any
 * still-checking-out DRAFT/PENDING_PAYMENT booking are excluded by
 * construction (not filtered out after the fact) via the `where` clause
 * itself. `endAt >= now` (rather than `startAt >= now`) is reused from the
 * tutor dashboard's own established `nextBooking` query — this is what
 * correctly keeps a currently-IN_PROGRESS session visible as "upcoming"
 * too, not just a not-yet-started one.
 */
const UPCOMING_SESSIONS_LIMIT = 3;

export interface UpcomingBookingRow {
  id: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  mode: TutoringMode;
  studentProfileId: string;
  tutorFirstName: string;
  subjectSlug: string;
  hasSession: boolean;
}

export async function resolveUpcomingBookings(studentProfileIds: string[], now: Date = new Date()): Promise<UpcomingBookingRow[]> {
  if (studentProfileIds.length === 0) return [];

  const bookings = await db.booking.findMany({
    where: { studentProfileId: { in: studentProfileIds }, status: "CONFIRMED", endAt: { gte: now } },
    orderBy: { startAt: "asc" },
    take: UPCOMING_SESSIONS_LIMIT,
    select: {
      id: true,
      startAt: true,
      endAt: true,
      timezone: true,
      mode: true,
      studentProfileId: true,
      tutorProfile: { select: { user: { select: { name: true } } } },
      subject: { select: { slug: true } },
      session: { select: { id: true } },
    },
  });

  return bookings.map((booking) => ({
    id: booking.id,
    startAt: booking.startAt,
    endAt: booking.endAt,
    timezone: booking.timezone,
    mode: booking.mode,
    studentProfileId: booking.studentProfileId,
    tutorFirstName: booking.tutorProfile.user.name?.split(" ")[0] ?? "",
    subjectSlug: booking.subject.slug,
    hasSession: booking.session != null,
  }));
}
