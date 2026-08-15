import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";
import {
  createGuardianManagedStudent,
  createGuardianInvitation,
  claimGuardianInvitation,
  approveFamilyInvitation,
  rejectFamilyInvitationClaim,
  revokeGuardianRelationship,
  hashInvitationToken,
  NotAuthorizedError,
  ParentProfileMissingError,
  InvitationNotPendingError,
  InvitationNotClaimedError,
  InvitationExpiredError,
  ClaimantNotEligibleError,
  EmailMismatchError,
  LastActiveGuardianError,
  CannotRevokeOtherGuardianError,
} from "./familyManagement";
import { hasActiveGuardianAuthority, canManageStudentAccount } from "./studentAuthorization";

// Phase H.4 — permanent DB-integration tests for the family management
// domain (child creation, GUARDIAN_LINK invitation create/claim/approve/
// reject, guardian relationship revocation incl. real concurrent races).
// Runs ONLY against the isolated DATABASE_URL_TEST database, verified via
// resolveVerifiedTestDatabase() in beforeAll — fails closed before any
// connection opens if unset/unsafe. The normal development database is
// never touched by this file.

let db: PrismaClient;
const createdUserIds: string[] = [];
const createdStudentProfileIds: string[] = [];
const createdRelationshipIds: string[] = [];

beforeAll(() => {
  const target = resolveVerifiedTestDatabase();
  const adapter = new PrismaPg({ connectionString: target.connectionString });
  db = new PrismaClient({ adapter });
});

afterAll(async () => {
  await db?.$disconnect();
});

afterEach(async () => {
  // Same cleanup ordering H.2/H.3 established: ParentStudentRelationship
  // (Restrict FKs) first, then StudentProfile (cascades FamilyInvitation
  // via targetStudentProfileId), then User last (SELF_MANAGED's SetNull +
  // CHECK constraint requires the StudentProfile gone first).
  if (createdRelationshipIds.length > 0) {
    await db.parentStudentRelationship.deleteMany({ where: { id: { in: createdRelationshipIds } } });
    createdRelationshipIds.length = 0;
  }
  if (createdStudentProfileIds.length > 0) {
    await db.studentProfile.deleteMany({ where: { id: { in: createdStudentProfileIds } } });
    createdStudentProfileIds.length = 0;
  }
  if (createdUserIds.length > 0) {
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
});

function uniqueEmail(prefix: string) {
  return `h4-it-${prefix}-${randomUUID()}@futuretutor.test`;
}

async function createParentUser(email?: string) {
  const user = await db.user.create({ data: { email: email ?? uniqueEmail("parent"), role: "PARENT" } });
  createdUserIds.push(user.id);
  const parentProfile = await db.parentProfile.create({ data: { userId: user.id, firstName: "Test", lastName: "Parent" } });
  return { user, parentProfile };
}

/** A PARENT-role User with NO ParentProfile — the fail-closed fixture for
 * "missing ParentProfile" (test 7). H.3's signup always creates both
 * atomically, so this state is only reachable by direct fixture setup. */
async function createBareParentRoleUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("bare-parent"), role: "PARENT" } });
  createdUserIds.push(user.id);
  return { user };
}

async function createTutorUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("tutor"), role: "TUTOR" } });
  createdUserIds.push(user.id);
  return { user };
}

async function createGuardianManagedChildDirect(parentProfileId: string) {
  const studentProfile = await db.studentProfile.create({
    data: {
      firstName: "Kid",
      lastName: "Test",
      dateOfBirth: new Date("2015-01-01T00:00:00.000Z"),
      managementMode: "GUARDIAN_MANAGED",
      userId: null,
    },
  });
  createdStudentProfileIds.push(studentProfile.id);
  const relationship = await db.parentStudentRelationship.create({
    data: { parentProfileId, studentProfileId: studentProfile.id, status: "ACTIVE" },
  });
  createdRelationshipIds.push(relationship.id);
  return { studentProfile, relationship };
}

async function createSelfManagedStudentWithHistoricalGuardian(parentProfileId: string) {
  const studentUser = await db.user.create({ data: { email: uniqueEmail("selfmanaged"), role: "STUDENT" } });
  createdUserIds.push(studentUser.id);
  const studentProfile = await db.studentProfile.create({
    data: { userId: studentUser.id, firstName: "Adult", lastName: "Student", managementMode: "SELF_MANAGED" },
  });
  createdStudentProfileIds.push(studentProfile.id);
  const relationship = await db.parentStudentRelationship.create({
    data: { parentProfileId, studentProfileId: studentProfile.id, status: "ACTIVE" },
  });
  createdRelationshipIds.push(relationship.id);
  return { studentProfile, relationship };
}

