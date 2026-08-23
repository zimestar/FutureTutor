import "server-only";
import { db } from "@/lib/db";
import type { Role } from "@/generated/prisma/enums";
import {
  CHECK_IN_WINDOW_MS_BEFORE_START,
  recordSessionCheckIn,
  SessionCheckInNotAuthorizedError,
  SessionNotCheckInEligibleError,
  SessionCheckInTooEarlyError,
  type RecordSessionCheckInResult,
} from "@/services/sessionLifecycle";
import { VIDEO_ACCESS_GRACE_MS_AFTER_END, ensureVideoRoomForSession } from "@/services/videoSession";
import {
  resolveVideoJoinAuthority,
  toVideoParticipantRole,
  computeVideoJoinWindowEligibility,
  type VideoJoinWindowRejection,
} from "@/services/videoJoinAuthorization";
import { VideoProviderUnavailableError, type VideoProviderAdapter, type VideoParticipantRole } from "@/services/videoProvider";

/**
 * VIDEO-1A — the single, server-side entry point a future VIDEO-1B Server
 * Action calls to obtain a join token. This is the fail-closed boundary the
 * VIDEO-0 Security Model describes: every condition is re-verified here,
 * from a fresh DB read, regardless of any client-supplied claim about
 * booking/session/role. Deliberately does NOT record attendance (see
 * confirmVideoParticipantJoined below and the module-level note on why) —
 * requesting a token is not evidence anyone actually joined.
 */

export class VideoSessionNotFoundError extends Error {}
export class UnauthorizedVideoParticipantError extends Error {}
export class BookingNotConfirmedError extends Error {}
export class VideoNotSupportedForBookingError extends Error {}
export class VideoTooEarlyError extends Error {}
export class VideoWindowClosedError extends Error {}
export class RoomNotReadyError extends Error {}

function throwForWindowRejection(reason: VideoJoinWindowRejection): never {
  switch (reason) {
    case "BOOKING_NOT_CONFIRMED":
      throw new BookingNotConfirmedError();
    case "VIDEO_NOT_SUPPORTED_FOR_BOOKING":
      throw new VideoNotSupportedForBookingError();
    case "VIDEO_TOO_EARLY":
      throw new VideoTooEarlyError();
    case "VIDEO_WINDOW_CLOSED":
      throw new VideoWindowClosedError();
  }
}

interface JoinRequestBookingFacts {
  id: string;
  status: string;
  startAt: Date;
  endAt: Date;
  mode: "ONLINE" | "IN_PERSON" | "BOTH";
  studentProfileId: string;
  tutorProfileUserId: string;
  sessionId: string;
  sessionStatus: string;
  providerRoomId: string | null;
}

async function loadJoinRequestFacts(bookingId: string): Promise<JoinRequestBookingFacts | null> {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      startAt: true,
      endAt: true,
      mode: true,
      studentProfileId: true,
      tutorProfile: { select: { userId: true } },
      session: { select: { id: true, status: true, providerRoomId: true } },
    },
  });
  if (!booking || !booking.session) return null;
  return {
    id: booking.id,
    status: booking.status,
    startAt: booking.startAt,
    endAt: booking.endAt,
    mode: booking.mode,
    studentProfileId: booking.studentProfileId,
    tutorProfileUserId: booking.tutorProfile.userId,
    sessionId: booking.session.id,
    sessionStatus: booking.session.status,
    providerRoomId: booking.session.providerRoomId,
  };
}

function isRoomReady(providerRoomId: string | null): providerRoomId is string {
  return providerRoomId !== null && !providerRoomId.startsWith("pending:");
}

export interface RequestVideoJoinTokenOptions {
  actorRole: Role;
  clock?: () => Date;
}

export interface RequestVideoJoinTokenResult {
  token: string;
  expiresAt: Date;
  participantRole: VideoParticipantRole;
}

/**
 * No provider-internal detail (Daily error bodies, room ids, raw fetch
 * errors) ever escapes past VideoProviderUnavailableError's own sanitized
 * message (see dailyClient.ts) — this function never wraps/rethrows with
 * additional provider context, so a client-facing error mapper further up
 * the stack (VIDEO-1B's Server Action) can safely show a generic message
 * for every branch here without a separate secrets-redaction step.
 */
