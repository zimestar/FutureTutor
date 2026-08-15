import "server-only";
import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import type { StudentManagementMode, GuardianRelationshipStatus } from "@/generated/prisma/enums";

/**
 * Phase H.2 — the centralized authorization/capability policy layer. This
 * module is the ONLY place allowed to decide "who may act for a
 * StudentProfile" — see the Phase H planning report's "Account Management
 * Authority Model" and "Authorization Policy Layer" sections. Every fact
 * used here is read fresh from the database inside this module; nothing is
 * ever trusted from a caller-supplied role/managementMode/relationship
 * claim.
 *
 * Read-only by design (Phase H.2 boundary — see the H.2 implementation
 * prompt §18): nothing in this file mutates relationship status,
 * managementMode, or any other row.
 */

/**
 * Accepts either the ambient `db` singleton or an open Prisma transaction
 * client, so every check here can be re-run INSIDE the same transaction
 * that performs the mutation it's protecting — closing the TOCTOU window
 * described in the Phase H planning report (a pre-check alone, before a
 * transaction opens, is UX-only and never sufficient on its own; the
 * mandatory pattern is: an early non-transactional check for fast
 * rejection, plus a second call using the transaction's own `tx` client
 * immediately before the protected mutation). Mirrors the same
 * `Prisma.TransactionClient`-accepting pattern already established in
 * src/services/payments.ts.
 */
export type StudentAuthorizationClient = PrismaClient | Prisma.TransactionClient;

/** Server-derived facts about the target StudentProfile — never trusted
 * from client input. */
interface StudentContext {
  studentProfileId: string;
  studentUserId: string | null;
  managementMode: StudentManagementMode;
}

/** Server-derived facts about a specific actor's relationship (if any) to
 * the target StudentProfile — matches the Phase H planning report's
 * "guardian relationship: parentProfileId, relationship status, relevant
 * relationship ID" policy-context shape. */
export interface GuardianRelationshipFacts {
  parentProfileId: string;
  relationshipId: string;
  status: GuardianRelationshipStatus;
}

/**
 * The full, typed result of evaluating every Phase H.2 capability for one
 * (actor, student) pair in a single pass — computed from one shared fetch
 * rather than four independent round-trips. The four named capability
 * functions below are thin wrappers over this, so there is exactly one
 * place the actual policy logic lives.
 */
export interface StudentCapabilities {
  studentExists: boolean;
  managementMode: StudentManagementMode | null;
  /** True only if the actor IS the StudentProfile's own linked User. */
  isLinkedStudentSelf: boolean;
  /** True only when BOTH managementMode === GUARDIAN_MANAGED AND an ACTIVE
   * ParentStudentRelationship exists for this exact actor+student pair.
   * An ACTIVE relationship on a SELF_MANAGED student, or a REVOKED
   * relationship, or an unrelated guardian, all evaluate to false. */
  hasActiveGuardianAuthority: boolean;
  /** General learner/self access — view-level, never implies financial or
   * account-management authority on its own. */
  canActForStudent: boolean;
  /** Account-management authority (profile fields, etc.) — distinct from
   * canActForStudent: a GUARDIAN_MANAGED student's own restricted login
   * gets canActForStudent=true (they can view themselves) but
   * canManageStudentAccount=false (only an active guardian manages the
   * account). */
  canManageStudentAccount: boolean;
  /** Authority to initiate a financially-binding Direct Booking / Quick
   * Match flow. Never wired into those flows by Phase H.2 itself — that is
   * explicitly H.7's job; this is the policy decision H.7 will consume. */
  canInitiatePaidBooking: boolean;
  /** Authority to be the payer of record. Phase H.2 defines this
   * identically to canInitiatePaidBooking (there is no "student requests,
   * guardian approves" split workflow in Phase H — see the planning
   * report's explicit non-goal), kept as a separate named capability so a
   * future phase can diverge the two without a call-site rename. */
  canPayForStudent: boolean;
}

async function loadStudentContext(
  client: StudentAuthorizationClient,
  studentProfileId: string
): Promise<StudentContext | null> {
  const profile = await client.studentProfile.findUnique({
    where: { id: studentProfileId },
    select: { id: true, userId: true, managementMode: true },
  });
  if (!profile) return null; // fail closed: unknown StudentProfile
  return { studentProfileId: profile.id, studentUserId: profile.userId, managementMode: profile.managementMode };
}

