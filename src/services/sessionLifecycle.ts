import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { Role, SessionParticipantRole, SessionStatus, TutoringMode } from "@/generated/prisma/enums";
import { withSerializableRetry } from "@/lib/serializableRetry";
import {
  resolveSessionCheckInAuthority,
  resolveSessionViewerAuthority,
  type SessionCheckInActorRole,
  type SessionViewerRole,
} from "@/services/sessionAuthorization";

/**
 * Session Lifecycle Phase 2 — the transactional check-in service and the
 * server-authorized session read model. ATTENDANCE/CHECK-IN ONLY: no
 * no-show determination, no incidents/disputes, no automatic completion, no
 * TutorEarning/financial effect. Structured as a peer to
 * cancellationPolicy.ts, following its exact Serializable-transaction +
 * withSerializableRetry + fast-pre-check/authoritative-re-check shape.
 */

// ---------------------------------------------------------------------------
// V1 early check-in window — a PRODUCT-CONFIGURABLE CHOICE, not an
// unquestionable decision. No prior planning document fixes this number; the
// architecture audit (§12 of the Phase 2 task) explicitly asks for a
// conservative, documented default pending product review. 15 minutes before
// Booking.startAt was chosen because: (a) it mirrors the same 15-minute
// order-of-magnitude already used elsewhere in this product's planning for
// the no-show grace boundary, keeping one consistent mental model rather
// than inventing a second unrelated constant; (b) it is short enough that it
// cannot be used to "reserve" a check-in hours or days in advance (the
// explicit risk called out in §12); (c) it is trivially adjustable — a
// single named constant, not scattered magic numbers. This is flagged again
// in the Phase 2 report §14 for explicit review.
export const CHECK_IN_WINDOW_MINUTES_BEFORE_START = 15;
export const CHECK_IN_WINDOW_MS_BEFORE_START = CHECK_IN_WINDOW_MINUTES_BEFORE_START * 60 * 1000;

/** Session_ states in which recording a NEW attendance event is permitted.
 * SCHEDULED (not yet started) and IN_PROGRESS (already started — repeat/
 * reconnect check-ins remain evidence-legal) are the only pre-terminal
 * states; CANCELLED/COMPLETED/NO_SHOW/INTERRUPTED are all terminal-for-this-
 * phase's-purposes and reject check-in outright (§9/§16 of the task). */
const CHECK_IN_ELIGIBLE_SESSION_STATUSES = ["SCHEDULED", "IN_PROGRESS"] as const;

export class SessionCheckInNotAuthorizedError extends Error {}
export class SessionNotFoundError extends Error {}
export class SessionNotCheckInEligibleError extends Error {}
export class SessionCheckInTooEarlyError extends Error {}

export interface RecordSessionCheckInOptions {
  /** Fresh-read from the DB by the caller, never trusted from a stale
   * session object — mirrors cancellationPolicy.ts's own CancelBookingWithRefundOptions. */
  actorRole: Role;
  /** Injectable clock — real time by default. Both Layer 1 (fast pre-check)
   * and the authoritative transaction call this fresh, immediately before
   * each comparison and immediately before the persisted occurredAt is
   * derived. NEVER a client-supplied timestamp — see the Phase 2 report §7. */
  clock?: () => Date;
}

export interface RecordSessionCheckInResult {
  attendanceEventId: string;
  sessionId: string;
  bookingId: string;
  actorRole: SessionCheckInActorRole;
  occurredAt: Date;
  sessionStatus: SessionStatus;
  startedAt: Date | null;
  tutorHasCheckedIn: boolean;
  studentHasCheckedIn: boolean;
  /** True only on the specific call whose write caused SCHEDULED ->
   * IN_PROGRESS — never true on a repeat check-in after the session is
   * already IN_PROGRESS. */
  transitionedToInProgress: boolean;
}

interface BookingSessionFacts {
  bookingId: string;
  bookingStatus: string;
  bookingStartAt: Date;
  studentProfileId: string;
  tutorProfileUserId: string;
  sessionId: string;
  sessionStatus: SessionStatus;
}

