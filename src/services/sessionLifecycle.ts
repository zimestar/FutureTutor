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

// ---------------------------------------------------------------------------
// Session Lifecycle Phase 3 — no-show convergence at the T+15 grace
// deadline. PRODUCT-RATIFIED (unlike the still-provisional check-in window
// above): check-in opens at T-15, the no-show decision point is T+15 —
// i.e. Booking.startAt + 15 minutes. Deliberately reuses the same
// order-of-magnitude constant family as CHECK_IN_WINDOW_MINUTES_BEFORE_START
// for one consistent mental model, but is a SEPARATE named constant (never
// derived from it) since the two are independently product-decided
// boundaries either side of Booking.startAt.
// ---------------------------------------------------------------------------
export const NO_SHOW_GRACE_PERIOD_MINUTES_AFTER_START = 15;
export const NO_SHOW_GRACE_PERIOD_MS_AFTER_START = NO_SHOW_GRACE_PERIOD_MINUTES_AFTER_START * 60 * 1000;

/** T+15 — the authoritative no-show grace deadline for a Booking. Pure,
 * zero-I/O, reused by the read model (getSessionContext) and by the
 * convergence decision logic below so there is exactly one definition of
 * "T+15" in the codebase. */
export function computeNoShowGraceDeadline(bookingStartAt: Date): Date {
  return new Date(bookingStartAt.getTime() + NO_SHOW_GRACE_PERIOD_MS_AFTER_START);
}

/**
 * Session Lifecycle Phase 3 — no-show convergence outcome. NOT a persisted
 * enum value: Session_.status only ever gets the single existing NO_SHOW
 * value written to it (see prisma/schema.prisma's SessionStatus — no
 * STUDENT_NO_SHOW/TUTOR_NO_SHOW enum members exist, and none are added by
 * this phase). Which specific case (A/B/C from the task spec) occurred is
 * always reconstructable after the fact from the append-only
 * SessionAttendanceEvent CHECK_IN rows for the session — this decision type
 * is that reconstruction, computed fresh from evidence, never stored.
 *  - NOT_APPLICABLE: Booking isn't CONFIRMED, or Session_ isn't SCHEDULED
 *    (already resolved some other way — IN_PROGRESS, CANCELLED, already
 *    NO_SHOW, etc.) — nothing for convergence to do.
 *  - NOT_YET_DUE: now < T+15 — no no-show transition permitted (§4).
 *  - NO_TRANSITION_DUAL_PRESENT: both sides already have CHECK_IN evidence
 *    (case D — the session should already be IN_PROGRESS via
 *    recordSessionCheckIn's own dual-presence transition; if it somehow
 *    isn't yet, this is a safe no-op, never a no-show).
 *  - STUDENT_NO_SHOW (case A): Tutor checked in, Student did not.
 *  - TUTOR_NO_SHOW (case B): Student checked in, Tutor did not.
 *  - NO_SHOW_UNRESOLVED (case C): neither side checked in. Per the Phase 3
 *    task's own instruction to audit the existing model before inventing a
 *    new status: plain Session_.status = "NO_SHOW" is a faithful
 *    representation of this case too — "zero CHECK_IN evidence from either
 *    role" is exactly as reconstructable from SessionAttendanceEvent as
 *    cases A/B are, so no new enum value/column is introduced for it.
 */
export type SessionNoShowDecision =
  | "NOT_APPLICABLE"
  | "NOT_YET_DUE"
  | "NO_TRANSITION_DUAL_PRESENT"
  | "STUDENT_NO_SHOW"
  | "TUTOR_NO_SHOW"
  | "NO_SHOW_UNRESOLVED";

/** The three decisions that mean "Session_.status should (or already did)
 * move SCHEDULED -> NO_SHOW." */
const TERMINAL_NO_SHOW_DECISIONS: readonly SessionNoShowDecision[] = [
  "STUDENT_NO_SHOW",
  "TUTOR_NO_SHOW",
  "NO_SHOW_UNRESOLVED",
];

function isTerminalNoShowDecision(decision: SessionNoShowDecision): boolean {
  return TERMINAL_NO_SHOW_DECISIONS.includes(decision);
}

export interface NoShowDecisionInput {
  bookingStatus: string;
  sessionStatus: SessionStatus;
  bookingStartAt: Date;
  /** Derived from CHECK_IN evidence row EXISTENCE — never a client-supplied
   * flag (§5 item 6 / §10 of the task: "Do not derive presence from
   * frontend flags"). */
  tutorHasCheckedIn: boolean;
  studentHasCheckedIn: boolean;
  now: Date;
}

