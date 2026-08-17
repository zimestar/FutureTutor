import "server-only";
import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { resolveStudentCapabilities, type StudentAuthorizationClient } from "@/services/studentAuthorization";

/**
 * Phase H.8 — cancellation-specific authorization orchestration. This
 * module adds ZERO new policy logic to studentAuthorization.ts (H.2's own
 * "ONLY place allowed to decide who may act for a StudentProfile" doc
 * comment is unchanged and binding) — it only composes H.2's existing
 * canPayForStudent decision with the (unrelated-to-H.2) tutor-ownership and
 * admin-role checks, mirroring the pure/IO split already established by
 * studentAuthorization.ts's own computeStudentCapabilities/
 * resolveStudentCapabilities pair.
 *
 * "Who may cancel this specific booking" is a superset concern H.2 was
 * never meant to own (H.2's scope is explicitly student/guardian only, not
 * tutor/admin) — see FutureTutor_H8_Implementation_Plan.md §E.
 */

export type CancellationActorRole =
  | "SELF_MANAGED_STUDENT"
  | "GUARDIAN"
  | "TUTOR_OWNER"
  | "ADMIN"
  | "SUPER_ADMIN"
  | "DENIED";

export interface CancellationAuthorityBookingFacts {
  studentProfileId: string;
  tutorProfileUserId: string;
}

/** Facts already fetched (by the IO wrapper below) — the pure decision
 * function has no I/O and no Prisma dependency of its own, exactly
 * mirroring computeStudentCapabilities. */
export interface CancellationAuthorityFacts {
  actorUserId: string;
  actorRole: Role;
  booking: CancellationAuthorityBookingFacts;
  /** Result of H.2's canPayForStudent(client, actorUserId, booking.studentProfileId) */
  canPayForStudent: boolean;
  /** True only when the actor IS the StudentProfile's own linked User AND
   * managementMode === SELF_MANAGED (H.2's selfManagementAuthority) — used
   * purely to distinguish SELF_MANAGED_STUDENT vs GUARDIAN for audit
   * labeling; never a second authorization decision (both already imply
   * canPayForStudent === true when true). */
  isSelfManagedStudentSelf: boolean;
}

/**
 * PURE decision logic — no I/O. Decision order:
 * 1. actorRole ADMIN/SUPER_ADMIN -> that role, unconditionally (master
 *    prompt §1.5 — both operational, checked first, before any
 *    student/tutor fact matters).
 * 2. booking.tutorProfileUserId === actorUserId -> TUTOR_OWNER. Direct
 *    identity check — no guardian concept applies to tutors.
 * 3. canPayForStudent === true -> SELF_MANAGED_STUDENT or GUARDIAN,
 *    distinguished ONLY for audit-labeling purposes (both are already
 *    authorized identically).
 * 4. Otherwise DENIED.
 */
export function computeCancellationAuthority(facts: CancellationAuthorityFacts): CancellationActorRole {
  if (facts.actorRole === "ADMIN") return "ADMIN";
  if (facts.actorRole === "SUPER_ADMIN") return "SUPER_ADMIN";

  if (facts.booking.tutorProfileUserId === facts.actorUserId) return "TUTOR_OWNER";

  if (facts.canPayForStudent) {
    return facts.isSelfManagedStudentSelf ? "SELF_MANAGED_STUDENT" : "GUARDIAN";
  }

  return "DENIED";
}

/**
 * IO wrapper — fetches the facts computeCancellationAuthority needs (via
 * H.2's existing resolveStudentCapabilities, one call, no second policy
 * round trip) and delegates entirely to the pure function above. Accepts
 * either the ambient `db` singleton or an open Prisma transaction client
 * (StudentAuthorizationClient, the same type H.2 already exports), so this
 * can be called twice per cancellation: a fast, non-transactional Layer 1
 * pre-check (client = db), and an authoritative Layer 2 re-check inside the
 * same Serializable transaction that performs the mutation (client = tx) —
 * mirroring bookingCreation.ts's reserveBookingPendingPayment pattern
 * exactly (§I of the H.8 plan).
 *
 * actorRole is always read fresh by the caller from the database (never
 * trusted from a stale session object) before being passed in here — see
 * the H.8 plan §E's own note on this.
 */
export async function resolveCancellationAuthority(
  client: PrismaClient | Prisma.TransactionClient,
  actorUserId: string,
  actorRole: Role,
  booking: CancellationAuthorityBookingFacts
): Promise<CancellationActorRole> {
  // Admin/tutor branches never need the H.2 round trip at all.
  if (actorRole === "ADMIN" || actorRole === "SUPER_ADMIN") {
    return computeCancellationAuthority({
      actorUserId,
      actorRole,
      booking,
      canPayForStudent: false,
      isSelfManagedStudentSelf: false,
    });
  }
  if (booking.tutorProfileUserId === actorUserId) {
    return computeCancellationAuthority({
      actorUserId,
      actorRole,
      booking,
      canPayForStudent: false,
      isSelfManagedStudentSelf: false,
    });
  }

  const capabilities = await resolveStudentCapabilities(
    client as StudentAuthorizationClient,
    actorUserId,
    booking.studentProfileId
  );

  return computeCancellationAuthority({
    actorUserId,
    actorRole,
    booking,
    canPayForStudent: capabilities.canPayForStudent,
    isSelfManagedStudentSelf: capabilities.isLinkedStudentSelf && !capabilities.hasActiveGuardianAuthority,
  });
}