async function loadBookingSessionFacts(
  client: Prisma.TransactionClient | typeof db,
  bookingId: string
): Promise<BookingSessionFacts | null> {
  const booking = await client.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      startAt: true,
      studentProfileId: true,
      tutorProfile: { select: { userId: true } },
      session: { select: { id: true, status: true } },
    },
  });
  if (!booking || !booking.session) return null;
  return {
    bookingId: booking.id,
    bookingStatus: booking.status,
    bookingStartAt: booking.startAt,
    studentProfileId: booking.studentProfileId,
    tutorProfileUserId: booking.tutorProfile.userId,
    sessionId: booking.session.id,
    sessionStatus: booking.session.status,
  };
}

export type CheckInEligibilityRejection = "BOOKING_NOT_CONFIRMED" | "SESSION_NOT_IN_ELIGIBLE_STATE" | "TOO_EARLY";

export interface CheckInEligibilityInput {
  bookingStatus: string;
  bookingStartAt: Date;
  sessionStatus: SessionStatus;
  now: Date;
}

/**
 * PURE decision logic — no I/O. Mirrors calculateCancellationRefund's own
 * "pure boundary function, unit-tested at the exact instant" pattern
 * (cancellationPolicy.ts). >= on the window-open boundary — an attempt at
 * EXACTLY windowOpensAt is eligible, one millisecond before is not, so no
 * instant falls into two branches.
 */
export function computeCheckInEligibility(input: CheckInEligibilityInput): CheckInEligibilityRejection | null {
  if (input.bookingStatus !== "CONFIRMED") return "BOOKING_NOT_CONFIRMED";
  if (!(CHECK_IN_ELIGIBLE_SESSION_STATUSES as readonly string[]).includes(input.sessionStatus)) {
    return "SESSION_NOT_IN_ELIGIBLE_STATE";
  }
  const windowOpensAt = input.bookingStartAt.getTime() - CHECK_IN_WINDOW_MS_BEFORE_START;
  if (input.now.getTime() < windowOpensAt) return "TOO_EARLY";
  return null;
}

function assertCheckInEligible(facts: BookingSessionFacts, now: Date): void {
  const rejection = computeCheckInEligibility({
    bookingStatus: facts.bookingStatus,
    bookingStartAt: facts.bookingStartAt,
    sessionStatus: facts.sessionStatus,
    now,
  });
  if (rejection === "TOO_EARLY") throw new SessionCheckInTooEarlyError();
  if (rejection != null) throw new SessionNotCheckInEligibleError();
}

/**
 * Records one attendance-evidence event for `participantRole` and, if this
 * is the moment BOTH required presence subjects now have at least one valid
 * CHECK_IN, transitions Session_.status SCHEDULED -> IN_PROGRESS with a
 * server-derived startedAt. Guarded, idempotent, safely re-callable (repeat
 * check-ins are recorded as additional evidence but never overwrite
 * startedAt or re-fire the transition).
 *
 * Two-layer TOCTOU-safe pattern, mirroring cancelBookingWithRefund /
 * reserveBookingPendingPayment exactly:
 *  - Layer 1 (fast, non-transactional pre-check, client = ambient db):
 *    cheap rejection before opening a transaction.
 *  - Layer 2 (authoritative, inside the Serializable transaction, client =
 *    tx): the ONLY check that is ever trusted for the actual mutation.
 */