async function directInvitation(params: {
  targetStudentProfileId: string;
  invitedEmailNormalized: string;
  invitedByUserId?: string;
  status?: "PENDING" | "CLAIMED_PENDING_APPROVAL" | "ACCEPTED" | "EXPIRED" | "REVOKED";
  expiresAt?: Date;
  claimedByUserId?: string;
  claimedAt?: Date;
}) {
  const rawToken = randomUUID();
  const tokenHash = hashInvitationToken(rawToken);
  const invitation = await db.familyInvitation.create({
    data: {
      type: "GUARDIAN_LINK",
      targetStudentProfileId: params.targetStudentProfileId,
      invitedEmailNormalized: params.invitedEmailNormalized,
      invitedByUserId: params.invitedByUserId ?? null,
      tokenHash,
      status: params.status ?? "PENDING",
      expiresAt: params.expiresAt ?? new Date(Date.now() + 1000 * 60 * 60),
      claimedByUserId: params.claimedByUserId ?? null,
      claimedAt: params.claimedAt ?? null,
    },
  });
  return { invitation, rawToken };
}

// ---------------------------------------------------------------------------
// Child creation (tests 1-8)
// ---------------------------------------------------------------------------

describe("createGuardianManagedStudent — child creation", () => {
  it("1. Parent creates first child: GUARDIAN_MANAGED, userId null, DOB persisted, ACTIVE relationship exists", async () => {
    const { user } = await createParentUser();
    const dob = new Date("2014-03-10T00:00:00.000Z");
    const { studentProfile, relationship } = await createGuardianManagedStudent(db, user.id, {
      firstName: "Kid",
      lastName: "One",
      dateOfBirth: dob,
    });
    createdStudentProfileIds.push(studentProfile.id);
    createdRelationshipIds.push(relationship.id);

    expect(studentProfile.managementMode).toBe("GUARDIAN_MANAGED");
    expect(studentProfile.userId).toBeNull();
    expect(studentProfile.dateOfBirth?.toISOString()).toBe(dob.toISOString());
    expect(relationship.status).toBe("ACTIVE");
    expect(relationship.studentProfileId).toBe(studentProfile.id);

    const dbRelationship = await db.parentStudentRelationship.findUnique({ where: { id: relationship.id } });
    expect(dbRelationship?.status).toBe("ACTIVE");
  });

  it("2. Parent can create a second child", async () => {
    const { user } = await createParentUser();
    const first = await createGuardianManagedStudent(db, user.id, {
      firstName: "Kid",
      lastName: "One",
      dateOfBirth: new Date("2014-01-01T00:00:00.000Z"),
    });
    createdStudentProfileIds.push(first.studentProfile.id);
    createdRelationshipIds.push(first.relationship.id);

    const second = await createGuardianManagedStudent(db, user.id, {
      firstName: "Kid",
      lastName: "Two",
      dateOfBirth: new Date("2016-01-01T00:00:00.000Z"),
    });
    createdStudentProfileIds.push(second.studentProfile.id);
    createdRelationshipIds.push(second.relationship.id);

    expect(second.studentProfile.id).not.toBe(first.studentProfile.id);
  });

  it("3. two children have distinct StudentProfile IDs and independent relationships", async () => {
    const { user } = await createParentUser();
    const a = await createGuardianManagedStudent(db, user.id, {
      firstName: "A",
      lastName: "Child",
      dateOfBirth: new Date("2013-01-01T00:00:00.000Z"),
    });
    createdStudentProfileIds.push(a.studentProfile.id);
    createdRelationshipIds.push(a.relationship.id);
    const b = await createGuardianManagedStudent(db, user.id, {
      firstName: "B",
      lastName: "Child",
      dateOfBirth: new Date("2017-01-01T00:00:00.000Z"),
    });
    createdStudentProfileIds.push(b.studentProfile.id);
    createdRelationshipIds.push(b.relationship.id);

    expect(a.studentProfile.id).not.toBe(b.studentProfile.id);
    expect(a.relationship.id).not.toBe(b.relationship.id);
  });

  it("4. Parent has H.2 guardian authority over each created child", async () => {
    const { user } = await createParentUser();
    const a = await createGuardianManagedStudent(db, user.id, {
      firstName: "A",
      lastName: "Child",
      dateOfBirth: new Date("2013-01-01T00:00:00.000Z"),
    });
    createdStudentProfileIds.push(a.studentProfile.id);
    createdRelationshipIds.push(a.relationship.id);

    expect(await hasActiveGuardianAuthority(db, user.id, a.studentProfile.id)).toBe(true);
    expect(await canManageStudentAccount(db, user.id, a.studentProfile.id)).toBe(true);
  });

  it("5. Parent has no authority over another family's child", async () => {
    const { user: parentA } = await createParentUser();
    const { user: parentB, parentProfile: parentProfileB } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfileB.id);

    expect(await hasActiveGuardianAuthority(db, parentA.id, studentProfile.id)).toBe(false);
    void parentB;
  });

  it("6. non-PARENT cannot use the child-creation service", async () => {
    const { user: tutorUser } = await createTutorUser();
    await expect(
      createGuardianManagedStudent(db, tutorUser.id, { firstName: "X", lastName: "Y", dateOfBirth: new Date("2015-01-01") })
    ).rejects.toThrow(NotAuthorizedError);
  });

  it("7. a PARENT-role User with a missing ParentProfile fails closed", async () => {
    const { user } = await createBareParentRoleUser();
    await expect(
      createGuardianManagedStudent(db, user.id, { firstName: "X", lastName: "Y", dateOfBirth: new Date("2015-01-01") })
    ).rejects.toThrow(ParentProfileMissingError);
  });

  it("8. a forced relationship-create failure rolls back the StudentProfile creation — no orphan child remains", async () => {
    // Exercises the same db.$transaction atomicity guarantee
    // createGuardianManagedStudent relies on, using a deliberate FK
    // violation (a nonexistent parentProfileId) on the second write — every
    // precondition the real service enforces before writing is exactly
    // what prevents this failure from being reachable through its own
    // public API, so this test reproduces the identical transaction shape
    // directly rather than bypassing the service's own validation.
    const bogusParentProfileId = `nonexistent-${randomUUID()}`;
    let studentProfileId: string | null = null;

    await expect(
      db.$transaction(async (tx) => {
        const studentProfile = await tx.studentProfile.create({
          data: {
            firstName: "Orphan",
            lastName: "Candidate",
            dateOfBirth: new Date("2015-01-01T00:00:00.000Z"),
            managementMode: "GUARDIAN_MANAGED",
            userId: null,
          },
        });
        studentProfileId = studentProfile.id;
        await tx.parentStudentRelationship.create({
          data: { parentProfileId: bogusParentProfileId, studentProfileId: studentProfile.id, status: "ACTIVE" },
        });
      })
    ).rejects.toThrow();

    expect(studentProfileId).not.toBeNull();
    const found = await db.studentProfile.findUnique({ where: { id: studentProfileId! } });
    expect(found).toBeNull(); // rolled back — never committed.
  });
});

