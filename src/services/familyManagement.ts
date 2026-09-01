import "server-only";
import { randomBytes, createHash } from "crypto";
import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { closedBetaOnlineOnlyActive } from "@/lib/closedBetaConfig";
import { withSerializableRetry } from "@/lib/serializableRetry";
import { hasActiveGuardianAuthority } from "@/services/studentAuthorization";

/**
 * Phase H.4 — Child Management & Multi-Guardian Relationships.
 *
 * This module is the ONLY place allowed to create a guardian-managed child,
 * create/claim/approve/reject a GUARDIAN_LINK FamilyInvitation, or create/
 * reactivate/revoke a ParentStudentRelationship. Every authority decision
 * defers to src/services/studentAuthorization.ts (H.2) — this file never
 * reimplements "who may act for a student."
 *
 * Every exported function takes an explicit `client: PrismaClient` as its
 * first parameter (mirroring the injectable-client convention already
 * established by src/services/studentAuthorization.ts and
 * src/services/signup.ts) rather than importing the ambient `db` singleton
 * internally — Server Actions pass `db` explicitly at the call site. This
 * is what makes the permanent DB-integration tests in
 * familyManagement.integration.test.ts able to point every mutation at the
 * isolated `futuretutor_test` database instead of the real one. (Plain
 * `PrismaClient`, not a union with `Prisma.TransactionClient`: every
 * mutating function here is a top-level entry point that opens its own
 * transaction internally — Prisma doesn't support nesting a `$transaction`
 * call inside an already-open transaction client, unlike H.2's read-only
 * functions, which are designed to be called either standalone or nested
 * inside a caller's open transaction.)
 *
 * Invitation expiry duration (72 hours) is a product decision the approved
 * Phase H planning report never specified a concrete value for (the H.4
 * implementation prompt explicitly forbids inventing one) — confirmed
 * directly with the user before this file was written; see the H.4
 * implementation report's own section on this decision.
 */
const INVITATION_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours — user-confirmed, see module doc comment above.

export class NotAuthorizedError extends Error {}
export class ParentProfileMissingError extends Error {}
export class InvitationNotFoundError extends Error {}
export class InvitationWrongTypeError extends Error {}
export class InvitationNotPendingError extends Error {}
export class InvitationNotClaimedError extends Error {}
export class InvitationExpiredError extends Error {}
export class InvitationAlreadyClaimedError extends Error {}
export class ClaimantNotEligibleError extends Error {}
export class EmailMismatchError extends Error {}
export class ConcurrentApprovalError extends Error {}
export class RelationshipNotFoundError extends Error {}
export class LastActiveGuardianError extends Error {}
export class CannotRevokeOtherGuardianError extends Error {}
/** Phase H.5 — the target StudentProfile already has a linked User
 * (userId is non-null), at either invitation-creation time or,
 * re-checked fresh, at approval time (§6/§18 of the H.5 prompt). */
export class StudentAlreadyLinkedError extends Error {}
/** Phase H.5 — the claimant's existing User account already owns a
 * DIFFERENT StudentProfile. H.5 never merges/repoints an existing
 * learning identity — see the H.5 report's §15 discussion. */
export class ClaimantAlreadyLinkedElsewhereError extends Error {}
/** Phase H.5 — an ACCEPTED STUDENT_LOGIN invitation was found whose
 * target StudentProfile.userId does not equal the invitation's own
 * claimedByUserId. This should be unreachable through this module's own
 * guarded writes; surfaced as a fail-closed data-integrity error rather
 * than silently repaired, per the H.5 prompt's explicit §22 instruction. */
export class StudentProfileDataIntegrityError extends Error {}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Pure, no I/O — SHA-256 hex digest of a raw token. Exported so both
 * generateInvitationToken below and any caller that needs to look up an
 * invitation by a raw token (e.g. the claim Server Action) hash it
 * identically, and so this exact hashing behavior is directly unit
 * testable without a database. */
export function hashInvitationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** Cryptographically secure token, never Math.random. Returned to the
 * caller exactly once (at creation) — never persisted, logged, or included
 * in any audit metadata. Only its SHA-256 hash is ever written to the DB. */
function generateInvitationToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString("base64url");
  return { rawToken, tokenHash: hashInvitationToken(rawToken) };
}

/** Pure, no I/O. */
export function isInvitationExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() < now.getTime();
}

export type FamilyInvitationStatusValue =
  | "PENDING"
  | "CLAIMED_PENDING_APPROVAL"
  | "ACCEPTED"
  | "EXPIRED"
  | "REVOKED";

/**
 * Pure, no I/O — the exact legal-transition table this module's mutating
 * functions implement (see the planning report's §8b state machine). EXPIRED
 * is only ever reached as a literal stored transition FROM PENDING (lazy
 * expiry-on-read, claimGuardianInvitation) — a CLAIMED_PENDING_APPROVAL
 * invitation whose expiresAt has passed is rejected via isInvitationExpired
 * as an eligibility check (approveFamilyInvitation/rejectFamilyInvitationClaim
 * throw InvitationExpiredError) without rewriting its status, so that it
 * stays visible to admin tooling as "stuck in CLAIMED_PENDING_APPROVAL"
 * (planning report §28) rather than being silently reclassified.
 */
const LEGAL_INVITATION_TRANSITIONS: Record<FamilyInvitationStatusValue, readonly FamilyInvitationStatusValue[]> = {
  PENDING: ["CLAIMED_PENDING_APPROVAL", "EXPIRED", "REVOKED"],
  CLAIMED_PENDING_APPROVAL: ["ACCEPTED", "REVOKED"],
  ACCEPTED: [],
  EXPIRED: [],
  REVOKED: [],
};

export function isLegalInvitationTransition(from: FamilyInvitationStatusValue, to: FamilyInvitationStatusValue): boolean {
  return LEGAL_INVITATION_TRANSITIONS[from].includes(to);
}

/** Pure, no I/O — the exact decision revokeGuardianRelationship enforces
 * inside its Serializable transaction, extracted so the invariant itself
 * (not just its end-to-end DB behavior) is directly unit testable. */
export function wouldViolateLastActiveGuardianInvariant(
  managementMode: "SELF_MANAGED" | "GUARDIAN_MANAGED" | "LEGACY_UNKNOWN",
  otherActiveGuardianCount: number
): boolean {
  return managementMode === "GUARDIAN_MANAGED" && otherActiveGuardianCount === 0;
}

// ---------------------------------------------------------------------------
// Guardian-visible Student login status (Phase H.6 §16) — deliberately
// distinct from resolveStudentAccountActivationState above: that resolver
// answers "what should THIS Student session see about ITS OWN login," scoped
// to one userId. This one answers "what should a GUARDIAN see about a
// child's login," scoped to one studentProfileId, and is never given a
// userId at all — there is no cross-user leakage question here because the
// guardian is already authorized (via H.2) to see everything about this
// exact child.
// ---------------------------------------------------------------------------