/**
 * Resolves the specific ParentStudentRelationship (if any) between this
 * actor and this student — never inferred from anything except a real
 * ParentProfile row owned by actorUserId and a real relationship row
 * joining it to studentProfileId. An actor with no ParentProfile, or a
 * ParentProfile with no relationship to this exact student, both resolve
 * to null — this is what makes "Parent A cannot act for Parent B's child"
 * and "an unrelated Parent cannot act" true by construction, not by
 * convention (see the H.2 implementation prompt's IDOR requirements).
 */
async function findGuardianRelationship(
  client: StudentAuthorizationClient,
  actorUserId: string,
  studentProfileId: string
): Promise<GuardianRelationshipFacts | null> {
  const parentProfile = await client.parentProfile.findUnique({
    where: { userId: actorUserId },
    select: { id: true },
  });
  if (!parentProfile) return null; // fail closed: actor is not a guardian at all

  const relationship = await client.parentStudentRelationship.findUnique({
    where: { parentProfileId_studentProfileId: { parentProfileId: parentProfile.id, studentProfileId } },
    select: { id: true, status: true },
  });
  if (!relationship) return null; // fail closed: no relationship to this specific student

  return { parentProfileId: parentProfile.id, relationshipId: relationship.id, status: relationship.status };
}

/**
 * The already-resolved, server-derived facts needed to decide every Phase
 * H.2 capability for one (actor, student) pair — deliberately flat and
 * serializable so the decision function below can be pure.
 * `guardianRelationshipStatus: null` means no ParentStudentRelationship
 * exists at all for this actor+student pair (no ParentProfile, or a
 * ParentProfile with no relationship to this specific student) — both
 * collapse to the same "no relationship" fact here; which of the two it
 * was doesn't change the authorization outcome, only the fetch layer
 * (findGuardianRelationship) needs to distinguish them for its own
 * fail-closed early-return.
 */
export interface StudentCapabilityFacts {
  studentExists: boolean;
  studentUserId: string | null;
  managementMode: StudentManagementMode | null;
  actorUserId: string;
  guardianRelationshipStatus: GuardianRelationshipStatus | null;
}

/**
 * PURE decision logic — no I/O, no Prisma, no `server-only` dependency of
 * its own. This is the actual policy matrix (SELF_MANAGED / GUARDIAN_MANAGED
 * / LEGACY_UNKNOWN × self / active guardian / revoked guardian / unrelated
 * actor) and is exactly what the Phase H.2 permanent unit tests exercise
 * directly, with zero database involvement — see the planning report's
 * "Permanent Security Regression Tests" section and the H.2 implementation
 * prompt's §25 guidance to extract pure decision logic where possible.
 *
 * LEGACY_UNKNOWN handling (H.2 implementation prompt §16): this state is
 * never produced by the H.1 migration (every existing row was backfilled to
 * SELF_MANAGED) and is reserved for a hypothetical future data-provenance
 * gap. It deliberately satisfies NEITHER the SELF_MANAGED-self branch NOR
 * the GUARDIAN_MANAGED branch below, so it fails closed for
 * canManageStudentAccount, canInitiatePaidBooking, and canPayForStudent
 * alike — not just financial actions, account-management authority is
 * withheld too, until the profile's real management mode is resolved by an
 * explicit admin/support action (a later phase's concern). canActForStudent
 * (pure self-view) remains true for the linked self only — viewing one's
 * own basic profile is not treated as an authority-sensitive decision the
 * way management/financial actions are.
 */
export function computeStudentCapabilities(facts: StudentCapabilityFacts): StudentCapabilities {
  if (!facts.studentExists) {
    return {
      studentExists: false,
      managementMode: null,
      isLinkedStudentSelf: false,
      hasActiveGuardianAuthority: false,
      canActForStudent: false,
      canManageStudentAccount: false,
      canInitiatePaidBooking: false,
      canPayForStudent: false,
    };
  }

  const isLinkedStudentSelf = facts.studentUserId !== null && facts.studentUserId === facts.actorUserId;

  // The mode gate is checked unconditionally, before the relationship
  // status matters at all — this is what makes a historical ACTIVE
  // relationship to a now-SELF_MANAGED student evaluate to false.
  const guardianAuthority =
    facts.managementMode === "GUARDIAN_MANAGED" && facts.guardianRelationshipStatus === "ACTIVE";

  // Self-authority for management/financial actions requires SELF_MANAGED
  // specifically — a GUARDIAN_MANAGED student's own restricted login
  // (isLinkedStudentSelf === true) does NOT get these, per the locked rule
  // that a student's own login never converts GUARDIAN_MANAGED into
  // self-authority (H.2 implementation prompt §5.H / §9).
  const selfManagementAuthority = isLinkedStudentSelf && facts.managementMode === "SELF_MANAGED";
  const financialAuthority = selfManagementAuthority || guardianAuthority;

  return {
    studentExists: true,
    managementMode: facts.managementMode,
    isLinkedStudentSelf,
    hasActiveGuardianAuthority: guardianAuthority,
    canActForStudent: isLinkedStudentSelf || guardianAuthority,
    canManageStudentAccount: selfManagementAuthority || guardianAuthority,
    canInitiatePaidBooking: financialAuthority,
    canPayForStudent: financialAuthority,
  };
}