// ---------------------------------------------------------------------------
// Invitation create / claim (tests 9-25)
// ---------------------------------------------------------------------------

describe("createGuardianInvitation", () => {
  it("9. an ACTIVE guardian can create a GUARDIAN_LINK invitation", async () => {
    const { user, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);

    const { invitation, rawToken } = await createGuardianInvitation(db, user.id, studentProfile.id, "second@example.com");
    expect(invitation.type).toBe("GUARDIAN_LINK");
    expect(invitation.status).toBe("PENDING");
    expect(rawToken.length).toBeGreaterThan(20);
  });

  it("10. the invitation stores tokenHash, never the raw token", async () => {
    const { user, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);

    const { invitation, rawToken } = await createGuardianInvitation(db, user.id, studentProfile.id, "second@example.com");
    expect(invitation.tokenHash).toBe(hashInvitationToken(rawToken));
    expect(invitation.tokenHash).not.toBe(rawToken);
    // The raw token cannot be used directly as a lookup key — the whole
    // point of storing only the hash.
    const wrongLookup = await db.familyInvitation.findUnique({ where: { tokenHash: rawToken } });
    expect(wrongLookup).toBeNull();
  });

  it("11. the stored targetStudentProfileId comes from the authorized relationship, not arbitrary input", async () => {
    const { user, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);

    const { invitation } = await createGuardianInvitation(db, user.id, studentProfile.id, "second@example.com");
    expect(invitation.targetStudentProfileId).toBe(studentProfile.id);
  });

  it("12. an unrelated Parent cannot invite a guardian for another family's child", async () => {
    const { user: unrelatedParent } = await createParentUser();
    const { parentProfile: ownerProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(ownerProfile.id);

    await expect(createGuardianInvitation(db, unrelatedParent.id, studentProfile.id, "x@example.com")).rejects.toThrow(
      NotAuthorizedError
    );
  });

  it("13. a REVOKED guardian cannot create an invitation", async () => {
    const { user, parentProfile } = await createParentUser();
    const { studentProfile, relationship } = await createGuardianManagedChildDirect(parentProfile.id);
    await db.parentStudentRelationship.update({ where: { id: relationship.id }, data: { status: "REVOKED" } });

    await expect(createGuardianInvitation(db, user.id, studentProfile.id, "x@example.com")).rejects.toThrow(NotAuthorizedError);
  });

  it("14. a historical guardian of a SELF_MANAGED student cannot create an invitation", async () => {
    const { user, parentProfile } = await createParentUser();
    const { studentProfile } = await createSelfManagedStudentWithHistoricalGuardian(parentProfile.id);

    await expect(createGuardianInvitation(db, user.id, studentProfile.id, "x@example.com")).rejects.toThrow(NotAuthorizedError);
  });

  it("supersedes a prior live PENDING invitation to the same recipient, but not one to a different recipient", async () => {
    const { user, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);

    const first = await createGuardianInvitation(db, user.id, studentProfile.id, "same@example.com");
    const other = await createGuardianInvitation(db, user.id, studentProfile.id, "different@example.com");
    const second = await createGuardianInvitation(db, user.id, studentProfile.id, "same@example.com");

    const firstReloaded = await db.familyInvitation.findUnique({ where: { id: first.invitation.id } });
    const otherReloaded = await db.familyInvitation.findUnique({ where: { id: other.invitation.id } });
    expect(firstReloaded?.status).toBe("REVOKED"); // superseded
    expect(otherReloaded?.status).toBe("PENDING"); // untouched — different recipient
    expect(second.invitation.status).toBe("PENDING");
  });
});

describe("claimGuardianInvitation", () => {
  it("15. correct token + matching Parent account can claim", async () => {
    const { user: inviter, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);
    const claimantEmail = uniqueEmail("claimant");
    const { rawToken } = await createGuardianInvitation(db, inviter.id, studentProfile.id, claimantEmail);
    const { user: claimant } = await createParentUser(claimantEmail);

    const claimed = await claimGuardianInvitation(db, rawToken, { id: claimant.id, role: "PARENT", email: claimantEmail });
    expect(claimed.status).toBe("CLAIMED_PENDING_APPROVAL");
    expect(claimed.claimedByUserId).toBe(claimant.id);
  });

  it("16. a mismatched email cannot claim", async () => {
    const { user: inviter, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);
    const { rawToken } = await createGuardianInvitation(db, inviter.id, studentProfile.id, uniqueEmail("intended"));
    const { user: wrongClaimant } = await createParentUser();

    await expect(
      claimGuardianInvitation(db, rawToken, { id: wrongClaimant.id, role: "PARENT", email: wrongClaimant.email })
    ).rejects.toThrow(EmailMismatchError);
  });

  it("17. a non-PARENT account cannot claim", async () => {
    const { user: inviter, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);
    const claimantEmail = uniqueEmail("claimant-tutor");
    const { rawToken } = await createGuardianInvitation(db, inviter.id, studentProfile.id, claimantEmail);
    const { user: tutorClaimant } = await createTutorUser();

    await expect(
      claimGuardianInvitation(db, rawToken, { id: tutorClaimant.id, role: "TUTOR", email: claimantEmail })
    ).rejects.toThrow(ClaimantNotEligibleError);
  });

  it("18. claim results only in CLAIMED_PENDING_APPROVAL, never ACCEPTED", async () => {
    const { user: inviter, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);
    const claimantEmail = uniqueEmail("claimant");
    const { rawToken } = await createGuardianInvitation(db, inviter.id, studentProfile.id, claimantEmail);
    const { user: claimant } = await createParentUser(claimantEmail);

    const claimed = await claimGuardianInvitation(db, rawToken, { id: claimant.id, role: "PARENT", email: claimantEmail });
    expect(claimed.status).toBe("CLAIMED_PENDING_APPROVAL");
  });

  it("19. after claim, NO ParentStudentRelationship exists for the claimant", async () => {
    const { user: inviter, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);
    const claimantEmail = uniqueEmail("claimant");
    const { rawToken } = await createGuardianInvitation(db, inviter.id, studentProfile.id, claimantEmail);
    const { user: claimant, parentProfile: claimantProfile } = await createParentUser(claimantEmail);

    await claimGuardianInvitation(db, rawToken, { id: claimant.id, role: "PARENT", email: claimantEmail });

    const relationship = await db.parentStudentRelationship.findUnique({
      where: { parentProfileId_studentProfileId: { parentProfileId: claimantProfile.id, studentProfileId: studentProfile.id } },
    });
    expect(relationship).toBeNull();
  });

  it("20. claimant has zero H.2 authority over the child before approval", async () => {
    const { user: inviter, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);
    const claimantEmail = uniqueEmail("claimant");
    const { rawToken } = await createGuardianInvitation(db, inviter.id, studentProfile.id, claimantEmail);
    const { user: claimant } = await createParentUser(claimantEmail);

    await claimGuardianInvitation(db, rawToken, { id: claimant.id, role: "PARENT", email: claimantEmail });

    expect(await hasActiveGuardianAuthority(db, claimant.id, studentProfile.id)).toBe(false);
  });

  it("21. a second claimant cannot replace the first claimant", async () => {
    const { user: inviter, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);
    const claimantEmail = uniqueEmail("claimant");
    const { rawToken } = await createGuardianInvitation(db, inviter.id, studentProfile.id, claimantEmail);
    const { user: firstClaimant } = await createParentUser(claimantEmail);

    const firstResult = await claimGuardianInvitation(db, rawToken, {
      id: firstClaimant.id,
      role: "PARENT",
      email: claimantEmail,
    });
    expect(firstResult.claimedByUserId).toBe(firstClaimant.id);

    // A second account somehow also matching the same intended email
    // (contrived, but exercises the guarded-updateMany's WHERE status =
    // 'PENDING' — status is now CLAIMED_PENDING_APPROVAL, so this must
    // fail regardless of email match).
    const { user: secondClaimant } = await createParentUser(claimantEmail + ".nope"); // different email on purpose
    await expect(
      claimGuardianInvitation(db, rawToken, { id: secondClaimant.id, role: "PARENT", email: claimantEmail })
    ).rejects.toThrow(InvitationNotPendingError);

    const reloaded = await db.familyInvitation.findUnique({ where: { id: firstResult.id } });
    expect(reloaded?.claimedByUserId).toBe(firstClaimant.id); // unchanged
  });

  it("22. replaying the token after claim creates no duplicate claim", async () => {
    const { user: inviter, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);
    const claimantEmail = uniqueEmail("claimant");
    const { rawToken } = await createGuardianInvitation(db, inviter.id, studentProfile.id, claimantEmail);
    const { user: claimant } = await createParentUser(claimantEmail);

    await claimGuardianInvitation(db, rawToken, { id: claimant.id, role: "PARENT", email: claimantEmail });
    await expect(
      claimGuardianInvitation(db, rawToken, { id: claimant.id, role: "PARENT", email: claimantEmail })
    ).rejects.toThrow(InvitationNotPendingError);
  });

  it("23. an expired invitation cannot be claimed", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);
    const claimantEmail = uniqueEmail("claimant");
    const { rawToken, invitation } = await directInvitation({
      targetStudentProfileId: studentProfile.id,
      invitedEmailNormalized: claimantEmail,
      expiresAt: new Date(Date.now() - 1000 * 60),
    });
    const { user: claimant } = await createParentUser(claimantEmail);

    await expect(
      claimGuardianInvitation(db, rawToken, { id: claimant.id, role: "PARENT", email: claimantEmail })
    ).rejects.toThrow(InvitationExpiredError);

    const reloaded = await db.familyInvitation.findUnique({ where: { id: invitation.id } });
    expect(reloaded?.status).toBe("EXPIRED"); // lazy expiry-on-read wrote the terminal status.
  });

  it("24. a revoked invitation cannot be claimed", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);
    const claimantEmail = uniqueEmail("claimant");
    const { rawToken } = await directInvitation({
      targetStudentProfileId: studentProfile.id,
      invitedEmailNormalized: claimantEmail,
      status: "REVOKED",
    });
    const { user: claimant } = await createParentUser(claimantEmail);

    await expect(
      claimGuardianInvitation(db, rawToken, { id: claimant.id, role: "PARENT", email: claimantEmail })
    ).rejects.toThrow(InvitationNotPendingError);
  });

  it("25. targetStudentProfileId is always read from the invitation row — there is no client-suppliable override", async () => {
    const { user: inviter, parentProfile } = await createParentUser();
    const { studentProfile: realTarget } = await createGuardianManagedChildDirect(parentProfile.id);
    const claimantEmail = uniqueEmail("claimant");
    const { rawToken } = await createGuardianInvitation(db, inviter.id, realTarget.id, claimantEmail);
    const { user: claimant } = await createParentUser(claimantEmail);

    // claimGuardianInvitation's signature takes only (rawToken, actor) — no
    // studentProfileId parameter exists at all for a caller to tamper with;
    // this test documents and confirms that by asserting the claimed
    // invitation's target is exactly the one created, from the token alone.
    const claimed = await claimGuardianInvitation(db, rawToken, { id: claimant.id, role: "PARENT", email: claimantEmail });
    expect(claimed.targetStudentProfileId).toBe(realTarget.id);
  });
});

