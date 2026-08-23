import "server-only";
import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import type { Role, SessionStatus, TutoringMode } from "@/generated/prisma/enums";
import { resolveStudentCapabilities, type StudentAuthorizationClient } from "@/services/studentAuthorization";
import type { VideoParticipantRole } from "@/services/videoProvider";

/**
 * VIDEO-1A — video join authorization. A NEW, narrow, purpose-specific
 * module rather than an extension of sessionAuthorization.ts's existing
 * SessionCheckInActorRole/SessionViewerRole: video join has a genuinely
 * different permitted-role set from both of those (ADMIN is explicitly
 * DENIED here — unlike SessionViewerRole, which allows ADMIN/SUPER_ADMIN
 * read access — and a Guardian gets a distinct, more restricted OBSERVER
 * permission tier here, which neither existing role type represents).
 * Modeled directly on cancellationAuthorization.ts / sessionAuthorization.ts's
 * established pure-decision + IO-wrapper shape.
 */

export type VideoJoinActorRole = "TUTOR_OWNER" | "SELF_MANAGED_STUDENT" | "GUARDIAN_MANAGED_STUDENT_SELF" | "GUARDIAN_OBSERVER" | "DENIED";

export interface VideoJoinAuthorityBookingFacts {
  studentProfileId: string;
  tutorProfileUserId: string;
}

export interface VideoJoinAuthorityFacts {
  actorUserId: string;
  actorRole: Role;
  booking: VideoJoinAuthorityBookingFacts;
  isLinkedStudentSelf: boolean;
  hasActiveGuardianAuthority: boolean;
}

/**
 * PURE decision logic — no I/O. ADMIN/SUPER_ADMIN are checked FIRST and
 * unconditionally DENIED (VIDEO-1A's explicit product decision — "no admin
 * live-session access," never a silent/automatic join — see the VIDEO-0
 * report's Security Model). Guardian access is a genuinely different
 * permission tier (passive observer) from Student/Tutor, so it is never
 * collapsed into either.
 */
export function computeVideoJoinAuthority(facts: VideoJoinAuthorityFacts): VideoJoinActorRole {
  if (facts.actorRole === "ADMIN" || facts.actorRole === "SUPER_ADMIN") return "DENIED";
  if (facts.booking.tutorProfileUserId === facts.actorUserId) return "TUTOR_OWNER";
  if (facts.isLinkedStudentSelf) return "SELF_MANAGED_STUDENT";
  // isLinkedStudentSelf is false past this point — a guardian relationship
  // is the only remaining path (an unrelated Student/Tutor/Guardian, or an
  // unauthenticated-for-this-booking actor, all fail through to DENIED).
  if (facts.hasActiveGuardianAuthority) return "GUARDIAN_OBSERVER";
  return "DENIED";
}

/** Maps the finer FutureTutor-domain role onto the coarser permission tier
 * the video provider actually needs to enforce (see videoProvider.ts's
 * VideoParticipantRole) — kept as a separate, explicit mapping rather than
 * merging the two role types, mirroring sessionAuthorization.ts's own
 * "distinguished only for audit-labeling, already authorized identically"
 * precedent for SELF_MANAGED_STUDENT vs GUARDIAN_MANAGED_STUDENT_SELF. Both
 * student sub-roles map to the same participant permission tier — the
 * distinction only matters for audit trails, never for what the provider
 * token grants. GUARDIAN_MANAGED_STUDENT_SELF is included for the same
 * reason sessionAuthorization.ts includes it: a GUARDIAN_MANAGED student's
 * own restricted login is still the learner, not an observer. */
export function toVideoParticipantRole(role: VideoJoinActorRole): VideoParticipantRole | null {
  switch (role) {
    case "TUTOR_OWNER":
      return "TUTOR";
    case "SELF_MANAGED_STUDENT":
    case "GUARDIAN_MANAGED_STUDENT_SELF":
      return "STUDENT";
    case "GUARDIAN_OBSERVER":
      return "OBSERVER";
    case "DENIED":
      return null;
  }
}