export async function recordSessionCheckIn(
  bookingId: string,
  actorUserId: string,
  participantRole: SessionParticipantRole,
  options: RecordSessionCheckInOptions
): Promise<RecordSessionCheckInResult> {
  const clock = options.clock ?? (() => new Date());

  // Layer 1 — fast pre-check, may use a slightly-stale `now`; never the
  // authoritative decision.
  const preCheckFacts = await loadBookingSessionFacts(db, bookingId);
  if (!preCheckFacts) throw new SessionNotFoundError();
  const preCheckAuthority = await resolveSessionCheckInAuthority(db, actorUserId, participantRole, {
    studentProfileId: preCheckFacts.studentProfileId,
    tutorProfileUserId: preCheckFacts.tutorProfileUserId,
  });
  if (preCheckAuthority === "DENIED") throw new SessionCheckInNotAuthorizedError();
  assertCheckInEligible(preCheckFacts, clock());

  const result = await withSerializableRetry(() =>
    db.$transaction(
      async (tx) => {
        // 1. Re-fetch booking+session fresh via tx — never trust the Layer 1 read.
        const facts = await loadBookingSessionFacts(tx, bookingId);
        if (!facts) throw new SessionNotFoundError();

        // 2. Authoritative re-check (Layer 2) — the exact same function as
        // Layer 1, re-invoked with tx, immediately before the guarded write.
        const authority = await resolveSessionCheckInAuthority(tx, actorUserId, participantRole, {
          studentProfileId: facts.studentProfileId,
          tutorProfileUserId: facts.tutorProfileUserId,
        });
        if (authority === "DENIED") throw new SessionCheckInNotAuthorizedError();

        // 3. Booking/Session state + early-window floor, re-evaluated inside
        // the authoritative transaction with a freshly-derived clock() —
        // never only at Layer 1.
        const now = clock();
        assertCheckInEligible(facts, now);

        // 4. Append-only evidence write. occurredAt is ALWAYS `now` (server
        // clock()) — no client-supplied timestamp field exists on this
        // function's input at all, so a forged client timestamp has no
        // path to influence this value by construction.
        const attendanceEvent = await tx.sessionAttendanceEvent.create({
          data: {
            sessionId: facts.sessionId,
            participantRole,
            recordedByUserId: actorUserId,
            eventType: "CHECK_IN",
            occurredAt: now,
            source: "IN_PERSON_MANUAL",
          },
        });

        // 5. Derive "has each side checked in at all" from EVIDENCE
        // EXISTENCE (not a mutable boolean/count) — this is what makes two
        // concurrent first check-ins for the same role race-safe: both
        // inserts succeed (append-only), and the derivation below is
        // computed fresh, inside this same transaction, from the current
        // row set. See the SessionAttendanceEvent model's own doc comment.
        const [tutorEvidence, studentEvidence] = await Promise.all([
          tx.sessionAttendanceEvent.findFirst({
            where: { sessionId: facts.sessionId, participantRole: "TUTOR", eventType: "CHECK_IN" },
            select: { id: true },
          }),
          tx.sessionAttendanceEvent.findFirst({
            where: { sessionId: facts.sessionId, participantRole: "STUDENT", eventType: "CHECK_IN" },
            select: { id: true },
          }),
        ]);
        const tutorHasCheckedIn = tutorEvidence != null;
        const studentHasCheckedIn = studentEvidence != null;

        // 6. Guarded, idempotent SCHEDULED -> IN_PROGRESS transition. Only
        // fires when both sides are present AND the session is still
        // SCHEDULED — updateMany's `where` clause is the concurrency guard
        // (mirrors Session_'s existing SCHEDULED->CANCELLED guard in
        // cancellationPolicy.ts exactly): if two racing check-in calls both
        // observe "both present" in the same instant, only one of their
        // updateMany calls can match count=1 (Postgres row-level locking
        // under Serializable isolation serializes the two transactions),
        // the other matches count=0 and is a clean no-op. startedAt is
        // therefore written exactly once, never overwritten by a later
        // repeat check-in (the guard's `status: "SCHEDULED"` no longer
        // matches once the first transition has committed).
        let transitionedToInProgress = false;
        let sessionStatus = facts.sessionStatus;
        let startedAt: Date | null = null;

        if (tutorHasCheckedIn && studentHasCheckedIn && facts.sessionStatus === "SCHEDULED") {
          const updated = await tx.session_.updateMany({
            where: { id: facts.sessionId, status: "SCHEDULED" },
            data: { status: "IN_PROGRESS", startedAt: now },
          });
          if (updated.count === 1) {
            transitionedToInProgress = true;
          }
        }

        // 7. Re-read the authoritative post-write session state — never
        // assume the in-memory `sessionStatus`/`startedAt` above reflect
        // what actually committed (mirrors cancelBookingWithRefund's own
        // "authoritative post-write re-read" discipline).
        const finalSession = await tx.session_.findUniqueOrThrow({
          where: { id: facts.sessionId },
          select: { status: true, startedAt: true },
        });
        sessionStatus = finalSession.status;
        startedAt = finalSession.startedAt;

        return {
          attendanceEventId: attendanceEvent.id,
          sessionId: facts.sessionId,
          bookingId: facts.bookingId,
          actorRole: authority,
          occurredAt: now,
          sessionStatus,
          startedAt,
          tutorHasCheckedIn,
          studentHasCheckedIn,
          transitionedToInProgress,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  );

  return result;
}

// ---------------------------------------------------------------------------
// Session read model (SUI-1/SUI-2 support) — server-authorized, minimal.
// Deliberately does NOT expose raw SessionAttendanceEvent history to
// participants (§14 of the task) — only derived booleans/aggregates. Does
// NOT expose any financial decision logic (TutorEarning/eligibility/payout)
// — Session Lifecycle Phase 2 has zero financial surface by design.
// ---------------------------------------------------------------------------

export type SessionAllowedAction = "CHECK_IN_AS_TUTOR" | "CHECK_IN_AS_STUDENT";

export interface SessionContext {
  sessionId: string;
  bookingId: string;
  subjectId: string;
  subjectSlug: string;
  mode: TutoringMode;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  timezone: string;
  status: SessionStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  viewerRole: SessionViewerRole;
  /** The learner this session's Student side represents — always the
   * booking's own StudentProfile, exposed only because the viewer is
   * already authorized to see this booking at all (never new exposure). */
  representedLearner: { studentProfileId: string; firstName: string; lastName: string };
  tutorPresenceRecorded: boolean;
  studentPresenceRecorded: boolean;
  /** Who recorded the STUDENT-side presence, exposed only as a coarse
   * "self / guardian / tutor" label (never a raw user id) — safe because it
   * answers "was this declared by the learner themselves, a guardian, or
   * the tutor," which is exactly the attribution rule D requires be
   * preserved, without leaking a raw attendance-event history. Null until
   * recorded. */
  studentPresenceRecordedBy: "STUDENT" | "GUARDIAN" | "TUTOR" | null;
  checkInWindowOpensAt: Date;
  viewerCanCheckInAsTutor: boolean;
  viewerCanCheckInAsStudent: boolean;
  allowedActions: SessionAllowedAction[];
}

export class SessionViewerNotAuthorizedError extends Error {}

export async function getSessionContext(
  bookingId: string,
  actorUserId: string,
  actorRole: Role,
  options: { clock?: () => Date } = {}
): Promise<SessionContext> {
  const clock = options.clock ?? (() => new Date());

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      startAt: true,
      endAt: true,
      timezone: true,
      mode: true,
      subject: { select: { id: true, slug: true } },
      studentProfileId: true,
      studentProfile: { select: { firstName: true, lastName: true } },
      tutorProfile: { select: { userId: true } },
      session: { select: { id: true, status: true, startedAt: true, completedAt: true } },
    },
  });
  if (!booking || !booking.session) throw new SessionNotFoundError();

  const bookingFacts = { studentProfileId: booking.studentProfileId, tutorProfileUserId: booking.tutorProfile.userId };
  const viewerRole = await resolveSessionViewerAuthority(db, actorUserId, actorRole, bookingFacts);
  if (viewerRole === "DENIED") throw new SessionViewerNotAuthorizedError();

  const [tutorEvidence, studentEvidence] = await Promise.all([
    db.sessionAttendanceEvent.findFirst({
      where: { sessionId: booking.session.id, participantRole: "TUTOR", eventType: "CHECK_IN" },
      select: { id: true },
      orderBy: { occurredAt: "asc" },
    }),
    db.sessionAttendanceEvent.findFirst({
      where: { sessionId: booking.session.id, participantRole: "STUDENT", eventType: "CHECK_IN" },
      select: { recordedByUserId: true },
      orderBy: { occurredAt: "asc" },
    }),
  ]);

  const tutorPresenceRecorded = tutorEvidence != null;
  const studentPresenceRecorded = studentEvidence != null;

  let studentPresenceRecordedBy: SessionContext["studentPresenceRecordedBy"] = null;
  if (studentEvidence) {
    if (studentEvidence.recordedByUserId === booking.tutorProfile.userId) {
      studentPresenceRecordedBy = "TUTOR";
    } else {
      // Either the learner's own login or a guardian — resolve via H.2's
      // own capability check rather than re-deriving guardian logic here.
      const recordedByAuthority =
        studentEvidence.recordedByUserId == null
          ? null
          : await resolveSessionCheckInAuthority(db, studentEvidence.recordedByUserId, "STUDENT", bookingFacts);
      studentPresenceRecordedBy =
        recordedByAuthority === "GUARDIAN"
          ? "GUARDIAN"
          : recordedByAuthority === "SELF_MANAGED_STUDENT" || recordedByAuthority === "GUARDIAN_MANAGED_STUDENT_SELF"
            ? "STUDENT"
            : null;
    }
  }

  const checkInWindowOpensAt = new Date(booking.startAt.getTime() - CHECK_IN_WINDOW_MS_BEFORE_START);

  let viewerCanCheckInAsTutor = false;
  let viewerCanCheckInAsStudent = false;
  const eligibilityFacts: BookingSessionFacts = {
    bookingId: booking.id,
    bookingStatus: booking.status,
    bookingStartAt: booking.startAt,
    studentProfileId: booking.studentProfileId,
    tutorProfileUserId: booking.tutorProfile.userId,
    sessionId: booking.session.id,
    sessionStatus: booking.session.status,
  };
  const now = clock();
  let stateEligible = true;
  try {
    assertCheckInEligible(eligibilityFacts, now);
  } catch {
    stateEligible = false;
  }

  if (stateEligible) {
    if (!tutorPresenceRecorded) {
      const tutorAuthority = await resolveSessionCheckInAuthority(db, actorUserId, "TUTOR", bookingFacts);
      viewerCanCheckInAsTutor = tutorAuthority !== "DENIED";
    }
    if (!studentPresenceRecorded) {
      const studentAuthority = await resolveSessionCheckInAuthority(db, actorUserId, "STUDENT", bookingFacts);
      viewerCanCheckInAsStudent = studentAuthority !== "DENIED";
    }
  }

  const allowedActions: SessionAllowedAction[] = [];
  if (viewerCanCheckInAsTutor) allowedActions.push("CHECK_IN_AS_TUTOR");
  if (viewerCanCheckInAsStudent) allowedActions.push("CHECK_IN_AS_STUDENT");

  return {
    sessionId: booking.session.id,
    bookingId: booking.id,
    subjectId: booking.subject.id,
    subjectSlug: booking.subject.slug,
    mode: booking.mode,
    scheduledStartAt: booking.startAt,
    scheduledEndAt: booking.endAt,
    timezone: booking.timezone,
    status: booking.session.status,
    startedAt: booking.session.startedAt,
    completedAt: booking.session.completedAt,
    viewerRole,
    representedLearner: {
      studentProfileId: booking.studentProfileId,
      firstName: booking.studentProfile.firstName,
      lastName: booking.studentProfile.lastName,
    },
    tutorPresenceRecorded,
    studentPresenceRecorded,
    studentPresenceRecordedBy,
    checkInWindowOpensAt,
    viewerCanCheckInAsTutor,
    viewerCanCheckInAsStudent,
    allowedActions,
  };
}