/**
 * PURE decision logic — no I/O. Mirrors computeCheckInEligibility's and
 * calculateCancellationRefund's own "pure boundary function, unit-tested at
 * the exact instant" pattern. >= on the T+15 boundary — an evaluation at
 * EXACTLY the grace deadline is eligible for convergence, one millisecond
 * before is not (§4 of the task: "exactly T+15 -> eligible for
 * convergence"), so no instant falls into two branches.
 */
export function decideNoShowOutcome(input: NoShowDecisionInput): SessionNoShowDecision {
  if (input.bookingStatus !== "CONFIRMED") return "NOT_APPLICABLE";
  if (input.sessionStatus !== "SCHEDULED") return "NOT_APPLICABLE";

  const graceDeadlineAt = computeNoShowGraceDeadline(input.bookingStartAt).getTime();
  if (input.now.getTime() < graceDeadlineAt) return "NOT_YET_DUE";

  if (input.tutorHasCheckedIn && input.studentHasCheckedIn) return "NO_TRANSITION_DUAL_PRESENT";
  if (input.tutorHasCheckedIn && !input.studentHasCheckedIn) return "STUDENT_NO_SHOW";
  if (!input.tutorHasCheckedIn && input.studentHasCheckedIn) return "TUTOR_NO_SHOW";
  return "NO_SHOW_UNRESOLVED";
}

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

interface NoShowConvergenceOutcome {
  decision: SessionNoShowDecision;
  /** True only when THIS invocation's own updateMany performed the
   * SCHEDULED -> NO_SHOW write — never true when it merely observed an
   * already-converged, not-yet-due, or dual-present session. */
  transitioned: boolean;
  /** Authoritative post-write status (re-read fresh when a write happened;
   * the input snapshot's status otherwise). */
  sessionStatus: SessionStatus;
  tutorHasCheckedIn: boolean;
  studentHasCheckedIn: boolean;
}

/**
 * Session Lifecycle Phase 3 — the single shared transactional core for
 * no-show convergence, reused by BOTH (a) the convergence-first step
 * embedded in recordSessionCheckIn below (§7 of the task — a late check-in
 * must not silently defeat an already-due no-show decision) and (b) the
 * standalone resolveSessionNoShowConvergence entrypoint (cron / any future
 * trusted caller). Exactly one guarded `updateMany`, keyed on the expected
 * prior state (status: "SCHEDULED"), mirrors every other Session_
 * transition in this file and in cancellationPolicy.ts — concurrent
 * duplicate invocations (two convergence workers, a check-in racing a cron
 * tick, a second convergence call after the first already converged) are
 * safe no-ops by construction: only one caller's updateMany can ever match
 * count===1; every other observes count===0.
 *
 * MUST be called with `facts` freshly re-read (via loadBookingSessionFacts)
 * inside the SAME open transaction, immediately before this call — never a
 * pre-transaction or cross-transaction snapshot. `now` MUST be `clock()`
 * evaluated fresh inside that same transaction — never a client-supplied
 * value (no parameter on any Phase 3 input type accepts one).
 *
 * IMPORTANT caller contract: this function only ever WRITES (the guarded
 * SCHEDULED -> NO_SHOW updateMany); it never throws a business-rule error
 * and never rolls back its own write. A caller that wants to reject an
 * action (e.g. a check-in) because convergence just happened (or already
 * had) must NOT throw synchronously inside the same open transaction this
 * write is part of — Prisma would roll back the whole transaction,
 * including the just-committed NO_SHOW write. Instead, return a rejection
 * marker from the transaction callback and throw AFTER it has committed
 * (see recordSessionCheckIn's own step 3.5 below for the concrete pattern).
 */