export async function requestVideoJoinToken(
  bookingId: string,
  actorUserId: string,
  provider: VideoProviderAdapter,
  options: RequestVideoJoinTokenOptions
): Promise<RequestVideoJoinTokenResult> {
  const clock = options.clock ?? (() => new Date());
  const facts = await loadJoinRequestFacts(bookingId);
  if (!facts) throw new VideoSessionNotFoundError();

  const now = clock();
  const windowRejection = computeVideoJoinWindowEligibility({
    bookingStatus: facts.status,
    bookingStartAt: facts.startAt,
    bookingEndAt: facts.endAt,
    bookingMode: facts.mode,
    sessionStatus: facts.sessionStatus as never, // validated by Prisma's own enum column; re-typed at the boundary
    now,
    joinWindowMsBeforeStart: CHECK_IN_WINDOW_MS_BEFORE_START,
    graceWindowMsAfterEnd: VIDEO_ACCESS_GRACE_MS_AFTER_END,
  });
  if (windowRejection) throwForWindowRejection(windowRejection);

  // Authorization is re-checked AFTER the window check but BEFORE any room/
  // token work — an unauthorized actor learns nothing more than "denied,"
  // never whether the window is open or the room exists (see the Security
  // Audit's "no unnecessary booking/session information on denial"
  // requirement — window state alone reveals nothing participant-specific).
  const authorityRole = await resolveVideoJoinAuthority(db, actorUserId, options.actorRole, {
    studentProfileId: facts.studentProfileId,
    tutorProfileUserId: facts.tutorProfileUserId,
  });
  const participantRole = toVideoParticipantRole(authorityRole);
  if (!participantRole) throw new UnauthorizedVideoParticipantError();

  let roomId = facts.providerRoomId;
  if (!isRoomReady(roomId)) {
    // Just-in-time fallback — the room SHOULD already exist by the time the
    // join window is open (the provisioning sweep runs at the same
    // boundary), but a missed/delayed sweep tick must not block a
    // legitimately-authorized, in-window join. ensureVideoRoomForSession is
    // idempotent, so this is always safe to attempt even if the sweep is
    // concurrently doing the same thing.
    try {
      roomId = await ensureVideoRoomForSession(facts.sessionId, provider);
    } catch (error) {
      if (error instanceof VideoProviderUnavailableError) throw error;
      throw new VideoProviderUnavailableError("Unexpected error while provisioning the video room");
    }
    if (!isRoomReady(roomId)) throw new RoomNotReadyError();
  }

  const tokenExpiresAt = new Date(facts.endAt.getTime() + VIDEO_ACCESS_GRACE_MS_AFTER_END);
  const tokenResult = await provider.createParticipantToken({
    providerRoomId: roomId,
    participantExternalId: actorUserId,
    role: participantRole,
    notBefore: now,
    expiresAt: tokenExpiresAt,
  });

  return { token: tokenResult.token, expiresAt: tokenResult.expiresAt, participantRole };
}