// ---------------------------------------------------------------------------
// Approval (tests 26-37)
// ---------------------------------------------------------------------------

async function setUpClaimedInvitation(overrides?: { claimantEmail?: string }) {
  const { user: guardian, parentProfile: guardianProfile } = await createParentUser();
  const { studentProfile } = await createGuardianManagedChildDirect(guardianProfile.id);
  const claimantEmail = overrides?.claimantEmail ?? uniqueEmail("claimant");
  const { rawToken, invitation } = await createGuardianInvitation(db, guardian.id, studentProfile.id, claimantEmail);
  const { user: claimant, parentProfile: claimantProfile } = await createParentUser(claimantEmail);
  const claimed = await claimGuardianInvitation(db, rawToken, { id: claimant.id, role: "PARENT", email: claimantEmail });
  return { guardian, guardianProfile, studentProfile, invitation: claimed, rawToken, claimant, claimantProfile, invitationId: invitation.id };
}

describe("approveFamilyInvitation", () => {
  it("26. a currently ACTIVE guardian can approve a claimed invitation", async () => {
    const { guardian, invitationId } = await setUpClaimedInvitation();
    const result = await approveFamilyInvitation(db, guardian.id, invitationId);
    if (result.relationship) createdRelationshipIds.push(result.relationship.id);
    expect(result.invitation.status).toBe("ACCEPTED");
  });

  it("27. approval atomically creates an ACTIVE ParentStudentRelationship", async () => {
    const { guardian, invitationId, studentProfile, claimantProfile } = await setUpClaimedInvitation();
    await approveFamilyInvitation(db, guardian.id, invitationId);

    const relationship = await db.parentStudentRelationship.findUnique({
      where: { parentProfileId_studentProfileId: { parentProfileId: claimantProfile.id, studentProfileId: studentProfile.id } },
    });
    expect(relationship?.status).toBe("ACTIVE");
    if (relationship) createdRelationshipIds.push(relationship.id);
  });

  it("28. the invitation becomes ACCEPTED atomically alongside the relationship", async () => {
    const { guardian, invitationId, studentProfile, claimantProfile } = await setUpClaimedInvitation();
    const result = await approveFamilyInvitation(db, guardian.id, invitationId);
    if (result.relationship) createdRelationshipIds.push(result.relationship.id);

    const reloaded = await db.familyInvitation.findUnique({ where: { id: invitationId } });
    expect(reloaded?.status).toBe("ACCEPTED");
    expect(reloaded?.approvedByUserId).toBe(guardian.id);
    void studentProfile;
    void claimantProfile;
  });

  it("29. the newly approved guardian now passes H.2 authority checks", async () => {
    const { guardian, invitationId, studentProfile, claimant } = await setUpClaimedInvitation();
    const result = await approveFamilyInvitation(db, guardian.id, invitationId);
    if (result.relationship) createdRelationshipIds.push(result.relationship.id);

    expect(await hasActiveGuardianAuthority(db, claimant.id, studentProfile.id)).toBe(true);
    expect(await canManageStudentAccount(db, claimant.id, studentProfile.id)).toBe(true);
  });

  it("30. an unrelated Parent cannot approve", async () => {
    const { invitationId } = await setUpClaimedInvitation();
    const { user: unrelatedParent } = await createParentUser();

    await expect(approveFamilyInvitation(db, unrelatedParent.id, invitationId)).rejects.toThrow(NotAuthorizedError);
  });

  it("31. a guardian whose authority was revoked after invite creation cannot approve", async () => {
    const { guardian, invitationId, guardianProfile, studentProfile } = await setUpClaimedInvitation();
    const relationship = await db.parentStudentRelationship.findUniqueOrThrow({
      where: { parentProfileId_studentProfileId: { parentProfileId: guardianProfile.id, studentProfileId: studentProfile.id } },
    });
    await db.parentStudentRelationship.update({ where: { id: relationship.id }, data: { status: "REVOKED" } });

    await expect(approveFamilyInvitation(db, guardian.id, invitationId)).rejects.toThrow(NotAuthorizedError);
  });

  it("32. a claimant email mismatch discovered at approval time fails closed", async () => {
    const { guardian, invitationId, claimant } = await setUpClaimedInvitation();
    // Contrived but exercises the explicit re-check inside approval: the
    // claimant's account email no longer matches invitedEmailNormalized.
    await db.user.update({ where: { id: claimant.id }, data: { email: uniqueEmail("changed-email") } });

    await expect(approveFamilyInvitation(db, guardian.id, invitationId)).rejects.toThrow(EmailMismatchError);
  });

  it("33. approval retry is idempotent — no duplicate relationship, no error, stable result", async () => {
    const { guardian, invitationId, studentProfile, claimantProfile } = await setUpClaimedInvitation();
    const first = await approveFamilyInvitation(db, guardian.id, invitationId);
    if (first.relationship) createdRelationshipIds.push(first.relationship.id);

    const second = await approveFamilyInvitation(db, guardian.id, invitationId);
    expect(second.alreadyAccepted).toBe(true);

    const relationships = await db.parentStudentRelationship.findMany({
      where: { parentProfileId: claimantProfile.id, studentProfileId: studentProfile.id },
    });
    expect(relationships).toHaveLength(1);
  });

  it("34. an existing REVOKED relationship is reactivated on re-approval, never duplicated", async () => {
    const { user: guardian, parentProfile: guardianProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(guardianProfile.id);
    const secondGuardianEmail = uniqueEmail("second-guardian");
    const { user: secondGuardian, parentProfile: secondGuardianProfile } = await createParentUser(secondGuardianEmail);

    // First cycle: invite -> claim -> approve -> revoke.
    const first = await createGuardianInvitation(db, guardian.id, studentProfile.id, secondGuardianEmail);
    await claimGuardianInvitation(db, first.rawToken, { id: secondGuardian.id, role: "PARENT", email: secondGuardianEmail });
    const firstApproval = await approveFamilyInvitation(db, guardian.id, first.invitation.id);
    const relationshipId = firstApproval.relationship!.id;
    createdRelationshipIds.push(relationshipId);
    // Locked policy: only the guardian who owns a relationship may revoke
    // it — secondGuardian self-revokes here, not the original inviter.
    await revokeGuardianRelationship(db, secondGuardian.id, relationshipId);

    // Second cycle: invite the SAME email again -> claim -> approve.
    const second = await createGuardianInvitation(db, guardian.id, studentProfile.id, secondGuardianEmail);
    await claimGuardianInvitation(db, second.rawToken, { id: secondGuardian.id, role: "PARENT", email: secondGuardianEmail });
    const secondApproval = await approveFamilyInvitation(db, guardian.id, second.invitation.id);

    expect(secondApproval.relationship!.id).toBe(relationshipId); // same row reactivated, not a new one.
    expect(secondApproval.relationship!.status).toBe("ACTIVE");

    void secondGuardianProfile;
  });

  it("35. the compound-unique relationship count for one (parent, student) pair remains exactly one after reactivation", async () => {
    const { user: guardian, parentProfile: guardianProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(guardianProfile.id);
    const secondGuardianEmail = uniqueEmail("second-guardian");
    const { user: secondGuardian, parentProfile: secondGuardianProfile } = await createParentUser(secondGuardianEmail);

    const first = await createGuardianInvitation(db, guardian.id, studentProfile.id, secondGuardianEmail);
    await claimGuardianInvitation(db, first.rawToken, { id: secondGuardian.id, role: "PARENT", email: secondGuardianEmail });
    const firstApproval = await approveFamilyInvitation(db, guardian.id, first.invitation.id);
    createdRelationshipIds.push(firstApproval.relationship!.id);
    // Locked policy: secondGuardian self-revokes their own relationship.
    await revokeGuardianRelationship(db, secondGuardian.id, firstApproval.relationship!.id);

    const second = await createGuardianInvitation(db, guardian.id, studentProfile.id, secondGuardianEmail);
    await claimGuardianInvitation(db, second.rawToken, { id: secondGuardian.id, role: "PARENT", email: secondGuardianEmail });
    await approveFamilyInvitation(db, guardian.id, second.invitation.id);

    const rows = await db.parentStudentRelationship.findMany({
      where: { parentProfileId: secondGuardianProfile.id, studentProfileId: studentProfile.id },
    });
    expect(rows).toHaveLength(1);
  });

  it("36. an ACCEPTED invitation cannot be claimed again", async () => {
    const { guardian, invitationId, rawToken, claimant } = await setUpClaimedInvitation();
    const result = await approveFamilyInvitation(db, guardian.id, invitationId);
    if (result.relationship) createdRelationshipIds.push(result.relationship.id);

    await expect(
      claimGuardianInvitation(db, rawToken, { id: claimant.id, role: "PARENT", email: claimant.email! })
    ).rejects.toThrow(InvitationNotPendingError);
  });

  it("37. a rejected claim never creates a relationship", async () => {
    const { guardian, invitationId, studentProfile, claimantProfile } = await setUpClaimedInvitation();
    const rejected = await rejectFamilyInvitationClaim(db, guardian.id, invitationId);
    expect(rejected.status).toBe("REVOKED");

    const relationship = await db.parentStudentRelationship.findUnique({
      where: { parentProfileId_studentProfileId: { parentProfileId: claimantProfile.id, studentProfileId: studentProfile.id } },
    });
    expect(relationship).toBeNull();

    await expect(approveFamilyInvitation(db, guardian.id, invitationId)).rejects.toThrow(InvitationNotClaimedError);
  });
});

// ---------------------------------------------------------------------------
// Revocation (tests 38-46)
// ---------------------------------------------------------------------------

async function setUpTwoActiveGuardians() {
  const { user: guardianA, parentProfile: profileA } = await createParentUser();
  const { studentProfile } = await createGuardianManagedChildDirect(profileA.id);
  const relationshipA = await db.parentStudentRelationship.findUniqueOrThrow({
    where: { parentProfileId_studentProfileId: { parentProfileId: profileA.id, studentProfileId: studentProfile.id } },
  });

  const guardianBEmail = uniqueEmail("guardian-b");
  const { user: guardianB, parentProfile: profileB } = await createParentUser(guardianBEmail);
  const invite = await createGuardianInvitation(db, guardianA.id, studentProfile.id, guardianBEmail);
  await claimGuardianInvitation(db, invite.rawToken, { id: guardianB.id, role: "PARENT", email: guardianBEmail });
  const approval = await approveFamilyInvitation(db, guardianA.id, invite.invitation.id);
  const relationshipB = approval.relationship!;
  createdRelationshipIds.push(relationshipB.id);

  return { guardianA, profileA, guardianB, profileB, studentProfile, relationshipA, relationshipB };
}

describe("revokeGuardianRelationship — locked policy: self-revocation only", () => {
  it("38 / D. the sole ACTIVE guardian cannot self-revoke", async () => {
    const { user, parentProfile } = await createParentUser();
    const { studentProfile, relationship } = await createGuardianManagedChildDirect(parentProfile.id);

    await expect(revokeGuardianRelationship(db, user.id, relationship.id)).rejects.toThrow(LastActiveGuardianError);
    void studentProfile;
  });

  it("A. Guardian A can self-revoke when Guardian B is also ACTIVE", async () => {
    const { guardianA, relationshipA } = await setUpTwoActiveGuardians();
    const result = await revokeGuardianRelationship(db, guardianA.id, relationshipA.id);
    expect(result.relationship.status).toBe("REVOKED");
  });

  it("B. Guardian A cannot revoke Guardian B's relationship", async () => {
    const { guardianA, relationshipB } = await setUpTwoActiveGuardians();
    await expect(revokeGuardianRelationship(db, guardianA.id, relationshipB.id)).rejects.toThrow(
      CannotRevokeOtherGuardianError
    );
    const reloaded = await db.parentStudentRelationship.findUnique({ where: { id: relationshipB.id } });
    expect(reloaded?.status).toBe("ACTIVE"); // untouched — the attempt must not partially apply.
  });

  it("C. Guardian B cannot revoke Guardian A's relationship", async () => {
    const { guardianB, relationshipA } = await setUpTwoActiveGuardians();
    await expect(revokeGuardianRelationship(db, guardianB.id, relationshipA.id)).rejects.toThrow(
      CannotRevokeOtherGuardianError
    );
    const reloaded = await db.parentStudentRelationship.findUnique({ where: { id: relationshipA.id } });
    expect(reloaded?.status).toBe("ACTIVE");
  });

  it("after Guardian A self-revokes, the last remaining guardian (B) cannot self-revoke", async () => {
    const { guardianA, guardianB, relationshipA, relationshipB } = await setUpTwoActiveGuardians();
    await revokeGuardianRelationship(db, guardianA.id, relationshipA.id);

    await expect(revokeGuardianRelationship(db, guardianB.id, relationshipB.id)).rejects.toThrow(LastActiveGuardianError);
  });

  it("E. after Guardian A self-revokes, Guardian A loses all H.2 guardian authority", async () => {
    const { guardianA, relationshipA, studentProfile } = await setUpTwoActiveGuardians();
    await revokeGuardianRelationship(db, guardianA.id, relationshipA.id);

    expect(await hasActiveGuardianAuthority(db, guardianA.id, studentProfile.id)).toBe(false);
  });

  it("F. Guardian B remains ACTIVE and retains authority after Guardian A self-revokes", async () => {
    const { guardianA, guardianB, relationshipA, studentProfile } = await setUpTwoActiveGuardians();
    await revokeGuardianRelationship(db, guardianA.id, relationshipA.id);

    expect(await hasActiveGuardianAuthority(db, guardianB.id, studentProfile.id)).toBe(true);
  });

  it("G. a REVOKED Guardian A cannot use the revoke action against Guardian B", async () => {
    const { guardianA, relationshipA, relationshipB } = await setUpTwoActiveGuardians();
    await revokeGuardianRelationship(db, guardianA.id, relationshipA.id); // A self-revokes first — A is now REVOKED.

    // A (now REVOKED) attempts to revoke B — the ownership check rejects
    // this regardless of A's own status; A never owned B's relationship.
    await expect(revokeGuardianRelationship(db, guardianA.id, relationshipB.id)).rejects.toThrow(
      CannotRevokeOtherGuardianError
    );
    const reloaded = await db.parentStudentRelationship.findUnique({ where: { id: relationshipB.id } });
    expect(reloaded?.status).toBe("ACTIVE");
  });

  it("a self-revoked guardian can be reactivated (via a fresh self-claim by the SAME guardian) and regains authority", async () => {
    const { guardianA, guardianB, relationshipB, studentProfile } = await setUpTwoActiveGuardians();
    // Guardian B self-revokes (the only guardian-facing removal path).
    await revokeGuardianRelationship(db, guardianB.id, relationshipB.id);
    expect(await hasActiveGuardianAuthority(db, guardianB.id, studentProfile.id)).toBe(false);

    // Re-invited and re-approved by the still-ACTIVE Guardian A — reuses
    // the existing create-or-reactivate relationship logic (§20 of the
    // original H.4 report), unaffected by this correction.
    const reinvite = await createGuardianInvitation(db, guardianA.id, studentProfile.id, guardianB.email!);
    await claimGuardianInvitation(db, reinvite.rawToken, { id: guardianB.id, role: "PARENT", email: guardianB.email! });
    await approveFamilyInvitation(db, guardianA.id, reinvite.invitation.id);

    expect(await hasActiveGuardianAuthority(db, guardianB.id, studentProfile.id)).toBe(true);
  });

  it("H. concurrent self-revocations (A revokes A, B revokes B) never produce zero ACTIVE guardians — exactly one succeeds and survives, no duplicate rows", async () => {
    const { guardianA, guardianB, relationshipA, relationshipB, studentProfile } = await setUpTwoActiveGuardians();

    const results = await Promise.allSettled([
      revokeGuardianRelationship(db, guardianA.id, relationshipA.id), // A self-revokes
      revokeGuardianRelationship(db, guardianB.id, relationshipB.id), // B self-revokes, concurrently
    ]);

    // At least one must have been rejected (whichever's transaction lost
    // the Serializable write-skew conflict and then, on retry, found the
    // fresh state already left only one other active guardian).
    const rejected = results.filter((r) => r.status === "rejected");
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(rejected.length).toBeGreaterThanOrEqual(1);
    expect(fulfilled.length).toBeLessThanOrEqual(1);
    if (rejected.length === 1) {
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(LastActiveGuardianError);
    }

    const activeCount = await db.parentStudentRelationship.count({
      where: { studentProfileId: studentProfile.id, status: "ACTIVE" },
    });
    expect(activeCount).toBe(1); // 44. never zero, never both revoked.

    const allRows = await db.parentStudentRelationship.findMany({ where: { studentProfileId: studentProfile.id } });
    expect(allRows).toHaveLength(2); // 45. no duplicate rows — still exactly the original two.
  });

  it("I. a SELF_MANAGED student's historical ACTIVE relationship row grants no authority regardless of its own status (self-revoke attempt correctly denied)", async () => {
    const { user, parentProfile } = await createParentUser();
    const { studentProfile } = await createSelfManagedStudentWithHistoricalGuardian(parentProfile.id);

    expect(await hasActiveGuardianAuthority(db, user.id, studentProfile.id)).toBe(false);
    // Revocation itself is also correctly unreachable — the actor never
    // had authority to begin with (mode gate), so the attempt fails the
    // same way an unrelated Parent's would.
    const relationship = await db.parentStudentRelationship.findUniqueOrThrow({
      where: { parentProfileId_studentProfileId: { parentProfileId: parentProfile.id, studentProfileId: studentProfile.id } },
    });
    await expect(revokeGuardianRelationship(db, user.id, relationship.id)).rejects.toThrow(NotAuthorizedError);
  });
});

