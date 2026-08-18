import "server-only";
import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import type { Role, StudentManagementMode, SessionParticipantRole } from "@/generated/prisma/enums";
import { resolveStudentCapabilities, type StudentAuthorizationClient } from "@/services/studentAuthorization";

/**
 * Session Lifecycle Phase 2 — session-specific authorization, modeled
 * directly after cancellationAuthorization.ts's established pure-decision +
 * IO-wrapper pattern. This module adds ZERO new policy logic to
 * studentAuthorization.ts (H.2's "ONLY place allowed to decide who may act
 * for a StudentProfile" doc comment is unchanged and binding) for the
 * self/guardian branches — it composes H.2's existing canActForStudent
 * capability with a genuinely NEW, narrow, Session-specific allow-path: a
 * Tutor may declare their booking's learner physically present
 * (TUTOR_DECLARING_LEARNER). This permission is intentionally scoped to
 * recording presence for THIS booking's session only — it must never be
 * read as, or extended into, general Student account/management authority.
 * See the Phase 2 report §8/§10 for the full rationale.
 *
 * Two independent decisions live here, because they have different rules:
 *  - Check-in AUTHORITY (who may add a SessionAttendanceEvent) — narrow,
 *    participant-only, never ADMIN (an admin must never be able to
 *    impersonate a participant's physical presence — see the architecture
 *    audit §14's explicit recommendation).
 *  - Session VIEWER authority (who may read the session read model) —
 *    broader, includes ADMIN/SUPER_ADMIN, mirroring existing system policy
 *    for booking-adjacent read access.
 */

// ---------------------------------------------------------------------------
// Check-in authority (mutation-side)
// ---------------------------------------------------------------------------

export type SessionCheckInActorRole =
  | "TUTOR_OWNER"
  | "SELF_MANAGED_STUDENT"
  | "GUARDIAN_MANAGED_STUDENT_SELF"
  | "GUARDIAN"
  | "TUTOR_DECLARING_LEARNER"
  | "DENIED";

export interface SessionAuthorityBookingFacts {
  studentProfileId: string;
  tutorProfileUserId: string;
}

/** Facts already fetched (by the IO wrapper below) — the pure decision
 * function has no I/O and no Prisma dependency of its own, exactly
 * mirroring computeCancellationAuthority/computeStudentCapabilities. */
export interface SessionCheckInAuthorityFacts {
  actorUserId: string;
  /** Whose presence is being recorded — the SUBJECT, never the actor. */
  participantRole: SessionParticipantRole;
  booking: SessionAuthorityBookingFacts;
  /** Result of H.2's canActForStudent(client, actorUserId, booking.studentProfileId)
   * — the view-level capability, deliberately NOT canPayForStudent/
   * canManageStudentAccount: recording one's own (or one's linked child's)
   * physical presence is a low-stakes operational fact, not a financial or
   * account-management action, so it uses the narrower, more permissive H.2
   * capability by design (this also correctly allows a GUARDIAN_MANAGED
   * student's own restricted login to check themselves in, even though that
   * same login is denied canPayForStudent/canManageStudentAccount). */
  canActForStudent: boolean;
  isLinkedStudentSelf: boolean;
  hasActiveGuardianAuthority: boolean;
  managementMode: StudentManagementMode | null;
}

/**
 * PURE decision logic — no I/O. Decision order:
 * 1. participantRole === TUTOR: only the booking's own Tutor may record
 *    their own presence. No guardian/admin concept applies here at all.
 * 2. participantRole === STUDENT, actor IS the booking's owning Tutor ->
 *    TUTOR_DECLARING_LEARNER. Checked BEFORE any H.2 capability — a Tutor
 *    never needs (or gets) student/guardian capability to exercise this;
 *    it is a Session-specific permission, not a general Student authority.
 *    Applies uniformly regardless of the learner's managementMode: the
 *    approved product rule ("Tutor may eventually declare the learner
 *    physically present") is framed around GUARDIAN_MANAGED learners with
 *    no login, but nothing in the rule set restricts it to that mode only,
 *    and requiring the Tutor to first determine managementMode before
 *    deciding whether they may tap "learner is here" would add a footgun
 *    for no safety benefit — the Tutor is asserting an operational fact
 *    about who is physically in front of them, identical in kind either way.
 * 3. participantRole === STUDENT, canActForStudent === true -> the specific
 *    self/guardian role, distinguished only for audit-labeling (all three
 *    are already authorized identically).
 * 4. Otherwise DENIED.
 */
export function computeSessionCheckInAuthority(facts: SessionCheckInAuthorityFacts): SessionCheckInActorRole {
  const isTutorOwner = facts.booking.tutorProfileUserId === facts.actorUserId;

  if (facts.participantRole === "TUTOR") {
    return isTutorOwner ? "TUTOR_OWNER" : "DENIED";
  }

  // participantRole === "STUDENT" from here on.
  if (isTutorOwner) return "TUTOR_DECLARING_LEARNER";

  if (facts.canActForStudent) {
    if (facts.isLinkedStudentSelf && facts.managementMode === "SELF_MANAGED") return "SELF_MANAGED_STUDENT";
    if (facts.isLinkedStudentSelf && facts.managementMode === "GUARDIAN_MANAGED") return "GUARDIAN_MANAGED_STUDENT_SELF";
    if (facts.hasActiveGuardianAuthority) return "GUARDIAN";
  }

  return "DENIED";
}