/** IO wrapper — fetches the facts the pure function needs via
 * studentAuthorization.ts's resolveStudentCapabilities (the ONLY place
 * allowed to decide guardian/self authority — see that file's own doc
 * comment) and delegates entirely to computeVideoJoinAuthority. */
export async function resolveVideoJoinAuthority(
  client: PrismaClient | Prisma.TransactionClient,
  actorUserId: string,
  actorRole: Role,
  booking: VideoJoinAuthorityBookingFacts
): Promise<VideoJoinActorRole> {
  if (actorRole === "ADMIN" || actorRole === "SUPER_ADMIN") {
    return computeVideoJoinAuthority({
      actorUserId,
      actorRole,
      booking,
      isLinkedStudentSelf: false,
      hasActiveGuardianAuthority: false,
    });
  }
  if (booking.tutorProfileUserId === actorUserId) {
    return computeVideoJoinAuthority({
      actorUserId,
      actorRole,
      booking,
      isLinkedStudentSelf: false,
      hasActiveGuardianAuthority: false,
    });
  }

  const capabilities = await resolveStudentCapabilities(
    client as StudentAuthorizationClient,
    actorUserId,
    booking.studentProfileId
  );

  return computeVideoJoinAuthority({
    actorUserId,
    actorRole,
    booking,
    isLinkedStudentSelf: capabilities.isLinkedStudentSelf,
    hasActiveGuardianAuthority: capabilities.hasActiveGuardianAuthority,
  });
}

// ---------------------------------------------------------------------------
// Join-WINDOW eligibility — independent of WHO is asking (that's authority,
// above); this is WHEN a join may succeed at all, for anyone.
// ---------------------------------------------------------------------------

export type VideoJoinWindowRejection = "BOOKING_NOT_CONFIRMED" | "VIDEO_NOT_SUPPORTED_FOR_BOOKING" | "VIDEO_TOO_EARLY" | "VIDEO_WINDOW_CLOSED";

export interface VideoJoinWindowInput {
  bookingStatus: string;
  bookingStartAt: Date;
  bookingEndAt: Date;
  bookingMode: TutoringMode;
  sessionStatus: SessionStatus;
  now: Date;
  joinWindowMsBeforeStart: number;
  graceWindowMsAfterEnd: number;
}

const VIDEO_INELIGIBLE_SESSION_STATUSES: readonly SessionStatus[] = ["CANCELLED"];

/**
 * PURE decision logic — no I/O. Mirrors computeCheckInEligibility's exact
 * boundary-inclusive (`>=`/`<=`) style. Deliberately permissive on
 * SessionStatus otherwise (SCHEDULED/IN_PROGRESS/COMPLETED/NO_SHOW/
 * INTERRUPTED are all NOT rejected here) — a participant reconnecting after
 * the session already completed, within the grace window, is a legitimate
 * "wrap-up" case per VIDEO-0's own product intent, and no-show/interruption
 * determination is sessionLifecycle.ts's job, never duplicated here.
 */
export function computeVideoJoinWindowEligibility(input: VideoJoinWindowInput): VideoJoinWindowRejection | null {
  if (input.bookingStatus !== "CONFIRMED") return "BOOKING_NOT_CONFIRMED";
  if (input.bookingMode === "IN_PERSON") return "VIDEO_NOT_SUPPORTED_FOR_BOOKING";
  if (VIDEO_INELIGIBLE_SESSION_STATUSES.includes(input.sessionStatus)) return "VIDEO_NOT_SUPPORTED_FOR_BOOKING";

  const windowOpensAt = input.bookingStartAt.getTime() - input.joinWindowMsBeforeStart;
  const windowClosesAt = input.bookingEndAt.getTime() + input.graceWindowMsAfterEnd;
  if (input.now.getTime() < windowOpensAt) return "VIDEO_TOO_EARLY";
  if (input.now.getTime() > windowClosesAt) return "VIDEO_WINDOW_CLOSED";
  return null;
}