async function applyNoShowConvergenceIfDue(
  tx: Prisma.TransactionClient,
  facts: BookingSessionFacts,
  now: Date
): Promise<NoShowConvergenceOutcome> {
  // Presence derived from EVIDENCE EXISTENCE only — never a frontend flag,
  // never this call's own not-yet-inserted evidence row (callers embedding
  // this ahead of their own evidence write rely on that ordering — see the
  // Phase 3 report's "late check-in race semantics" section for why).
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

  const decision = decideNoShowOutcome({
    bookingStatus: facts.bookingStatus,
    sessionStatus: facts.sessionStatus,
    bookingStartAt: facts.bookingStartAt,
    tutorHasCheckedIn,
    studentHasCheckedIn,
    now,
  });

  if (!isTerminalNoShowDecision(decision)) {
    return { decision, transitioned: false, sessionStatus: facts.sessionStatus, tutorHasCheckedIn, studentHasCheckedIn };
  }

  // Guarded, idempotent SCHEDULED -> NO_SHOW transition — the `where`
  // clause is the concurrency guard (mirrors Session_'s existing
  // SCHEDULED->CANCELLED / SCHEDULED->IN_PROGRESS guarded transitions
  // exactly): a concurrent duplicate convergence attempt racing to the
  // same outcome will have its updateMany match count===0 and no-op
  // cleanly under Postgres Serializable isolation.
  const updated = await tx.session_.updateMany({
    where: { id: facts.sessionId, status: "SCHEDULED" },
    data: { status: "NO_SHOW" },
  });
  const transitioned = updated.count === 1;

  // Authoritative post-write re-read — never assume the in-memory decision
  // reflects what actually committed (mirrors cancelBookingWithRefund's own
  // "authoritative post-write re-read" discipline).
  const finalSession = await tx.session_.findUniqueOrThrow({
    where: { id: facts.sessionId },
    select: { status: true },
  });

  return { decision, transitioned, sessionStatus: finalSession.status, tutorHasCheckedIn, studentHasCheckedIn };
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

        // 3.5. Session Lifecycle Phase 3 (§7) — convergence-first ordering.
        // Phase 2 permitted unbounded late check-in while Session_ remained
        // SCHEDULED; Phase 3 closes that ambiguity. If the T+15 grace
        // deadline has already passed for a still-SCHEDULED session,
        // evaluate — and, if due, PERFORM — no-show convergence using
        // evidence that existed BEFORE this call's own check-in is recorded
        // below (applyNoShowConvergenceIfDue queries evidence fresh, and
        // this call's own row has not been inserted yet at this point in
        // the transaction). This is what prevents a late arrival from
        // silently "rescuing" an already-due no-show decision by completing
        // dual presence a moment after the deadline: the decision is a
        // snapshot, at/after T+15, of who had ALREADY established presence
        // — not a race the late arrival can still win merely by checking in
        // a beat sooner than a convergence sweep happens to run.
        //
        // Documented race semantics (§7 of the task):
        //  - now < T+15: this block is skipped entirely (facts.sessionStatus
        //    === "SCHEDULED" is the only gate, decideNoShowOutcome itself
        //    would also return NOT_YET_DUE) — normal check-in flow below,
        //    unchanged from Phase 2.
        //  - now >= T+15 and PRIOR evidence already shows dual presence
        //    (NO_TRANSITION_DUAL_PRESENT — sufficient valid presence was
        //    established before the deadline): no no-show applies; normal
        //    flow below proceeds and the ordinary IN_PROGRESS transition
        //    fires (self-healing, since this call is necessarily a repeat
        //    check-in from one of the two sides in that scenario).
        //  - now >= T+15 and prior evidence is one-sided or absent
        //    (STUDENT_NO_SHOW / TUTOR_NO_SHOW / NO_SHOW_UNRESOLVED): this
        //    transaction performs the guarded SCHEDULED -> NO_SHOW write
        //    itself (or observes that a concurrent convergence already
        //    did), and THIS check-in attempt is rejected — convergence
        //    wins, exactly matching "terminal no-show sessions reject
        //    later check-in." The write must COMMIT even though the
        //    check-in is rejected, so rejection is signalled by returning a
        //    marker (never by throwing inside this transaction, which would
        //    roll back the NO_SHOW write itself — see
        //    applyNoShowConvergenceIfDue's own doc comment) and translated
        //    to SessionNotCheckInEligibleError AFTER the transaction has
        //    committed, below.
        //  - If a concurrent convergence transaction (another check-in, or
        //    the cron sweep) commits the NO_SHOW transition first, this
        //    transaction's own fresh re-read of `facts` (step 1 — re-run on
        //    every Serializable retry) already observes the terminal status
        //    and rejects via the ordinary assertCheckInEligible path at
        //    step 3 above — no special-casing needed for that ordering.
        if (facts.sessionStatus === "SCHEDULED") {
          const convergence = await applyNoShowConvergenceIfDue(tx, facts, now);
          if (isTerminalNoShowDecision(convergence.decision)) {
            return { rejectedByConvergence: true as const };
          }
        }

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
          rejectedByConvergence: false as const,
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

  // The convergence-first step (3.5) returns a marker rather than throwing,
  // so that its own NO_SHOW write (if this call's own updateMany performed
  // it) commits regardless of this check-in ultimately being rejected. The
  // throw happens here, strictly AFTER the transaction has already
  // committed — see applyNoShowConvergenceIfDue's doc comment for why.
  if (result.rejectedByConvergence) {
    throw new SessionNotCheckInEligibleError();
  }

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
  /** T+15 — the authoritative no-show grace deadline (Session Lifecycle
   * Phase 3). Server-computed from scheduledStartAt + the ratified 15-minute
   * grace period (computeNoShowGraceDeadline) — the UI must always read
   * this field rather than recomputing "+15 minutes" itself (§15 of the
   * Phase 3 task: what the UI may calculate vs. what it must never decide).
   * A countdown/remaining-time display may be derived client-side from this
   * authoritative timestamp; the timestamp itself is never fabricated. */
  graceDeadlineAt: Date;
  /** Non-null only when status === "NO_SHOW". Reconstructed, at read time,
   * from the SAME append-only CHECK_IN evidence used everywhere else in
   * this file — no new column or enum value exists for this; see
   * decideNoShowOutcome's doc comment for why plain Session_.status =
   * "NO_SHOW" plus attendance evidence is a faithful representation of
   * every case (A/B/C). Null while the session has not (yet) reached
   * NO_SHOW. */
  noShowOutcome: "STUDENT_NO_SHOW" | "TUTOR_NO_SHOW" | "NO_SHOW_UNRESOLVED" | null;
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

  // Session Lifecycle Phase 3 — T+15 grace deadline + the reconstructed
  // no-show outcome (never a new column; see decideNoShowOutcome's doc
  // comment). "which case A/B/C occurred" is always derivable from
  // tutorPresenceRecorded/studentPresenceRecorded, already computed above.
  const graceDeadlineAt = computeNoShowGraceDeadline(booking.startAt);
  let noShowOutcome: SessionContext["noShowOutcome"] = null;
  if (booking.session.status === "NO_SHOW") {
    if (tutorPresenceRecorded && !studentPresenceRecorded) noShowOutcome = "STUDENT_NO_SHOW";
    else if (!tutorPresenceRecorded && studentPresenceRecorded) noShowOutcome = "TUTOR_NO_SHOW";
    else noShowOutcome = "NO_SHOW_UNRESOLVED";
  }

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
    graceDeadlineAt,
    noShowOutcome,
    viewerCanCheckInAsTutor,
    viewerCanCheckInAsStudent,
    allowedActions,
  };
}