/**
 * IO wrapper — fetches the facts computeSessionCheckInAuthority needs (via
 * H.2's existing resolveStudentCapabilities, one call, no second policy
 * round trip) and delegates entirely to the pure function above. Accepts
 * either the ambient `db` singleton or an open Prisma transaction client, so
 * this is called twice per check-in: a fast, non-transactional Layer 1
 * pre-check (client = db), and an authoritative Layer 2 re-check inside the
 * same Serializable transaction that performs the mutation (client = tx) —
 * mirroring cancellationAuthorization.ts's resolveCancellationAuthority
 * exactly.
 */
export async function resolveSessionCheckInAuthority(
  client: PrismaClient | Prisma.TransactionClient,
  actorUserId: string,
  participantRole: SessionParticipantRole,
  booking: SessionAuthorityBookingFacts
): Promise<SessionCheckInActorRole> {
  const isTutorOwner = booking.tutorProfileUserId === actorUserId;

  // TUTOR-role check-in, and the TUTOR_DECLARING_LEARNER shortcut, never
  // need the H.2 round trip at all.
  if (participantRole === "TUTOR" || isTutorOwner) {
    return computeSessionCheckInAuthority({
      actorUserId,
      participantRole,
      booking,
      canActForStudent: false,
      isLinkedStudentSelf: false,
      hasActiveGuardianAuthority: false,
      managementMode: null,
    });
  }

  const capabilities = await resolveStudentCapabilities(
    client as StudentAuthorizationClient,
    actorUserId,
    booking.studentProfileId
  );

  return computeSessionCheckInAuthority({
    actorUserId,
    participantRole,
    booking,
    canActForStudent: capabilities.canActForStudent,
    isLinkedStudentSelf: capabilities.isLinkedStudentSelf,
    hasActiveGuardianAuthority: capabilities.hasActiveGuardianAuthority,
    managementMode: capabilities.managementMode,
  });
}

// ---------------------------------------------------------------------------
// Session viewer authority (read-side) — broader than check-in authority:
// includes ADMIN/SUPER_ADMIN (consistent with existing system-wide admin
// visibility policy — see Family Accounts admin visibility, H.9), but an
// admin viewer is never granted check-in authority above.
// ---------------------------------------------------------------------------

export type SessionViewerRole =
  | "TUTOR_OWNER"
  | "SELF_MANAGED_STUDENT"
  | "GUARDIAN_MANAGED_STUDENT_SELF"
  | "GUARDIAN"
  | "ADMIN"
  | "SUPER_ADMIN"
  | "DENIED";

export interface SessionViewerAuthorityFacts {
  actorUserId: string;
  actorRole: Role;
  booking: SessionAuthorityBookingFacts;
  canActForStudent: boolean;
  isLinkedStudentSelf: boolean;
  hasActiveGuardianAuthority: boolean;
  managementMode: StudentManagementMode | null;
}

/**
 * PURE decision logic — no I/O. Decision order mirrors
 * computeCancellationAuthority: ADMIN/SUPER_ADMIN first (unconditional),
 * then tutor ownership, then H.2's view-level capability.
 */
export function computeSessionViewerAuthority(facts: SessionViewerAuthorityFacts): SessionViewerRole {
  if (facts.actorRole === "ADMIN") return "ADMIN";
  if (facts.actorRole === "SUPER_ADMIN") return "SUPER_ADMIN";

  if (facts.booking.tutorProfileUserId === facts.actorUserId) return "TUTOR_OWNER";

  if (facts.canActForStudent) {
    if (facts.isLinkedStudentSelf && facts.managementMode === "SELF_MANAGED") return "SELF_MANAGED_STUDENT";
    if (facts.isLinkedStudentSelf && facts.managementMode === "GUARDIAN_MANAGED") return "GUARDIAN_MANAGED_STUDENT_SELF";
    if (facts.hasActiveGuardianAuthority) return "GUARDIAN";
  }

  return "DENIED";
}

export async function resolveSessionViewerAuthority(
  client: PrismaClient | Prisma.TransactionClient,
  actorUserId: string,
  actorRole: Role,
  booking: SessionAuthorityBookingFacts
): Promise<SessionViewerRole> {
  if (actorRole === "ADMIN" || actorRole === "SUPER_ADMIN") {
    return computeSessionViewerAuthority({
      actorUserId,
      actorRole,
      booking,
      canActForStudent: false,
      isLinkedStudentSelf: false,
      hasActiveGuardianAuthority: false,
      managementMode: null,
    });
  }
  if (booking.tutorProfileUserId === actorUserId) {
    return computeSessionViewerAuthority({
      actorUserId,
      actorRole,
      booking,
      canActForStudent: false,
      isLinkedStudentSelf: false,
      hasActiveGuardianAuthority: false,
      managementMode: null,
    });
  }

  const capabilities = await resolveStudentCapabilities(
    client as StudentAuthorizationClient,
    actorUserId,
    booking.studentProfileId
  );

  return computeSessionViewerAuthority({
    actorUserId,
    actorRole,
    booking,
    canActForStudent: capabilities.canActForStudent,
    isLinkedStudentSelf: capabilities.isLinkedStudentSelf,
    hasActiveGuardianAuthority: capabilities.hasActiveGuardianAuthority,
    managementMode: capabilities.managementMode,
  });
}