/**
 * VIDEO-1A's safe integration hook for VIDEO-0 §10's "smallest reliable
 * signal for an actual successful video join" requirement — deliberately
 * NOT called from requestVideoJoinToken above (token issuance != joined).
 *
 * No caller of this function exists yet as of VIDEO-1A: it is the correct
 * place for a future, server-verified "the participant actually connected"
 * signal to land (VIDEO-1B's client-side confirmation once daily-js fires
 * its own `joined-meeting` event, ideally corroborated by a signature-
 * verified Daily webhook rather than trusted from the client alone — that
 * webhook receiver is explicitly out of VIDEO-1A's scope, a UI/integration
 * concern for VIDEO-1B). Building this function now, without a caller yet,
 * is safe: it does nothing until something invokes it, and gives VIDEO-1B a
 * single, already-correct, already-tested boundary to wire up rather than
 * inventing a new attendance mechanism at that point.
 *
 * A GUARDIAN_OBSERVER "joining" is never recorded as attendance — an
 * observing parent is neither the Student nor the Tutor, and recording
 * their presence as either would be exactly the "financially dangerous
 * approximation" VIDEO-0 §10 warns against (attendance evidence here feeds
 * the existing no-show/TutorEarning-eligibility machinery unchanged).
 * Returns null (a safe no-op) for an OBSERVER, an unauthorized actor, a
 * participant role that has already recorded a CHECK_IN for this session
 * (see the VIDEO-1B idempotency guard below), or a session/booking that is
 * no longer check-in eligible (e.g. CANCELLED — see the try/catch around
 * recordSessionCheckIn below) — rather than throwing, since this function
 * is called from a confirmation path (in VIDEO-1B, the signed Daily webhook
 * receiver), not a user-facing action a denial needs to be reported for.
 *
 * VIDEO-1B idempotency guard: sessionLifecycle.ts's recordSessionCheckIn is
 * intentionally NOT modified to add this guard itself — it is an existing,
 * already-tested core function whose append-only-evidence-write semantics
 * (Session Lifecycle Phase 2) must stay exactly as they are for every other
 * caller (in-person manual check-in has never needed "only once" behavior
 * enforced at the write layer, since a human tapping "check in" twice is
 * not the same failure mode as an at-least-once webhook delivery). Instead,
 * this function checks for existing evidence BEFORE calling
 * recordSessionCheckIn at all — a duplicate Daily participant.joined
 * delivery for the same participant/session finds the prior CHECK_IN row
 * and returns null without writing a second one. This keeps "one CHECK_IN
 * row per intended participant/session semantic" (VIDEO-1B §11) true
 * without touching the Phase 2 write path other callers depend on.
 *
 * Scope of this guard, stated honestly: it closes the realistic duplicate-
 * delivery case (a webhook retry arriving after the first delivery's
 * recordSessionCheckIn call has already committed — Daily's own retries are
 * seconds-to-minutes apart, never sub-millisecond). A genuinely simultaneous
 * double-delivery racing this function's own check-then-write window could
 * still theoretically create two CHECK_IN rows for the same participant;
 * even then, the state machine stays correct — recordSessionCheckIn's own
 * transition guard (facts.sessionStatus === "SCHEDULED") ensures
 * SCHEDULED -> IN_PROGRESS fires at most once regardless of how many
 * CHECK_IN rows exist, and no-show/TutorEarning eligibility read that
 * status, not a row count. Closing this narrow window fully would require
 * either a new unique DB constraint (schema change not justified for this
 * likelihood) or moving the check inside recordSessionCheckIn's own
 * Serializable transaction (a change to that function's boundary, avoided
 * per the paragraph above) — accepted as a bounded, non-financial residual
 * risk rather than solved with disproportionate machinery.
 */
export async function confirmVideoParticipantJoined(
  bookingId: string,
  actorUserId: string,
  actorRole: Role,
  options: { clock?: () => Date } = {}
): Promise<RecordSessionCheckInResult | null> {
  const facts = await loadJoinRequestFacts(bookingId);
  if (!facts) throw new VideoSessionNotFoundError();

  const authorityRole = await resolveVideoJoinAuthority(db, actorUserId, actorRole, {
    studentProfileId: facts.studentProfileId,
    tutorProfileUserId: facts.tutorProfileUserId,
  });
  const participantRole = toVideoParticipantRole(authorityRole);
  if (participantRole === null || participantRole === "OBSERVER") return null;

  const alreadyCheckedIn = await db.sessionAttendanceEvent.findFirst({
    where: { sessionId: facts.sessionId, participantRole, eventType: "CHECK_IN" },
    select: { id: true },
  });
  if (alreadyCheckedIn) return null;

  try {
    return await recordSessionCheckIn(bookingId, actorUserId, participantRole, {
      actorRole,
      clock: options.clock,
      source: "ONLINE_ACTIVITY",
    });
  } catch (error) {
    // VIDEO-1B — a join signal (real or, in principle, a late/out-of-order
    // one) can legitimately arrive for a booking/session that is no longer
    // check-in eligible by the time it's processed — most concretely, a
    // Booking that became CANCELLED between token issuance and this signal
    // arriving (see cancellationPolicy.ts's best-effort revocation — it
    // reduces but does not guarantee this never happens; see its own doc
    // comment). Treated as a safe no-op, same as OBSERVER/unauthorized/
    // already-checked-in above, rather than propagating — otherwise a
    // caller like the Daily webhook receiver would see a genuine exception
    // for a condition that will NEVER resolve on retry, and (depending on
    // how that caller maps errors to an HTTP status) could cause Daily to
    // retry a webhook delivery indefinitely for something that can never
    // succeed. A truly unexpected error (SessionNotFoundError, or anything
    // not one of these three known "no longer eligible" reasons) still
    // propagates — this function does not become a universal error sink.
    if (
      error instanceof SessionCheckInNotAuthorizedError ||
      error instanceof SessionNotCheckInEligibleError ||
      error instanceof SessionCheckInTooEarlyError
    ) {
      return null;
    }
    throw error;
  }
}