// ---------------------------------------------------------------------------
// Session Lifecycle Phase 3 — no-show convergence entrypoints. NO-SHOW
// CONVERGENCE ONLY: no completion, no interruption workflow, no
// incidents/disputes, no reviews, no TutorEarning eligibility change, no
// refunds, no notifications, no frontend UI. See the Phase 3 implementation
// report for the full design rationale, including why plain
// Session_.status = "NO_SHOW" (no new enum value/column) faithfully
// represents every case (A/B/C).
// ---------------------------------------------------------------------------

export interface ResolveSessionNoShowConvergenceOptions {
  /** Injectable clock — real time by default. Evaluated fresh, inside the
   * authoritative transaction, exactly like every other Session Lifecycle
   * time-boundary decision in this file. NEVER a client-supplied timestamp
   * — this function's input type has no such field, so a forged client
   * "now"/"noShowAt" has no path to influence the decision by
   * construction (§4/§12 of the task). */
  clock?: () => Date;
}

export interface SessionNoShowConvergenceResult {
  bookingId: string;
  sessionId: string;
  decision: SessionNoShowDecision;
  /** True only on the specific call whose own updateMany performed the
   * SCHEDULED -> NO_SHOW transition — never true on a call that merely
   * observed an already-converged, not-yet-due, dual-present, or
   * not-applicable (e.g. cancelled Booking) session. */
  transitioned: boolean;
  sessionStatus: SessionStatus;
  tutorHasCheckedIn: boolean;
  studentHasCheckedIn: boolean;
}