/**
 * Evaluates every Phase H.2 capability for one (actorUserId,
 * studentProfileId) pair: fetches the authoritative facts (this is the only
 * part that touches the database), then delegates entirely to the pure
 * computeStudentCapabilities above. canActForStudent/canManageStudentAccount/
 * canInitiatePaidBooking/canPayForStudent/hasActiveGuardianAuthority below
 * are thin, independently-callable wrappers over this same function, kept
 * as named capabilities per the "prefer narrower helpers over one
 * dangerously broad boolean" principle, while sharing one authoritative
 * implementation.
 */
export async function resolveStudentCapabilities(
  client: StudentAuthorizationClient,
  actorUserId: string,
  studentProfileId: string
): Promise<StudentCapabilities> {
  const student = await loadStudentContext(client, studentProfileId);
  if (!student) {
    return computeStudentCapabilities({
      studentExists: false,
      studentUserId: null,
      managementMode: null,
      actorUserId,
      guardianRelationshipStatus: null,
    });
  }

  const relationship = await findGuardianRelationship(client, actorUserId, studentProfileId);

  return computeStudentCapabilities({
    studentExists: true,
    studentUserId: student.studentUserId,
    managementMode: student.managementMode,
    actorUserId,
    guardianRelationshipStatus: relationship?.status ?? null,
  });
}

/**
 * True only when: (1) the target StudentProfile's managementMode is
 * GUARDIAN_MANAGED, (2) actorUserId has a ParentProfile, (3) an
 * ParentStudentRelationship exists between that ParentProfile and this
 * exact studentProfileId, and (4) that relationship's status is ACTIVE.
 * False in every other case, including: an unknown studentProfileId; a
 * SELF_MANAGED student (even with a historically-ACTIVE relationship row
 * still present — see the planning report's "former guardian" case); a
 * REVOKED relationship; an actor with no ParentProfile; an actor whose
 * ParentProfile has no relationship to this specific student.
 */
export async function hasActiveGuardianAuthority(
  client: StudentAuthorizationClient,
  actorUserId: string,
  studentProfileId: string
): Promise<boolean> {
  return (await resolveStudentCapabilities(client, actorUserId, studentProfileId)).hasActiveGuardianAuthority;
}

/** General learner/self access (view-level) — the StudentProfile's own
 * linked User, in any managementMode, OR an actor with active guardian
 * authority. Does NOT by itself imply account-management or financial
 * authority — see canManageStudentAccount/canInitiatePaidBooking/
 * canPayForStudent for those. */
export async function canActForStudent(
  client: StudentAuthorizationClient,
  actorUserId: string,
  studentProfileId: string
): Promise<boolean> {
  return (await resolveStudentCapabilities(client, actorUserId, studentProfileId)).canActForStudent;
}

/** Account-management authority (profile fields, account-level settings).
 * SELF_MANAGED: the linked Student User only. GUARDIAN_MANAGED: an ACTIVE
 * guardian only — never the student's own restricted login, even if one
 * exists. */
export async function canManageStudentAccount(
  client: StudentAuthorizationClient,
  actorUserId: string,
  studentProfileId: string
): Promise<boolean> {
  return (await resolveStudentCapabilities(client, actorUserId, studentProfileId)).canManageStudentAccount;
}

/** Authority to initiate a financially-binding Direct Booking / Quick
 * Match flow. Not wired into either flow by Phase H.2 — that integration
 * is explicitly H.7's scope; this function only defines the policy
 * decision H.7 will call. */
export async function canInitiatePaidBooking(
  client: StudentAuthorizationClient,
  actorUserId: string,
  studentProfileId: string
): Promise<boolean> {
  return (await resolveStudentCapabilities(client, actorUserId, studentProfileId)).canInitiatePaidBooking;
}

/** Authority to be the payer of record for this student. Identical policy
 * to canInitiatePaidBooking in Phase H (see StudentCapabilities'
 * doc comment) — kept as a distinct named export for future divergence. */
export async function canPayForStudent(
  client: StudentAuthorizationClient,
  actorUserId: string,
  studentProfileId: string
): Promise<boolean> {
  return (await resolveStudentCapabilities(client, actorUserId, studentProfileId)).canPayForStudent;
}