export type GuardianVisibleStudentLoginStatus =
  | "NO_LOGIN"
  | "INVITED_PENDING"
  | "WAITING_FOR_APPROVAL"
  | "ACTIVE"
  | "REJECTED_OR_REVOKED"
  | "EXPIRED";

/** Pure, no I/O. `invitations` should be every STUDENT_LOGIN
 * FamilyInvitation for this child, most-recent-first — the same precedence
 * used by resolveStudentAccountActivationState (a live claim always wins
 * over an older terminal one) applied from the guardian's vantage point. */
export function deriveGuardianVisibleStudentLoginStatus(params: {
  studentProfileUserId: string | null;
  studentLoginInvitations: readonly { status: FamilyInvitationStatusValue; expiresAt: Date }[];
}): GuardianVisibleStudentLoginStatus {
  if (params.studentProfileUserId) return "ACTIVE";

  const livePending = params.studentLoginInvitations.find(
    (inv) => inv.status === "CLAIMED_PENDING_APPROVAL" && !isInvitationExpired(inv.expiresAt)
  );
  if (livePending) return "WAITING_FOR_APPROVAL";

  const liveInvited = params.studentLoginInvitations.find(
    (inv) => inv.status === "PENDING" && !isInvitationExpired(inv.expiresAt)
  );
  if (liveInvited) return "INVITED_PENDING";

  const mostRecentTerminal = params.studentLoginInvitations.find(
    (inv) =>
      inv.status === "REVOKED" ||
      inv.status === "EXPIRED" ||
      ((inv.status === "PENDING" || inv.status === "CLAIMED_PENDING_APPROVAL") && isInvitationExpired(inv.expiresAt))
  );
  if (mostRecentTerminal) {
    return mostRecentTerminal.status === "REVOKED" ? "REJECTED_OR_REVOKED" : "EXPIRED";
  }

  return "NO_LOGIN";
}

// ---------------------------------------------------------------------------
// Child creation (§4-§10 of the H.4 prompt)
// ---------------------------------------------------------------------------

export interface CreateGuardianManagedStudentInput {
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  academicLevelId?: string;
}

/**
 * Creates a StudentProfile (GUARDIAN_MANAGED, userId: null) and an ACTIVE
 * ParentStudentRelationship for the authenticated Parent, atomically. Fails
 * closed if the actor is not role PARENT or has no ParentProfile — this
 * service never lazily creates one (H.3 owns Parent identity creation).
 */
export async function createGuardianManagedStudent(
  client: PrismaClient,
  actorUserId: string,
  input: CreateGuardianManagedStudentInput
) {
  const actor = await client.user.findUnique({
    where: { id: actorUserId },
    select: { role: true, parentProfile: { select: { id: true } } },
  });
  if (!actor || actor.role !== "PARENT") throw new NotAuthorizedError();
  if (!actor.parentProfile) throw new ParentProfileMissingError();

  const parentProfileId = actor.parentProfile.id;

  return client.$transaction(async (tx) => {
    const studentProfile = await tx.studentProfile.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: input.dateOfBirth,
        academicLevelId: input.academicLevelId ?? null,
        managementMode: "GUARDIAN_MANAGED",
        userId: null,
        // BETA-HARDEN1 — see signup.ts's identical comment: defaults new
        // rows to ONLINE while the Closed Beta gate is active instead of
        // the schema's own BOTH default, without touching any existing row.
        tutoringMode: closedBetaOnlineOnlyActive() ? ("ONLINE" as const) : ("BOTH" as const),
      },
    });

    const relationship = await tx.parentStudentRelationship.create({
      data: {
        parentProfileId,
        studentProfileId: studentProfile.id,
        status: "ACTIVE",
        createdByUserId: actorUserId,
      },
    });

    await writeAuditLog(
      {
        actorUserId,
        action: "family.student.created",
        entityType: "StudentProfile",
        entityId: studentProfile.id,
        metadata: { parentProfileId, relationshipId: relationship.id },
      },
      tx
    );

    return { studentProfile, relationship };
  });
}

/** All GUARDIAN_MANAGED children the authenticated Parent currently has
 * ACTIVE guardian authority over — scoped exclusively through the actor's
 * own ParentProfile → ACTIVE relationship join, never a client-supplied id
 * of any kind (§13 cross-family isolation). */