/**
 * Session Lifecycle Phase 3 — the standalone no-show convergence
 * entrypoint: "please evaluate now," never "declare X a no-show." The only
 * input is `bookingId` (plus an injectable clock for tests) — no
 * participant-claimed outcome exists anywhere on this function's input type
 * by construction (§12 of the task: the client must never send "student is
 * no-show"/"tutor is no-show" as authoritative truth; the server alone
 * derives the outcome from persisted evidence and time).
 *
 * Safe to call for ANY booking, any number of times, from any trusted
 * trigger — idempotent by the same guarded-updateMany pattern used
 * throughout this file and cancellationPolicy.ts. recordSessionCheckIn's
 * own convergence-first step (§7, above) embeds the identical
 * applyNoShowConvergenceIfDue core rather than duplicating this logic;
 * sweepDueNoShowConvergence (below) is the cron/liveness-backstop caller.
 *
 * AUTHORIZATION NOTE (§5 item 1 / §12 of the task): this function performs
 * no actor-based authorization of its own, unlike recordSessionCheckIn.
 * That is a deliberate, narrow decision, not an oversight: this function
 * accepts no claimed outcome and its only possible effect is the single
 * guarded Session_.status transition its own fresh evidence read already
 * justifies — there is no action a caller could bias by invoking it, and
 * its result exposes nothing a viewer authorized via getSessionContext
 * couldn't already see. "Trusted invocation context" is established by
 * EACH caller instead: recordSessionCheckIn only reaches its embedded
 * convergence step after its own participant authorization
 * (resolveSessionCheckInAuthority) has already passed; the cron route
 * (/api/cron/session-noshow-tick) is gated by a shared-secret header,
 * mirroring the existing payments-tick/quick-match-tick routes exactly.
 * This function must NOT be wired to a new unauthenticated public route,
 * and no participant-facing Server Action is introduced in Phase 3 at all
 * — see the Phase 3 report §12/§15 for why none is required yet.
 */
export async function resolveSessionNoShowConvergence(
  bookingId: string,
  options: ResolveSessionNoShowConvergenceOptions = {}
): Promise<SessionNoShowConvergenceResult> {
  const clock = options.clock ?? (() => new Date());

  return withSerializableRetry(() =>
    db.$transaction(
      async (tx) => {
        // Fresh-read Booking + Session_ + attendance evidence, inside the
        // authoritative transaction — never a pre-transaction snapshot.
        const facts = await loadBookingSessionFacts(tx, bookingId);
        if (!facts) throw new SessionNotFoundError();

        const now = clock();
        const outcome = await applyNoShowConvergenceIfDue(tx, facts, now);

        return {
          bookingId: facts.bookingId,
          sessionId: facts.sessionId,
          decision: outcome.decision,
          transitioned: outcome.transitioned,
          sessionStatus: outcome.sessionStatus,
          tutorHasCheckedIn: outcome.tutorHasCheckedIn,
          studentHasCheckedIn: outcome.studentHasCheckedIn,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  );
}

export interface SweepDueNoShowConvergenceResult {
  evaluated: number;
  transitioned: number;
}

/**
 * Session Lifecycle Phase 3 — liveness backstop only, mirroring
 * processEligibleTransfers/reconcileStuckPayments's own established
 * precedent (tutorTransfers.ts): "lazy convergence [here: the
 * recordSessionCheckIn-embedded step] is the primary correctness
 * mechanism; this sweep just advances state nobody is actively viewing."
 * Finds Sessions still SCHEDULED whose Booking remains CONFIRMED and whose
 * grace deadline (Booking.startAt + 15min) has already passed, and calls
 * the SAME resolveSessionNoShowConvergence entrypoint used everywhere else
 * — no separate decision logic, no direct Session_ write of its own.
 *
 * Intentionally NOT wired into any built-in scheduler by this function —
 * see /api/cron/session-noshow-tick (the minimal route calling this) and
 * the Phase 3 report §12 for why this codebase has no built-in scheduler at
 * all (no vercel.json, no GitHub Actions workflow) and what that implies
 * for production reliability of this specific sweep.
 */
export async function sweepDueNoShowConvergence(limit = 100): Promise<SweepDueNoShowConvergenceResult> {
  const dueBefore = new Date(Date.now() - NO_SHOW_GRACE_PERIOD_MS_AFTER_START);
  const candidates = await db.session_.findMany({
    where: {
      status: "SCHEDULED",
      booking: { status: "CONFIRMED", startAt: { lte: dueBefore } },
    },
    select: { bookingId: true },
    take: limit,
  });

  let transitioned = 0;
  for (const candidate of candidates) {
    const result = await resolveSessionNoShowConvergence(candidate.bookingId);
    if (result.transitioned) transitioned++;
  }
  return { evaluated: candidates.length, transitioned };
}
