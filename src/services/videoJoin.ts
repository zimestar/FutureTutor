import "server-only";
import { db } from "@/lib/db";
import type { Role } from "@/generated/prisma/enums";
import { CHECK_IN_WINDOW_MS_BEFORE_START, recordSessionCheckIn, type RecordSessionCheckInResult } from "@/services/sessionLifecycle";
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
 * Returns null (a safe no-op) for an OBSERVER or an unauthorized actor,
 * rather than throwing — this function is called from a confirmation path,
 * not a user-facing action a denial needs to be reported for.
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

  return recordSessionCheckIn(bookingId, actorUserId, participantRole, {
    actorRole,
    clock: options.clock,
    source: "ONLINE_ACTIVITY",
  });
}