export async function listChildrenForGuardian(client: PrismaClient, actorUserId: string) {
  const parentProfile = await client.parentProfile.findUnique({
    where: { userId: actorUserId },
    select: { id: true },
  });
  if (!parentProfile) return [];

  const relationships = await client.parentStudentRelationship.findMany({
    where: { parentProfileId: parentProfile.id, status: "ACTIVE", studentProfile: { managementMode: "GUARDIAN_MANAGED" } },
    include: {
      studentProfile: {
        include: {
          academicLevel: { select: { slug: true } },
          _count: { select: { parentRelationships: { where: { status: "ACTIVE" } } } },
          familyInvitations: {
            where: { type: "STUDENT_LOGIN" },
            orderBy: { createdAt: "desc" },
            select: { status: true, expiresAt: true },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Phase H.6 (§13/§16) — each child card shows Student-login status
  // without a separate N+1 query per child; derived from the same pure
  // helper the child detail page uses, so the two surfaces never disagree.
  return relationships.map((rel) => ({
    studentProfile: rel.studentProfile,
    relationship: rel,
    activeGuardianCount: rel.studentProfile._count.parentRelationships,
    studentLoginStatus: deriveGuardianVisibleStudentLoginStatus({
      studentProfileUserId: rel.studentProfile.userId,
      studentLoginInvitations: rel.studentProfile.familyInvitations,
    }),
  }));
}

/**
 * Full guardian roster (ACTIVE and REVOKED, for history) plus any live
 * FamilyInvitation for one child. Fails closed via H.2's
 * hasActiveGuardianAuthority — the caller must currently be an ACTIVE
 * guardian of exactly this student, re-checked fresh here, never inferred
 * from a client-supplied id alone (§13).
 */
export async function getFamilyManagementDetail(client: PrismaClient, actorUserId: string, studentProfileId: string) {
  const authorized = await hasActiveGuardianAuthority(client, actorUserId, studentProfileId);
  if (!authorized) throw new NotAuthorizedError();

  const [studentProfile, relationships, invitations, studentLoginInvitations] = await Promise.all([
    client.studentProfile.findUnique({
      where: { id: studentProfileId },
      include: { academicLevel: { select: { slug: true } } },
    }),
    client.parentStudentRelationship.findMany({
      where: { studentProfileId },
      include: { parentProfile: { include: { user: { select: { name: true, email: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    client.familyInvitation.findMany({
      where: {
        targetStudentProfileId: studentProfileId,
        type: "GUARDIAN_LINK",
        status: { in: ["PENDING", "CLAIMED_PENDING_APPROVAL"] },
      },
      include: { claimedByUser: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    }),
    // Phase H.5 — the same live-invitation visibility, scoped to
    // STUDENT_LOGIN. Kept as a separate query/field (not merged into
    // `invitations`) since the two types render as genuinely different UI
    // sections (§31 of the H.5 prompt). Phase H.6 (§16) widens this from
    // live-only to every status — a guardian must be able to see that a
    // login was REVOKED or EXPIRED, not just the live states, so the
    // corrected UI can render those as their own meaningful outcome
    // instead of silently falling back to "invite again" with no history.
    client.familyInvitation.findMany({
      where: { targetStudentProfileId: studentProfileId, type: "STUDENT_LOGIN" },
      include: { claimedByUser: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!studentProfile) throw new NotAuthorizedError();

  const studentLoginStatus = deriveGuardianVisibleStudentLoginStatus({
    studentProfileUserId: studentProfile.userId,
    studentLoginInvitations: studentLoginInvitations,
  });

  return { studentProfile, relationships, invitations, studentLoginInvitations, studentLoginStatus };
}

// ---------------------------------------------------------------------------
// GUARDIAN_LINK invitation — creation (§14-§17)
// ---------------------------------------------------------------------------

/**
 * Only an ACTIVE guardian with current authority over the exact
 * GUARDIAN_MANAGED target may invite another guardian (re-checked via H.2,
 * both before and inside the transaction — TOCTOU closure per H.2's own
 * documented mandatory pattern). A prior live PENDING invitation for the
 * exact same (targetStudentProfileId, GUARDIAN_LINK, invitedEmailNormalized)
 * triple is superseded (REVOKED) so at most one stays authoritative — other
 * recipients' own live invitations for the same child are untouched (§17
 * scopes supersession to the same intended recipient only).
 *
 * Returns rawToken exactly once — never persisted, logged, or echoed back
 * by any other function in this module.
 */
export async function createGuardianInvitation(
  client: PrismaClient,
  actorUserId: string,
  targetStudentProfileId: string,
  invitedEmail: string
) {
  const preCheck = await hasActiveGuardianAuthority(client, actorUserId, targetStudentProfileId);
  if (!preCheck) throw new NotAuthorizedError();

  const invitedEmailNormalized = normalizeEmail(invitedEmail);
  const { rawToken, tokenHash } = generateInvitationToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

  const invitation = await withSerializableRetry(() =>
    client.$transaction(
      async (tx) => {
        const authorized = await hasActiveGuardianAuthority(tx, actorUserId, targetStudentProfileId);
        if (!authorized) throw new NotAuthorizedError();

        const priorLive = await tx.familyInvitation.findFirst({
          where: {
            targetStudentProfileId,
            type: "GUARDIAN_LINK",
            invitedEmailNormalized,
            status: "PENDING",
          },
        });
        if (priorLive) {
          await tx.familyInvitation.update({ where: { id: priorLive.id }, data: { status: "REVOKED" } });
          await writeAuditLog(
            {
              actorUserId,
              action: "family.guardian.invitation.superseded",
              entityType: "FamilyInvitation",
              entityId: priorLive.id,
              metadata: { targetStudentProfileId },
            },
            tx
          );
        }

        const created = await tx.familyInvitation.create({
          data: {
            type: "GUARDIAN_LINK",
            targetStudentProfileId,
            invitedEmailNormalized,
            invitedByUserId: actorUserId,
            tokenHash,
            status: "PENDING",
            expiresAt,
          },
        });

        await writeAuditLog(
          {
            actorUserId,
            action: "family.guardian.invitation.created",
            entityType: "FamilyInvitation",
            entityId: created.id,
            metadata: { targetStudentProfileId, invitedEmailNormalized },
          },
          tx
        );

        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  );

  return { invitation, rawToken };
}

// ---------------------------------------------------------------------------
// STUDENT_LOGIN invitation — creation (Phase H.5 §6-§10)
// ---------------------------------------------------------------------------

/**
 * Only an ACTIVE guardian with current authority over the exact
 * GUARDIAN_MANAGED, not-yet-linked (userId IS NULL) target StudentProfile
 * may invite a restricted Student login for it. Shares the exact same
 * security architecture as createGuardianInvitation (H.4) — random
 * cryptographic token, SHA-256 hash-at-rest, 72h TTL, same-recipient
 * supersession, TOCTOU-closing pre-check + in-transaction re-check — the
 * only real differences are the FamilyInvitationType and the additional
 * `userId IS NULL` precondition (§6 of the H.5 prompt), so this
 * intentionally mirrors createGuardianInvitation's shape rather than
 * inventing a second invitation architecture.
 */
export async function createStudentLoginInvitation(
  client: PrismaClient,
  guardianUserId: string,
  targetStudentProfileId: string,
  invitedEmail: string
) {
  const preCheck = await hasActiveGuardianAuthority(client, guardianUserId, targetStudentProfileId);
  if (!preCheck) throw new NotAuthorizedError();

  const invitedEmailNormalized = normalizeEmail(invitedEmail);
  const { rawToken, tokenHash } = generateInvitationToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

  const invitation = await withSerializableRetry(() =>
    client.$transaction(
      async (tx) => {
        const authorized = await hasActiveGuardianAuthority(tx, guardianUserId, targetStudentProfileId);
        if (!authorized) throw new NotAuthorizedError();

        // Re-read the target fresh — hasActiveGuardianAuthority already
        // confirmed GUARDIAN_MANAGED, but the userId-is-null precondition
        // is specific to this invitation type and isn't part of H.2's
        // general authority check.
        const student = await tx.studentProfile.findUniqueOrThrow({ where: { id: targetStudentProfileId } });
        if (student.userId !== null) throw new StudentAlreadyLinkedError();

        const priorLive = await tx.familyInvitation.findFirst({
          where: {
            targetStudentProfileId,
            type: "STUDENT_LOGIN",
            invitedEmailNormalized,
            status: "PENDING",
          },
        });
        if (priorLive) {
          await tx.familyInvitation.update({ where: { id: priorLive.id }, data: { status: "REVOKED" } });
          await writeAuditLog(
            {
              actorUserId: guardianUserId,
              action: "family.studentLogin.invitation.superseded",
              entityType: "FamilyInvitation",
              entityId: priorLive.id,
              metadata: { targetStudentProfileId },
            },
            tx
          );
        }

        const created = await tx.familyInvitation.create({
          data: {
            type: "STUDENT_LOGIN",
            targetStudentProfileId,
            invitedEmailNormalized,
            invitedByUserId: guardianUserId,
            tokenHash,
            status: "PENDING",
            expiresAt,
          },
        });

        await writeAuditLog(
          {
            actorUserId: guardianUserId,
            action: "family.studentLogin.invitation.created",
            entityType: "FamilyInvitation",
            entityId: created.id,
            metadata: { targetStudentProfileId, invitedEmailNormalized },
          },
          tx
        );

        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  );

  return { invitation, rawToken };
}

// ---------------------------------------------------------------------------
// GUARDIAN_LINK invitation — claim (§18-§21)
// ---------------------------------------------------------------------------

/** Read-only preview for the public claim page — never mutates the
 * invitation (viewing the link must not itself claim it; only the explicit
 * claim Server Action does). Returns null for an unknown token or the wrong
 * invitation type, without distinguishing the two to the caller, so the
 * page can render one generic "invalid" state without leaking which case
 * it was. */
export async function previewInvitationByToken(client: PrismaClient, rawToken: string) {
  const tokenHash = hashInvitationToken(rawToken);
  const invitation = await client.familyInvitation.findUnique({ where: { tokenHash } });
  if (!invitation) return null;

  const isExpired = invitation.status === "PENDING" && isInvitationExpired(invitation.expiresAt);
  return {
    // Phase H.5 (§32): the claim route resolves the invitation type
    // server-side from the hashed token — never trusted from a client
    // query parameter — and renders GUARDIAN_LINK vs STUDENT_LOGIN UI
    // accordingly.
    type: invitation.type,
    status: isExpired ? ("EXPIRED" as const) : invitation.status,
    invitedEmailNormalized: invitation.invitedEmailNormalized,
    expiresAt: invitation.expiresAt,
  };
}

export interface ClaimingActor {
  id: string;
  role: string;
  email: string | null;
}

/**
 * Two-party activation, step one. Grants ZERO family/guardian authority —
 * only records who claimed and when. targetStudentProfileId is read
 * exclusively from the resolved invitation row, never trusted from any
 * caller-supplied value. Single-winner via a guarded updateMany
 * (WHERE status = 'PENDING') — a single UPDATE statement is already atomic
 * in Postgres, so no wrapping transaction/Serializable isolation is needed
 * here (matches this codebase's existing single-statement guarded-update
 * convention, e.g. declineTutorInvitationAction).
 */
export async function claimGuardianInvitation(client: PrismaClient, rawToken: string, actor: ClaimingActor) {
  const tokenHash = hashInvitationToken(rawToken);
  const invitation = await client.familyInvitation.findUnique({ where: { tokenHash } });
  if (!invitation) throw new InvitationNotFoundError();
  if (invitation.type !== "GUARDIAN_LINK") throw new InvitationWrongTypeError();

  if (invitation.status === "PENDING" && isInvitationExpired(invitation.expiresAt)) {
    // Lazy expiry-on-read, mirroring the established quickMatchDispatch.ts
    // convention rather than requiring a cron job for this beta surface.
    // isLegalInvitationTransition(PENDING, EXPIRED) is true — see that
    // function's doc comment for why this is the ONLY status field that
    // ever literally becomes EXPIRED (a stale CLAIMED_PENDING_APPROVAL
    // invitation is rejected via isInvitationExpired as an eligibility
    // check instead, deliberately leaving its status unchanged).
    await client.familyInvitation.updateMany({ where: { id: invitation.id, status: "PENDING" }, data: { status: "EXPIRED" } });
    throw new InvitationExpiredError();
  }
  if (invitation.status !== "PENDING") throw new InvitationNotPendingError();
  if (isInvitationExpired(invitation.expiresAt)) throw new InvitationExpiredError();

  if (actor.role !== "PARENT") throw new ClaimantNotEligibleError();
  const parentProfile = await client.parentProfile.findUnique({ where: { userId: actor.id }, select: { id: true } });
  if (!parentProfile) throw new ClaimantNotEligibleError();
  if (!actor.email || normalizeEmail(actor.email) !== invitation.invitedEmailNormalized) throw new EmailMismatchError();

  const claimed = await client.familyInvitation.updateMany({
    where: { id: invitation.id, status: "PENDING" },
    data: { status: "CLAIMED_PENDING_APPROVAL", claimedByUserId: actor.id, claimedAt: new Date() },
  });
  if (claimed.count === 0) throw new InvitationAlreadyClaimedError();

  await writeAuditLog(
    {
      actorUserId: actor.id,
      action: "family.guardian.invitation.claimed",
      entityType: "FamilyInvitation",
      entityId: invitation.id,
      metadata: { targetStudentProfileId: invitation.targetStudentProfileId },
    },
    client
  );

  return client.familyInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
}

// ---------------------------------------------------------------------------
// STUDENT_LOGIN invitation — claim (Phase H.5 §11-§17)
// ---------------------------------------------------------------------------

/**
 * Two-party activation, step one, for STUDENT_LOGIN — grants ZERO
 * StudentProfile access, does NOT set StudentProfile.userId (that only
 * ever happens at approval, §18). Structurally mirrors
 * claimGuardianInvitation's preamble exactly (hash → lookup → lazy expiry
 * → PENDING/expiry checks) via the same shared primitives
 * (hashInvitationToken/isInvitationExpired/normalizeEmail) — the only
 * genuine divergence is claimant eligibility, which is intentionally NOT
 * unified into one function: a GUARDIAN_LINK claimant must be role PARENT
 * with a ParentProfile; a STUDENT_LOGIN claimant must be role STUDENT and
 * must not already own a different StudentProfile (§12/§15) — forcing
 * these two incompatible rule sets through one branchy function would be
 * harder to reason about than two structurally-parallel ones sharing the
 * same primitives.
 */
export async function claimStudentLoginInvitation(client: PrismaClient, rawToken: string, actor: ClaimingActor) {
  const tokenHash = hashInvitationToken(rawToken);
  const invitation = await client.familyInvitation.findUnique({ where: { tokenHash } });
  if (!invitation) throw new InvitationNotFoundError();
  if (invitation.type !== "STUDENT_LOGIN") throw new InvitationWrongTypeError();

  if (invitation.status === "PENDING" && isInvitationExpired(invitation.expiresAt)) {
    await client.familyInvitation.updateMany({ where: { id: invitation.id, status: "PENDING" }, data: { status: "EXPIRED" } });
    throw new InvitationExpiredError();
  }
  if (invitation.status !== "PENDING") throw new InvitationNotPendingError();
  if (isInvitationExpired(invitation.expiresAt)) throw new InvitationExpiredError();

  // §12: only role STUDENT may become the Student login. PARENT/TUTOR/ADMIN
  // are rejected here, never silently reinterpreted.
  if (actor.role !== "STUDENT") throw new ClaimantNotEligibleError();
  if (!actor.email || normalizeEmail(actor.email) !== invitation.invitedEmailNormalized) throw new EmailMismatchError();

  // §15/§30: an existing Student account already linked to a DIFFERENT
  // StudentProfile is denied outright — H.5 never merges/repoints an
  // existing learning identity. (A brand-new claimant User created via
  // createStudentLoginUser has no StudentProfile at all yet, so this
  // check is a no-op for that path and only matters for an existing
  // account claiming.)
  const existingLink = await client.studentProfile.findUnique({ where: { userId: actor.id }, select: { id: true } });
  if (existingLink) throw new ClaimantAlreadyLinkedElsewhereError();

  const claimed = await client.familyInvitation.updateMany({
    where: { id: invitation.id, status: "PENDING" },
    data: { status: "CLAIMED_PENDING_APPROVAL", claimedByUserId: actor.id, claimedAt: new Date() },
  });
  if (claimed.count === 0) throw new InvitationAlreadyClaimedError();

  await writeAuditLog(
    {
      actorUserId: actor.id,
      action: "family.studentLogin.invitation.claimed",
      entityType: "FamilyInvitation",
      entityId: invitation.id,
      metadata: { targetStudentProfileId: invitation.targetStudentProfileId },
    },
    client
  );

  return client.familyInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
}

// ---------------------------------------------------------------------------
// Invitation approval — GUARDIAN_LINK and STUDENT_LOGIN
// (H.4 §23-§25 / planning report §8d; generalized in Phase H.5 §18 to also
// cover STUDENT_LOGIN, per that prompt's own "approveStudentLoginInvitation
// or equivalent" framing — one entry point, branching on invitation.type,
// rather than a second near-duplicate function.)
// ---------------------------------------------------------------------------

/**
 * The security-critical operation this whole module exists to protect:
 * activation only happens here, inside one Serializable transaction, and
 * only after re-verifying the approving guardian's CURRENT authority. The
 * shared preamble (re-read invitation, status/expiry checks, authority
 * re-check, guarded ACCEPTED transition, audit) is identical for both
 * invitation types; only claimant-eligibility rules and the actual linkage
 * action diverge — GUARDIAN_LINK creates/reactivates a
 * ParentStudentRelationship (H.4), STUDENT_LOGIN sets
 * StudentProfile.userId (H.5 §18, exact numbered steps below).
 *
 * Idempotent: a retry after the invitation already reached ACCEPTED returns
 * the existing accepted state rather than throwing — a naive double-submit
 * must never attempt to create a second relationship/relink a User, or
 * corrupt state. For STUDENT_LOGIN specifically (§22): if the target
 * StudentProfile.userId already equals the invitation's own
 * claimedByUserId, that's the expected stable idempotent result; if it
 * points anywhere else, that's a data-integrity impossibility this module's
 * own guarded writes should never produce — fails closed
 * (StudentProfileDataIntegrityError) rather than silently repairing it.
 */
export async function approveFamilyInvitation(client: PrismaClient, approvingUserId: string, invitationId: string) {
  return withSerializableRetry(() =>
    client.$transaction(
      async (tx) => {
        const invitation = await tx.familyInvitation.findUnique({ where: { id: invitationId } });
        if (!invitation) throw new InvitationNotFoundError();

        if (invitation.type === "GUARDIAN_LINK") {
          return approveGuardianLinkInvitation(tx, approvingUserId, invitation);
        }
        if (invitation.type === "STUDENT_LOGIN") {
          return approveStudentLoginInvitation(tx, approvingUserId, invitation);
        }
        throw new InvitationWrongTypeError();
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  );
}

type FamilyInvitationRow = Awaited<ReturnType<Prisma.TransactionClient["familyInvitation"]["findUniqueOrThrow"]>>;

async function approveGuardianLinkInvitation(
  tx: Prisma.TransactionClient,
  approvingUserId: string,
  invitation: FamilyInvitationRow
) {
  if (invitation.status === "ACCEPTED") {
    // Idempotent no-op — a retried/duplicate approval call must not
    // create a second relationship or throw a scary error.
    const existing = await tx.parentStudentRelationship.findUnique({
      where: {
        parentProfileId_studentProfileId: {
          parentProfileId: (await resolveParentProfileId(tx, invitation.claimedByUserId)) ?? "",
          studentProfileId: invitation.targetStudentProfileId,
        },
      },
    });
    return { invitation, relationship: existing, studentProfile: null, alreadyAccepted: true as const };
  }

  if (invitation.status !== "CLAIMED_PENDING_APPROVAL") throw new InvitationNotClaimedError();
  if (isInvitationExpired(invitation.expiresAt)) throw new InvitationExpiredError();

  const authorized = await hasActiveGuardianAuthority(tx, approvingUserId, invitation.targetStudentProfileId);
  if (!authorized) throw new NotAuthorizedError();

  if (!invitation.claimedByUserId) throw new ClaimantNotEligibleError();
  const claimant = await tx.user.findUnique({
    where: { id: invitation.claimedByUserId },
    select: { role: true, email: true, parentProfile: { select: { id: true } } },
  });
  if (!claimant || claimant.role !== "PARENT" || !claimant.parentProfile) throw new ClaimantNotEligibleError();
  if (!claimant.email || normalizeEmail(claimant.email) !== invitation.invitedEmailNormalized) {
    throw new EmailMismatchError();
  }

  const parentProfileId = claimant.parentProfile.id;
  const existingRelationship = await tx.parentStudentRelationship.findUnique({
    where: {
      parentProfileId_studentProfileId: { parentProfileId, studentProfileId: invitation.targetStudentProfileId },
    },
  });

  let relationship;
  let reactivated = false;
  if (!existingRelationship) {
    relationship = await tx.parentStudentRelationship.create({
      data: {
        parentProfileId,
        studentProfileId: invitation.targetStudentProfileId,
        status: "ACTIVE",
        createdByUserId: approvingUserId,
      },
    });
  } else if (existingRelationship.status === "REVOKED") {
    relationship = await tx.parentStudentRelationship.update({
      where: { id: existingRelationship.id },
      data: { status: "ACTIVE", revokedAt: null, revokedByUserId: null },
    });
    reactivated = true;
  } else {
    relationship = existingRelationship; // already ACTIVE — idempotent no-op on the relationship itself.
  }

  const acceptedUpdate = await tx.familyInvitation.updateMany({
    where: { id: invitation.id, status: "CLAIMED_PENDING_APPROVAL" },
    data: { status: "ACCEPTED", approvedByUserId: approvingUserId, approvedAt: new Date() },
  });
  if (acceptedUpdate.count === 0) throw new ConcurrentApprovalError();

  await writeAuditLog(
    {
      actorUserId: approvingUserId,
      action: "family.guardian.invitation.approved",
      entityType: "FamilyInvitation",
      entityId: invitation.id,
      metadata: { targetStudentProfileId: invitation.targetStudentProfileId, relationshipId: relationship.id },
    },
    tx
  );
  await writeAuditLog(
    {
      actorUserId: approvingUserId,
      action: reactivated ? "family.guardian.relationship.reactivated" : "family.guardian.relationship.created",
      entityType: "ParentStudentRelationship",
      entityId: relationship.id,
      metadata: { studentProfileId: invitation.targetStudentProfileId, invitationId: invitation.id },
    },
    tx
  );

  const finalInvitation = await tx.familyInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
  return { invitation: finalInvitation, relationship, studentProfile: null, alreadyAccepted: false as const };
}

/** Implements the H.5 prompt's §18 numbered steps exactly. */
async function approveStudentLoginInvitation(
  tx: Prisma.TransactionClient,
  approvingUserId: string,
  invitation: FamilyInvitationRow
) {
  if (invitation.status === "ACCEPTED") {
    // §22 idempotency: re-read the target fresh and compare against the
    // invitation's own record of who claimed it — never trust that the
    // linkage happened correctly without checking.
    const student = await tx.studentProfile.findUniqueOrThrow({ where: { id: invitation.targetStudentProfileId } });
    if (student.userId === invitation.claimedByUserId) {
      return { invitation, relationship: null, studentProfile: student, alreadyAccepted: true as const };
    }
    // Should be unreachable through this module's own guarded writes —
    // fail closed rather than silently repair (§22, explicit instruction).
    throw new StudentProfileDataIntegrityError();
  }

  if (invitation.status !== "CLAIMED_PENDING_APPROVAL") throw new InvitationNotClaimedError();
  if (isInvitationExpired(invitation.expiresAt)) throw new InvitationExpiredError();

  // §18 step 5-6: re-read the target StudentProfile fresh and confirm it's
  // still GUARDIAN_MANAGED (H.2's authority check below already implies
  // this, but the step is named explicitly in the prompt as its own check).
  const student = await tx.studentProfile.findUniqueOrThrow({ where: { id: invitation.targetStudentProfileId } });
  if (student.managementMode !== "GUARDIAN_MANAGED") throw new NotAuthorizedError();

  // §18 step 8: re-check the approving guardian's CURRENT authority, same
  // H.2 function, same tx client — identical TOCTOU-closure discipline as
  // every other mutation in this module.
  const authorized = await hasActiveGuardianAuthority(tx, approvingUserId, invitation.targetStudentProfileId);
  if (!authorized) throw new NotAuthorizedError();

  // §18 step 7: userId must still be NULL — re-read fresh, never assumed
  // from invitation-creation time.
  if (student.userId !== null) throw new StudentAlreadyLinkedError();

  // §18 step 10: resolve and re-validate the claimant fresh.
  if (!invitation.claimedByUserId) throw new ClaimantNotEligibleError();
  const claimant = await tx.user.findUnique({
    where: { id: invitation.claimedByUserId },
    select: { role: true, email: true },
  });
  if (!claimant || claimant.role !== "STUDENT") throw new ClaimantNotEligibleError();
  if (!claimant.email || normalizeEmail(claimant.email) !== invitation.invitedEmailNormalized) {
    throw new EmailMismatchError();
  }
  const claimantExistingLink = await tx.studentProfile.findUnique({
    where: { userId: invitation.claimedByUserId },
    select: { id: true },
  });
  if (claimantExistingLink) throw new ClaimantAlreadyLinkedElsewhereError();

  // §18 step 11: the atomic linkage — guarded on BOTH the row id and
  // userId still being NULL, so a genuine concurrent race (§23/§24: two
  // approvals racing for the same or, via a contrived fixture, two
  // different STUDENT_LOGIN invitations for the same target) can never
  // let a second writer overwrite an already-set userId. Whichever
  // transaction's updateMany matches zero rows loses cleanly.
  const linked = await tx.studentProfile.updateMany({
    where: { id: invitation.targetStudentProfileId, userId: null },
    data: { userId: invitation.claimedByUserId },
  });
  if (linked.count === 0) throw new StudentAlreadyLinkedError();

  // managementMode is never touched — GUARDIAN_MANAGED must survive
  // activation unchanged (§19, the single most important invariant this
  // function preserves).

  const acceptedUpdate = await tx.familyInvitation.updateMany({
    where: { id: invitation.id, status: "CLAIMED_PENDING_APPROVAL" },
    data: { status: "ACCEPTED", approvedByUserId: approvingUserId, approvedAt: new Date() },
  });
  if (acceptedUpdate.count === 0) throw new ConcurrentApprovalError();

  // §37: one atomic domain event covers both "approved" and "activated" —
  // no separate duplicate log for the same instant.
  await writeAuditLog(
    {
      actorUserId: approvingUserId,
      action: "family.studentLogin.activated",
      entityType: "StudentProfile",
      entityId: invitation.targetStudentProfileId,
      metadata: { invitationId: invitation.id, studentUserId: invitation.claimedByUserId },
    },
    tx
  );

  const finalInvitation = await tx.familyInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
  const finalStudent = await tx.studentProfile.findUniqueOrThrow({ where: { id: invitation.targetStudentProfileId } });
  return { invitation: finalInvitation, relationship: null, studentProfile: finalStudent, alreadyAccepted: false as const };
}

async function resolveParentProfileId(tx: Prisma.TransactionClient, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const parentProfile = await tx.parentProfile.findUnique({ where: { userId }, select: { id: true } });
  return parentProfile?.id ?? null;
}

/** A guardian with current authority may reject a claim outright, without
 * ever activating it. Preserves history — the row is never deleted.
 * Generalized in Phase H.5 to accept STUDENT_LOGIN as well as GUARDIAN_LINK
 * — the rejection mechanics (authority re-check, guarded
 * CLAIMED_PENDING_APPROVAL → REVOKED transition, audit) are identical for
 * both types; only the audit action name differs. For STUDENT_LOGIN,
 * rejecting leaves StudentProfile.userId untouched (still NULL) — see the
 * H.5 report's "Orphan Claimant User Handling" section for what happens to
 * the claimed User account itself, which this function does not delete. */
export async function rejectFamilyInvitationClaim(client: PrismaClient, actingUserId: string, invitationId: string) {
  return client.$transaction(async (tx) => {
    const invitation = await tx.familyInvitation.findUnique({ where: { id: invitationId } });
    if (!invitation) throw new InvitationNotFoundError();
    if (invitation.type !== "GUARDIAN_LINK" && invitation.type !== "STUDENT_LOGIN") {
      throw new InvitationWrongTypeError();
    }
    if (invitation.status !== "CLAIMED_PENDING_APPROVAL") throw new InvitationNotClaimedError();

    const authorized = await hasActiveGuardianAuthority(tx, actingUserId, invitation.targetStudentProfileId);
    if (!authorized) throw new NotAuthorizedError();

    const updated = await tx.familyInvitation.updateMany({
      where: { id: invitation.id, status: "CLAIMED_PENDING_APPROVAL" },
      data: { status: "REVOKED" },
    });
    if (updated.count === 0) throw new ConcurrentApprovalError();

    await writeAuditLog(
      {
        actorUserId: actingUserId,
        action:
          invitation.type === "GUARDIAN_LINK"
            ? "family.guardian.invitation.rejected"
            : "family.studentLogin.invitation.rejected",
        entityType: "FamilyInvitation",
        entityId: invitation.id,
        metadata: { targetStudentProfileId: invitation.targetStudentProfileId },
      },
      tx
    );

    return tx.familyInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
  });
}

// ---------------------------------------------------------------------------
// Admin visibility (Phase H.9 — planning report §28) — READ-ONLY.
//
// Closes the gap the Post-H.8 readiness audit surfaced: a FamilyInvitation
// can reach CLAIMED_PENDING_APPROVAL and simply sit there forever if the
// inviting/active guardian never returns to approve it — nothing before
// H.9 gave an Admin any visibility into that. This section adds exactly one
// additive, narrowly-scoped read query; it does NOT add a new mutation.
//
// Why read-only: both approveFamilyInvitation and rejectFamilyInvitationClaim
// re-check hasActiveGuardianAuthority(tx, actingUserId, studentProfileId),
// which requires the actor to own an ACTIVE ParentStudentRelationship for
// that exact student. An ADMIN/SUPER_ADMIN actor has no ParentProfile and
// can never satisfy that check — there is no admin-safe variant of either
// mutation anywhere in this codebase. Per Phase H.9's own explicit
// fallback instruction ("if no safe existing mutation maps exactly to the
// need, keep H.9 read-only and report the gap"), this module adds
// visibility only. Support/Admin response to a stuck claim remains: nudge
// the guardian (out of band) to sign in and approve or reject it
// themselves through the existing guardian-facing action.
// ---------------------------------------------------------------------------

/** Pure, no I/O — the exact two-role Admin gate every existing `/admin/*`
 * route already enforces inline at the page level (see e.g.
 * src/app/[locale]/admin/payments/page.tsx). Extracted here so this
 * module's own admin read model re-verifies it server-side, independently
 * of the calling page, and so the decision itself is directly unit
 * testable without a database — never a new/weaker authorization rule. */
export function isAdminRole(role: string): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

export type FamilyInvitationTypeValue = "STUDENT_LOGIN" | "GUARDIAN_LINK";

export interface AdminActor {
  id: string;
  role: string;
}

/** One row of Family-Accounts-scoped Admin visibility. Deliberately narrow:
 * no dateOfBirth, no unrelated StudentProfile fields, no financial data, no
 * password/token material — only what's needed to identify the invitation,
 * the learner it concerns, the guardian who created it, and the account
 * that claimed it (§8 of the H.9 implementation prompt's privacy
 * boundary). `claimedByUser`/`invitedByUser` expose the same shape
 * (name/email) already shown to a guardian on their own Family dashboard
 * (see PendingClaimRow) — no new disclosure beyond what an authorized
 * guardian for this exact family already sees today. */
export interface AdminFamilyInvitationAttentionRow {
  id: string;
  type: FamilyInvitationTypeValue;
  status: "CLAIMED_PENDING_APPROVAL";
  targetStudentProfileId: string;
  studentFirstName: string;
  studentLastName: string;
  invitedEmailNormalized: string;
  invitedByUser: { name: string | null; email: string } | null;
  claimedByUser: { name: string | null; email: string } | null;
  createdAt: Date;
  claimedAt: Date | null;
  expiresAt: Date;
  /** Reuses isInvitationExpired — the SAME time gate
   * approveFamilyInvitation/rejectFamilyInvitationClaim already enforce
   * (both throw InvitationExpiredError once this is true). true means this
   * claim can no longer be approved OR rejected through the existing
   * guardian-facing action and is genuinely, permanently stuck absent a
   * fresh invitation — never a fabricated derived business status, just
   * the same existing field compared against "now" the same way the real
   * mutation already does. */
  pastDue: boolean;
}

/**
 * Every FamilyInvitation currently in CLAIMED_PENDING_APPROVAL — the exact
 * "requiring attention" set named by the planning report's §28 and the
 * Post-H.8 readiness audit. PENDING (not yet claimed), ACCEPTED, EXPIRED,
 * and REVOKED are all terminal-or-not-yet-actionable from an Admin's
 * perspective and are intentionally excluded: PENDING has no claimant yet
 * to investigate; the other three are already resolved. ADMIN/SUPER_ADMIN
 * only — fails closed via isAdminRole for any other actor, including a
 * PARENT with active guardian authority over one of the returned students
 * (guardian authority over a student is not, and must never become, Admin
 * authority over this global cross-family view).
 */
export async function listFamilyInvitationsRequiringAdminAttention(
  client: PrismaClient,
  actor: AdminActor
): Promise<AdminFamilyInvitationAttentionRow[]> {
  if (!isAdminRole(actor.role)) throw new NotAuthorizedError();

  const invitations = await client.familyInvitation.findMany({
    where: { status: "CLAIMED_PENDING_APPROVAL" },
    include: {
      targetStudentProfile: { select: { firstName: true, lastName: true } },
      invitedByUser: { select: { name: true, email: true } },
      claimedByUser: { select: { name: true, email: true } },
    },
    orderBy: { claimedAt: "asc" },
  });

  const now = new Date();
  return invitations.map((inv) => ({
    id: inv.id,
    type: inv.type,
    status: "CLAIMED_PENDING_APPROVAL" as const,
    targetStudentProfileId: inv.targetStudentProfileId,
    studentFirstName: inv.targetStudentProfile.firstName,
    studentLastName: inv.targetStudentProfile.lastName,
    invitedEmailNormalized: inv.invitedEmailNormalized,
    invitedByUser: inv.invitedByUser,
    claimedByUser: inv.claimedByUser,
    createdAt: inv.createdAt,
    claimedAt: inv.claimedAt,
    expiresAt: inv.expiresAt,
    pastDue: isInvitationExpired(inv.expiresAt, now),
  }));
}

// ---------------------------------------------------------------------------
// Guardian relationship revocation (§27-§30)
// ---------------------------------------------------------------------------

/**
 * Locked product policy (corrected after initial H.4 review — see the H.4
 * implementation report's "Final Guardian Revocation Policy Correction"
 * section for the full history): an ACTIVE guardian may revoke ONLY their
 * OWN ParentStudentRelationship. Revoking a DIFFERENT guardian's
 * relationship is not a guardian-facing capability at all in H.4 — that is
 * reserved for a later Admin/Support phase, not built here. No primary/
 * secondary guardian hierarchy is introduced; every guardian may equally
 * remove themselves, never another.
 *
 * Ownership is checked at the authoritative mutation boundary from a fresh
 * server-side read (`relationship.parentProfile.userId === actingUserId`)
 * — never from a client-supplied parentProfileId/userId, and never
 * bypassable by crafting a relationshipId that belongs to someone else
 * (the Server Action passes only actingUserId, resolved from the session,
 * and relationshipId; ownership is re-derived here, not trusted).
 *
 * The last-active-guardian invariant (§28 of the original H.4 prompt)
 * remains mandatory and unchanged: enforced inside the same Serializable
 * transaction as the revoking write, with a fresh re-count of OTHER active
 * guardians immediately before the write — never trusting a pre-transaction
 * count. Concurrent self-revocation safety follows directly from Postgres's
 * own Serializable write-skew detection plus withSerializableRetry's
 * bounded retry: see that helper's doc comment for the exact trace of how
 * two concurrent self-revocations (Guardian A revoking A, Guardian B
 * revoking B) resolve to exactly one ACTIVE guardian remaining, never zero
 * — that trace is unaffected by this correction, since each guardian was
 * always only ever targeting their own relationship in that scenario.
 */
export async function revokeGuardianRelationship(client: PrismaClient, actingUserId: string, relationshipId: string) {
  return withSerializableRetry(() =>
    client.$transaction(
      async (tx) => {
        const relationship = await tx.parentStudentRelationship.findUnique({
          where: { id: relationshipId },
          include: {
            studentProfile: { select: { id: true, managementMode: true } },
            parentProfile: { select: { userId: true } },
          },
        });
        if (!relationship) throw new RelationshipNotFoundError();

        if (relationship.status !== "ACTIVE") {
          return { relationship, alreadyRevoked: true as const };
        }

        if (relationship.parentProfile.userId !== actingUserId) {
          throw new CannotRevokeOtherGuardianError();
        }

        const authorized = await hasActiveGuardianAuthority(tx, actingUserId, relationship.studentProfileId);
        if (!authorized) throw new NotAuthorizedError();

        const otherActiveCount = await tx.parentStudentRelationship.count({
          where: { studentProfileId: relationship.studentProfileId, status: "ACTIVE", id: { not: relationshipId } },
        });
        if (wouldViolateLastActiveGuardianInvariant(relationship.studentProfile.managementMode, otherActiveCount)) {
          throw new LastActiveGuardianError();
        }

        const updated = await tx.parentStudentRelationship.updateMany({
          where: { id: relationshipId, status: "ACTIVE" },
          data: { status: "REVOKED", revokedAt: new Date(), revokedByUserId: actingUserId },
        });
        if (updated.count === 0) throw new ConcurrentApprovalError();

        await writeAuditLog(
          {
            actorUserId: actingUserId,
            action: "family.guardian.relationship.revoked",
            entityType: "ParentStudentRelationship",
            entityId: relationshipId,
            metadata: { studentProfileId: relationship.studentProfileId },
          },
          tx
        );

        const finalRelationship = await tx.parentStudentRelationship.findUniqueOrThrow({ where: { id: relationshipId } });
        return { relationship: finalRelationship, alreadyRevoked: false as const };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  );
}

// ---------------------------------------------------------------------------
// Student account activation state (Phase H.5 correction pass) — UX/account-
// state resolution only. This is deliberately NOT an authorization function
// and grants nothing on its own; src/services/studentAuthorization.ts (H.2)
// remains the sole source of truth for capability decisions. A STUDENT
// session with no linked StudentProfile always fails every H.2 check
// regardless of which of the states below it resolves to — this resolver
// only decides what SAFE MESSAGE to show that session, never what it may do.
// ---------------------------------------------------------------------------

export type StudentAccountActivationState =
  | { state: "ACTIVE"; studentProfileId: string }
  | { state: "PENDING_GUARDIAN_APPROVAL"; invitationId: string; expiresAt: Date }
  | { state: "REJECTED_OR_REVOKED"; invitationId: string }
  | { state: "EXPIRED"; invitationId: string }
  | { state: "UNLINKED" };

/**
 * Root cause this resolver fixes: the original H.5 pass treated every
 * "STUDENT with no linked StudentProfile" session identically — as
 * "waiting for guardian approval" — which is only true while a live,
 * non-expired CLAIMED_PENDING_APPROVAL claim actually exists. A rejected
 * or expired claimant, or a STUDENT account with no claim at all, would
 * incorrectly see the same "waiting for approval" message forever.
 *
 * Precedence (documented exactly, per the correction's own §8):
 *   1. A linked StudentProfile (`User.studentProfile` exists) → ACTIVE,
 *      unconditionally — no historical invitation, however recent, is ever
 *      consulted once a real link exists.
 *   2. A currently-live claim (`STUDENT_LOGIN`, `claimedByUserId` = this
 *      User, `status = CLAIMED_PENDING_APPROVAL`, not time-expired) →
 *      PENDING_GUARDIAN_APPROVAL. Checked before any terminal claim,
 *      regardless of that terminal claim's own recency — an old REVOKED
 *      claim can never shadow a newer live PENDING one.
 *   3. Otherwise, the single most recent relevant terminal claim (by
 *      `claimedAt`, descending): a `REVOKED` row → REJECTED_OR_REVOKED; a
 *      `CLAIMED_PENDING_APPROVAL` row whose `expiresAt` has passed → EXPIRED.
 *      (A literal `EXPIRED`-status row is structurally impossible to reach
 *      here: this module's lazy-expiry-on-read only ever flips a `PENDING`
 *      row — never a claimed one — to `EXPIRED`, and a `PENDING` row by
 *      definition has no `claimedByUserId` yet. A CLAIMED_PENDING_APPROVAL
 *      row that has since time-expired is what this branch's second
 *      condition catches instead, checked by time exactly the same way
 *      approveFamilyInvitation/claimStudentLoginInvitation already do via
 *      isInvitationExpired, not by trusting the stored status alone — see
 *      those functions' own comments for why the status is deliberately
 *      left unrewritten in this case.)
 *   4. Otherwise UNLINKED — no profile, no claim of any kind. Deliberately
 *      fail-closed and inert: no self-service recovery is offered here.
 *
 * Server-authoritative and IDOR-safe by construction: the only identity
 * input is `userId`, always the authenticated caller's own id resolved by
 * the caller (never a client-supplied target) — there is no parameter this
 * function accepts that could resolve a different User's state.
 */
export async function resolveStudentAccountActivationState(
  client: PrismaClient,
  userId: string
): Promise<StudentAccountActivationState> {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { studentProfile: { select: { id: true } } },
  });
  if (!user) return { state: "UNLINKED" };

  if (user.studentProfile) {
    return { state: "ACTIVE", studentProfileId: user.studentProfile.id };
  }

  const claims = await client.familyInvitation.findMany({
    where: { type: "STUDENT_LOGIN", claimedByUserId: userId },
    orderBy: { claimedAt: "desc" },
  });

  const livePending = claims.find(
    (claim) => claim.status === "CLAIMED_PENDING_APPROVAL" && !isInvitationExpired(claim.expiresAt)
  );
  if (livePending) {
    return { state: "PENDING_GUARDIAN_APPROVAL", invitationId: livePending.id, expiresAt: livePending.expiresAt };
  }

  const mostRecentTerminal = claims.find(
    (claim) =>
      claim.status === "REVOKED" || (claim.status === "CLAIMED_PENDING_APPROVAL" && isInvitationExpired(claim.expiresAt))
  );
  if (mostRecentTerminal) {
    return mostRecentTerminal.status === "REVOKED"
      ? { state: "REJECTED_OR_REVOKED", invitationId: mostRecentTerminal.id }
      : { state: "EXPIRED", invitationId: mostRecentTerminal.id };
  }

  return { state: "UNLINKED" };
}
