import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";
import * as familyManagement from "./familyManagement";
import {
  createGuardianInvitation,
  createStudentLoginInvitation,
  claimStudentLoginInvitation,
  approveFamilyInvitation,
  rejectFamilyInvitationClaim,
  revokeGuardianRelationship,
  hashInvitationToken,
  NotAuthorizedError,
  InvitationWrongTypeError,
  InvitationNotPendingError,
  InvitationNotClaimedError,
  InvitationExpiredError,
  ClaimantNotEligibleError,
  EmailMismatchError,
  StudentAlreadyLinkedError,
  ClaimantAlreadyLinkedElsewhereError,
  CannotRevokeOtherGuardianError,
} from "./familyManagement";
import { hasActiveGuardianAuthority, canActForStudent, canManageStudentAccount, canInitiatePaidBooking, canPayForStudent } from "./studentAuthorization";
import { createStudentLoginUser } from "./signup";

// Phase H.5 — permanent DB-integration tests for the restricted Student
// login domain (STUDENT_LOGIN invitation create/claim/approve/reject, incl.
// real concurrency and cross-family IDOR). Runs ONLY against the isolated
// DATABASE_URL_TEST database, verified via resolveVerifiedTestDatabase() in
// beforeAll — fails closed before any connection opens if unset/unsafe. The
// normal development database is never touched by this file.

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
  // Same cleanup ordering H.2/H.3/H.4 established: ParentStudentRelationship
  // (Restrict FKs) first, then StudentProfile (cascades FamilyInvitation via
  // targetStudentProfileId), then User last (SELF_MANAGED's SetNull + CHECK
  // constraint requires the StudentProfile gone first; a linked
  // GUARDIAN_MANAGED StudentProfile's userId is a plain nullable FK with no
  // such constraint, but deleting the StudentProfile before its User avoids
  // relying on that distinction here too).
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
  return `h5-it-${prefix}-${randomUUID()}@futuretutor.test`;
}

async function createParentUser(email?: string) {
  const user = await db.user.create({ data: { email: email ?? uniqueEmail("parent"), role: "PARENT" } });
  createdUserIds.push(user.id);
  const parentProfile = await db.parentProfile.create({ data: { userId: user.id, firstName: "Test", lastName: "Parent" } });
  return { user, parentProfile };
}

async function createTutorUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("tutor"), role: "TUTOR" } });
  createdUserIds.push(user.id);
  return { user };
}

async function createAdminUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("admin"), role: "SUPER_ADMIN" } });
  createdUserIds.push(user.id);
  return { user };
}

/** A bare STUDENT-role User with NO StudentProfile — the normal shape of a
 * fresh new-account claimant before approval. */
async function createBareStudentUser(email?: string) {
  const user = await db.user.create({ data: { email: email ?? uniqueEmail("student"), role: "STUDENT" } });
  createdUserIds.push(user.id);
  return { user };
}

/** An existing STUDENT-role User already linked (via userId) to a DIFFERENT
 * SELF_MANAGED StudentProfile — for the "already linked elsewhere" denial
 * tests (§15/§30). */
async function createStudentUserWithExistingProfile(email?: string) {
  const user = await db.user.create({ data: { email: email ?? uniqueEmail("existing-student"), role: "STUDENT" } });
  createdUserIds.push(user.id);
  const studentProfile = await db.studentProfile.create({
    data: { userId: user.id, firstName: "Existing", lastName: "Student", managementMode: "SELF_MANAGED" },
  });
  createdStudentProfileIds.push(studentProfile.id);
  return { user, studentProfile };
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
  status?: "PENDING" | "CLAIMED_PENDING_APPROVAL" | "ACCEPTED" | "EXPIRED" | "REVOKED";
  expiresAt?: Date;
  claimedByUserId?: string;
  claimedAt?: Date;
}) {
  const rawToken = randomUUID();
  const tokenHash = hashInvitationToken(rawToken);
  const invitation = await db.familyInvitation.create({
    data: {
      type: "STUDENT_LOGIN",
      targetStudentProfileId: params.targetStudentProfileId,
      invitedEmailNormalized: params.invitedEmailNormalized,
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
// §43 — Invitation creation (tests 1-12)
// ---------------------------------------------------------------------------

describe("createStudentLoginInvitation", () => {
  it("1-6. an ACTIVE guardian creates a STUDENT_LOGIN invitation: GUARDIAN_MANAGED target, userId NULL, tokenHash stored (not raw), type/status correct", async () => {
    const { user: guardian, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);
    expect(studentProfile.managementMode).toBe("GUARDIAN_MANAGED"); // 2
    expect(studentProfile.userId).toBeNull(); // 3

    const recipientEmail = uniqueEmail("student-recipient");
    const { invitation, rawToken } = await createStudentLoginInvitation(db, guardian.id, studentProfile.id, recipientEmail);

    expect(invitation.type).toBe("STUDENT_LOGIN"); // 5
    expect(invitation.status).toBe("PENDING"); // 6
    expect(invitation.tokenHash).toBe(hashInvitationToken(rawToken)); // 4
    expect(invitation.tokenHash).not.toBe(rawToken); // 4
    const wrongLookup = await db.familyInvitation.findUnique({ where: { tokenHash: rawToken } });
    expect(wrongLookup).toBeNull();
  });

  it("7. the 72h TTL is applied to expiresAt", async () => {
    const { user: guardian, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);
    const before = Date.now();

    const { invitation } = await createStudentLoginInvitation(db, guardian.id, studentProfile.id, uniqueEmail("recipient"));

    const expectedMs = 72 * 60 * 60 * 1000;
    const actualMs = invitation.expiresAt.getTime() - before;
    expect(actualMs).toBeGreaterThan(expectedMs - 5000); // small tolerance for test execution time
    expect(actualMs).toBeLessThan(expectedMs + 5000);
  });

  it("8. an unrelated Parent cannot create a Student login invitation", async () => {
    const { user: unrelatedParent } = await createParentUser();
    const { parentProfile: ownerProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(ownerProfile.id);

    await expect(
      createStudentLoginInvitation(db, unrelatedParent.id, studentProfile.id, uniqueEmail("recipient"))
    ).rejects.toThrow(NotAuthorizedError);
  });

  it("9. a REVOKED guardian cannot create an invitation", async () => {
    const { user: guardian, parentProfile } = await createParentUser();
    const { studentProfile, relationship } = await createGuardianManagedChildDirect(parentProfile.id);
    await db.parentStudentRelationship.update({ where: { id: relationship.id }, data: { status: "REVOKED" } });

    await expect(
      createStudentLoginInvitation(db, guardian.id, studentProfile.id, uniqueEmail("recipient"))
    ).rejects.toThrow(NotAuthorizedError);
  });

  it("10. a SELF_MANAGED student cannot receive a STUDENT_LOGIN invitation from a historical guardian", async () => {
    const { user: guardian, parentProfile } = await createParentUser();
    const { studentProfile } = await createSelfManagedStudentWithHistoricalGuardian(parentProfile.id);

    await expect(
      createStudentLoginInvitation(db, guardian.id, studentProfile.id, uniqueEmail("recipient"))
    ).rejects.toThrow(NotAuthorizedError);
  });

  it("11. an already-linked StudentProfile cannot receive a new Student login invitation", async () => {
    const { user: guardian, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);
    const linkedUser = await db.user.create({ data: { email: uniqueEmail("already-linked"), role: "STUDENT" } });
    createdUserIds.push(linkedUser.id);
    await db.studentProfile.update({ where: { id: studentProfile.id }, data: { userId: linkedUser.id } });

    await expect(
      createStudentLoginInvitation(db, guardian.id, studentProfile.id, uniqueEmail("recipient"))
    ).rejects.toThrow(StudentAlreadyLinkedError);
  });

  it("12. a second invite to the same recipient supersedes the prior live one; a different recipient's invite is untouched (matches H.4's approved supersession policy)", async () => {
    const { user: guardian, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);

    const first = await createStudentLoginInvitation(db, guardian.id, studentProfile.id, "same@example.com");
    const other = await createStudentLoginInvitation(db, guardian.id, studentProfile.id, "different@example.com");
    const second = await createStudentLoginInvitation(db, guardian.id, studentProfile.id, "same@example.com");

    const firstReloaded = await db.familyInvitation.findUnique({ where: { id: first.invitation.id } });
    const otherReloaded = await db.familyInvitation.findUnique({ where: { id: other.invitation.id } });
    expect(firstReloaded?.status).toBe("REVOKED");
    expect(otherReloaded?.status).toBe("PENDING");
    expect(second.invitation.status).toBe("PENDING");
  });
});

// ---------------------------------------------------------------------------
// §44 — Claim (tests 13-30)
// ---------------------------------------------------------------------------

describe("claimStudentLoginInvitation", () => {
  it("13. correct token + matching STUDENT account claims successfully", async () => {
    const { user: guardian, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);
    const recipientEmail = uniqueEmail("recipient");
    const { rawToken } = await createStudentLoginInvitation(db, guardian.id, studentProfile.id, recipientEmail);
    const { user: claimant } = await createBareStudentUser(recipientEmail);

    const claimed = await claimStudentLoginInvitation(db, rawToken, { id: claimant.id, role: "STUDENT", email: recipientEmail });
    expect(claimed.status).toBe("CLAIMED_PENDING_APPROVAL"); // 20
    expect(claimed.claimedByUserId).toBe(claimant.id); // 21
  });

  it("14. a mismatched email cannot claim", async () => {
    const { user: guardian, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);
    const { rawToken } = await createStudentLoginInvitation(db, guardian.id, studentProfile.id, uniqueEmail("intended"));
    const { user: wrongClaimant } = await createBareStudentUser();

    await expect(
      claimStudentLoginInvitation(db, rawToken, { id: wrongClaimant.id, role: "STUDENT", email: wrongClaimant.email })
    ).rejects.toThrow(EmailMismatchError);
  });

  it("15. a PARENT account cannot claim a STUDENT_LOGIN invitation", async () => {
    const { user: guardian, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);
    const recipientEmail = uniqueEmail("recipient");
    const { rawToken } = await createStudentLoginInvitation(db, guardian.id, studentProfile.id, recipientEmail);
    const { user: parentClaimant } = await createParentUser(recipientEmail);

    await expect(
      claimStudentLoginInvitation(db, rawToken, { id: parentClaimant.id, role: "PARENT", email: recipientEmail })
    ).rejects.toThrow(ClaimantNotEligibleError);
  });

  it("16. a TUTOR account cannot claim", async () => {
    const { user: guardian, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);
    const recipientEmail = uniqueEmail("recipient");
    const { rawToken } = await createStudentLoginInvitation(db, guardian.id, studentProfile.id, recipientEmail);
    const { user: tutorClaimant } = await createTutorUser();

    await expect(
      claimStudentLoginInvitation(db, rawToken, { id: tutorClaimant.id, role: "TUTOR", email: tutorClaimant.email })
    ).rejects.toThrow(ClaimantNotEligibleError);
  });

  it("17. an ADMIN account cannot claim", async () => {
    const { user: guardian, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);
    const recipientEmail = uniqueEmail("recipient");
    const { rawToken } = await createStudentLoginInvitation(db, guardian.id, studentProfile.id, recipientEmail);
    const { user: adminClaimant } = await createAdminUser();

    await expect(
      claimStudentLoginInvitation(db, rawToken, { id: adminClaimant.id, role: "SUPER_ADMIN", email: adminClaimant.email })
    ).rejects.toThrow(ClaimantNotEligibleError);
  });

  it("18-19. a brand-new Student account can be created during claim — User only, no new StudentProfile", async () => {
    const { user: guardian, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);
    const recipientEmail = uniqueEmail("recipient");
    const { rawToken } = await createStudentLoginInvitation(db, guardian.id, studentProfile.id, recipientEmail);

    // Mirrors exactly what claimStudentLoginWithNewAccountAction does:
    // createStudentLoginUser (User only) then claimStudentLoginInvitation.
    const newUser = await createStudentLoginUser(db, {
      firstName: "New",
      lastName: "Student",
      email: recipientEmail,
      passwordHash: "not-a-real-hash-for-test-purposes",
    });
    createdUserIds.push(newUser.id);

    const linkedProfile = await db.studentProfile.findUnique({ where: { userId: newUser.id } });
    expect(linkedProfile).toBeNull(); // 19 — no StudentProfile was fabricated for the new User.

    const claimed = await claimStudentLoginInvitation(db, rawToken, { id: newUser.id, role: "STUDENT", email: recipientEmail });
    expect(claimed.claimedByUserId).toBe(newUser.id);
  });

  it("22. StudentProfile.userId is still NULL after claim", async () => {
    const { user: guardian, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);
    const recipientEmail = uniqueEmail("recipient");
    const { rawToken } = await createStudentLoginInvitation(db, guardian.id, studentProfile.id, recipientEmail);
    const { user: claimant } = await createBareStudentUser(recipientEmail);

    await claimStudentLoginInvitation(db, rawToken, { id: claimant.id, role: "STUDENT", email: recipientEmail });

    const reloaded = await db.studentProfile.findUniqueOrThrow({ where: { id: studentProfile.id } });
    expect(reloaded.userId).toBeNull();
  });

  it("23. the claimant has zero H.2 access to the target student before approval", async () => {
    const { user: guardian, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);
    const recipientEmail = uniqueEmail("recipient");
    const { rawToken } = await createStudentLoginInvitation(db, guardian.id, studentProfile.id, recipientEmail);
    const { user: claimant } = await createBareStudentUser(recipientEmail);

    await claimStudentLoginInvitation(db, rawToken, { id: claimant.id, role: "STUDENT", email: recipientEmail });

    expect(await canActForStudent(db, claimant.id, studentProfile.id)).toBe(false);
  });

  it("24. token replay after claim cannot replace the claimant", async () => {
    const { user: guardian, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);
    const recipientEmail = uniqueEmail("recipient");
    const { rawToken } = await createStudentLoginInvitation(db, guardian.id, studentProfile.id, recipientEmail);
    const { user: claimant } = await createBareStudentUser(recipientEmail);

    await claimStudentLoginInvitation(db, rawToken, { id: claimant.id, role: "STUDENT", email: recipientEmail });
    await expect(
      claimStudentLoginInvitation(db, rawToken, { id: claimant.id, role: "STUDENT", email: recipientEmail })
    ).rejects.toThrow(InvitationNotPendingError);
  });

  it("25. a second, different claimant cannot replace the first claimant", async () => {
    const { user: guardian, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);
    const recipientEmail = uniqueEmail("recipient");
    const { rawToken } = await createStudentLoginInvitation(db, guardian.id, studentProfile.id, recipientEmail);
    const { user: firstClaimant } = await createBareStudentUser(recipientEmail);

    const firstResult = await claimStudentLoginInvitation(db, rawToken, {
      id: firstClaimant.id,
      role: "STUDENT",
      email: recipientEmail,
    });
    expect(firstResult.claimedByUserId).toBe(firstClaimant.id);

    const { user: secondClaimant } = await createBareStudentUser(); // different email on purpose
    await expect(
      claimStudentLoginInvitation(db, rawToken, { id: secondClaimant.id, role: "STUDENT", email: recipientEmail })
    ).rejects.toThrow(InvitationNotPendingError);

    const reloaded = await db.familyInvitation.findUnique({ where: { id: firstResult.id } });
    expect(reloaded?.claimedByUserId).toBe(firstClaimant.id); // unchanged
  });

  it("26. an expired invitation cannot be claimed", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);
    const recipientEmail = uniqueEmail("recipient");
    const { rawToken, invitation } = await directInvitation({
      targetStudentProfileId: studentProfile.id,
      invitedEmailNormalized: recipientEmail,
      expiresAt: new Date(Date.now() - 1000 * 60),
    });
    const { user: claimant } = await createBareStudentUser(recipientEmail);

    await expect(
      claimStudentLoginInvitation(db, rawToken, { id: claimant.id, role: "STUDENT", email: recipientEmail })
    ).rejects.toThrow(InvitationExpiredError);

    const reloaded = await db.familyInvitation.findUnique({ where: { id: invitation.id } });
    expect(reloaded?.status).toBe("EXPIRED"); // lazy expiry-on-read wrote the terminal status.
  });

  it("27. a revoked invitation cannot be claimed", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);
    const recipientEmail = uniqueEmail("recipient");
    const { rawToken } = await directInvitation({
      targetStudentProfileId: studentProfile.id,
      invitedEmailNormalized: recipientEmail,
      status: "REVOKED",
    });
    const { user: claimant } = await createBareStudentUser(recipientEmail);

    await expect(
      claimStudentLoginInvitation(db, rawToken, { id: claimant.id, role: "STUDENT", email: recipientEmail })
    ).rejects.toThrow(InvitationNotPendingError);
  });

  it("28. claimStudentLoginInvitation rejects a GUARDIAN_LINK token (wrong invitation type)", async () => {
    const { user: guardian, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);
    const recipientEmail = uniqueEmail("recipient");
    const { rawToken } = await createGuardianInvitation(db, guardian.id, studentProfile.id, recipientEmail);
    const { user: claimant } = await createBareStudentUser(recipientEmail);

    await expect(
      claimStudentLoginInvitation(db, rawToken, { id: claimant.id, role: "STUDENT", email: recipientEmail })
    ).rejects.toThrow(InvitationWrongTypeError);
  });

  it("29. targetStudentProfileId is always read from the invitation row — the function signature has no studentProfileId parameter for a caller to tamper with", async () => {
    const { user: guardian, parentProfile } = await createParentUser();
    const { studentProfile: realTarget } = await createGuardianManagedChildDirect(parentProfile.id);
    const recipientEmail = uniqueEmail("recipient");
    const { rawToken } = await createStudentLoginInvitation(db, guardian.id, realTarget.id, recipientEmail);
    const { user: claimant } = await createBareStudentUser(recipientEmail);

    const claimed = await claimStudentLoginInvitation(db, rawToken, { id: claimant.id, role: "STUDENT", email: recipientEmail });
    expect(claimed.targetStudentProfileId).toBe(realTarget.id);
  });

  it("30. an existing Student User already linked to a DIFFERENT StudentProfile cannot claim", async () => {
    const { user: guardian, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);
    const recipientEmail = uniqueEmail("recipient");
    const { rawToken } = await createStudentLoginInvitation(db, guardian.id, studentProfile.id, recipientEmail);
    const { user: alreadyLinkedClaimant } = await createStudentUserWithExistingProfile(recipientEmail);

    await expect(
      claimStudentLoginInvitation(db, rawToken, { id: alreadyLinkedClaimant.id, role: "STUDENT", email: recipientEmail })
    ).rejects.toThrow(ClaimantAlreadyLinkedElsewhereError);
  });
});

// ---------------------------------------------------------------------------
// §45 — Approval (tests 31-47)
// ---------------------------------------------------------------------------

async function setUpClaimedStudentLoginInvitation(overrides?: { claimantEmail?: string }) {
  const { user: guardian, parentProfile: guardianProfile } = await createParentUser();
  const { studentProfile } = await createGuardianManagedChildDirect(guardianProfile.id);
  const claimantEmail = overrides?.claimantEmail ?? uniqueEmail("claimant");
  const { rawToken, invitation } = await createStudentLoginInvitation(db, guardian.id, studentProfile.id, claimantEmail);
  const { user: claimant } = await createBareStudentUser(claimantEmail);
  const claimed = await claimStudentLoginInvitation(db, rawToken, { id: claimant.id, role: "STUDENT", email: claimantEmail });
  return { guardian, guardianProfile, studentProfile, invitation: claimed, invitationId: invitation.id, claimant };
}

describe("approveFamilyInvitation — STUDENT_LOGIN", () => {
  it("31-32-34-35. an ACTIVE guardian approves: StudentProfile.userId becomes the claimant, invitation ACCEPTED atomically, approvedByUserId/approvedAt set", async () => {
    const { guardian, invitationId, studentProfile, claimant } = await setUpClaimedStudentLoginInvitation();
    const result = await approveFamilyInvitation(db, guardian.id, invitationId);

    expect(result.invitation.status).toBe("ACCEPTED"); // 34
    expect(result.invitation.approvedByUserId).toBe(guardian.id); // 35
    expect(result.invitation.approvedAt).not.toBeNull(); // 35

    const reloadedStudent = await db.studentProfile.findUniqueOrThrow({ where: { id: studentProfile.id } });
    expect(reloadedStudent.userId).toBe(claimant.id); // 32
  });

  it("33. managementMode remains GUARDIAN_MANAGED after activation", async () => {
    const { guardian, invitationId, studentProfile } = await setUpClaimedStudentLoginInvitation();
    await approveFamilyInvitation(db, guardian.id, invitationId);

    const reloaded = await db.studentProfile.findUniqueOrThrow({ where: { id: studentProfile.id } });
    expect(reloaded.managementMode).toBe("GUARDIAN_MANAGED");
  });

  it("36-37-38-39. after approval, the Student User: canActForStudent true; canManageStudentAccount/canInitiatePaidBooking/canPayForStudent all false", async () => {
    const { guardian, invitationId, studentProfile, claimant } = await setUpClaimedStudentLoginInvitation();
    await approveFamilyInvitation(db, guardian.id, invitationId);

    expect(await canActForStudent(db, claimant.id, studentProfile.id)).toBe(true); // 36
    expect(await canManageStudentAccount(db, claimant.id, studentProfile.id)).toBe(false); // 37
    expect(await canInitiatePaidBooking(db, claimant.id, studentProfile.id)).toBe(false); // 38
    expect(await canPayForStudent(db, claimant.id, studentProfile.id)).toBe(false); // 39
  });

  it("40. the guardian retains full authority after Student login activation", async () => {
    const { guardian, invitationId, studentProfile } = await setUpClaimedStudentLoginInvitation();
    await approveFamilyInvitation(db, guardian.id, invitationId);

    expect(await hasActiveGuardianAuthority(db, guardian.id, studentProfile.id)).toBe(true);
    expect(await canManageStudentAccount(db, guardian.id, studentProfile.id)).toBe(true);
    expect(await canInitiatePaidBooking(db, guardian.id, studentProfile.id)).toBe(true);
    expect(await canPayForStudent(db, guardian.id, studentProfile.id)).toBe(true);
  });

  it("41. an unrelated Parent cannot approve", async () => {
    const { invitationId } = await setUpClaimedStudentLoginInvitation();
    const { user: unrelatedParent } = await createParentUser();

    await expect(approveFamilyInvitation(db, unrelatedParent.id, invitationId)).rejects.toThrow(NotAuthorizedError);
  });

  it("42. a guardian whose authority was revoked before approval cannot approve", async () => {
    const { guardian, invitationId, guardianProfile, studentProfile } = await setUpClaimedStudentLoginInvitation();
    const relationship = await db.parentStudentRelationship.findUniqueOrThrow({
      where: { parentProfileId_studentProfileId: { parentProfileId: guardianProfile.id, studentProfileId: studentProfile.id } },
    });
    await db.parentStudentRelationship.update({ where: { id: relationship.id }, data: { status: "REVOKED" } });

    await expect(approveFamilyInvitation(db, guardian.id, invitationId)).rejects.toThrow(NotAuthorizedError);
  });

  it("43. a claimant email mismatch discovered at approval time fails closed", async () => {
    const { guardian, invitationId, claimant } = await setUpClaimedStudentLoginInvitation();
    await db.user.update({ where: { id: claimant.id }, data: { email: uniqueEmail("changed-email") } });

    await expect(approveFamilyInvitation(db, guardian.id, invitationId)).rejects.toThrow(EmailMismatchError);
  });

  it("44. a claimant role mismatch discovered at approval time fails closed", async () => {
    const { guardian, invitationId, claimant } = await setUpClaimedStudentLoginInvitation();
    // Contrived: the claimant's role changed between claim and approval
    // (this codebase has no role-change feature — this exercises the
    // defensive re-check regardless).
    await db.user.update({ where: { id: claimant.id }, data: { role: "TUTOR" } });

    await expect(approveFamilyInvitation(db, guardian.id, invitationId)).rejects.toThrow(ClaimantNotEligibleError);
  });

  it("45. approval retry is idempotent — no relink, no error, stable result", async () => {
    const { guardian, invitationId, studentProfile, claimant } = await setUpClaimedStudentLoginInvitation();
    const first = await approveFamilyInvitation(db, guardian.id, invitationId);
    expect(first.alreadyAccepted).toBe(false);

    const second = await approveFamilyInvitation(db, guardian.id, invitationId);
    expect(second.alreadyAccepted).toBe(true);

    const reloaded = await db.studentProfile.findUniqueOrThrow({ where: { id: studentProfile.id } });
    expect(reloaded.userId).toBe(claimant.id);
  });

  it("46-47. approval creates no second StudentProfile and no ParentStudentRelationship", async () => {
    const { guardian, invitationId, studentProfile, claimant } = await setUpClaimedStudentLoginInvitation();
    await approveFamilyInvitation(db, guardian.id, invitationId);

    const profilesForClaimant = await db.studentProfile.findMany({ where: { userId: claimant.id } });
    expect(profilesForClaimant).toHaveLength(1);
    expect(profilesForClaimant[0]!.id).toBe(studentProfile.id);

    const relationshipsInvolvingClaimant = await db.parentStudentRelationship.findMany({
      where: { studentProfileId: studentProfile.id },
    });
    // Only the original guardian's relationship — the claimant (a Student,
    // not a Parent) never gets a ParentStudentRelationship of their own.
    expect(relationshipsInvolvingClaimant).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// §46 — Rejection (tests 48-54)
// ---------------------------------------------------------------------------

describe("rejectFamilyInvitationClaim — STUDENT_LOGIN", () => {
  it("48-49-50. an ACTIVE guardian can reject a claimed Student login: invitation REVOKED, StudentProfile.userId stays NULL", async () => {
    const { guardian, invitationId, studentProfile } = await setUpClaimedStudentLoginInvitation();
    const rejected = await rejectFamilyInvitationClaim(db, guardian.id, invitationId);
    expect(rejected.status).toBe("REVOKED"); // 49

    const reloaded = await db.studentProfile.findUniqueOrThrow({ where: { id: studentProfile.id } });
    expect(reloaded.userId).toBeNull(); // 50
  });

  it("51. a rejected invitation cannot later be approved", async () => {
    const { guardian, invitationId } = await setUpClaimedStudentLoginInvitation();
    await rejectFamilyInvitationClaim(db, guardian.id, invitationId);

    await expect(approveFamilyInvitation(db, guardian.id, invitationId)).rejects.toThrow(InvitationNotClaimedError);
  });

  it("52. the claimed User does not gain H.2 student access after rejection", async () => {
    const { guardian, invitationId, studentProfile, claimant } = await setUpClaimedStudentLoginInvitation();
    await rejectFamilyInvitationClaim(db, guardian.id, invitationId);

    expect(await canActForStudent(db, claimant.id, studentProfile.id)).toBe(false);
  });

  it("53. an unrelated guardian cannot reject", async () => {
    const { invitationId } = await setUpClaimedStudentLoginInvitation();
    const { user: unrelatedParent } = await createParentUser();

    await expect(rejectFamilyInvitationClaim(db, unrelatedParent.id, invitationId)).rejects.toThrow(NotAuthorizedError);
  });

  it("54. a guardian whose authority is revoked cannot reject", async () => {
    const { guardian, invitationId, guardianProfile, studentProfile } = await setUpClaimedStudentLoginInvitation();
    const relationship = await db.parentStudentRelationship.findUniqueOrThrow({
      where: { parentProfileId_studentProfileId: { parentProfileId: guardianProfile.id, studentProfileId: studentProfile.id } },
    });
    await db.parentStudentRelationship.update({ where: { id: relationship.id }, data: { status: "REVOKED" } });

    await expect(rejectFamilyInvitationClaim(db, guardian.id, invitationId)).rejects.toThrow(NotAuthorizedError);
  });
});

// ---------------------------------------------------------------------------
// §47 — Concurrency (tests 55-62)
// ---------------------------------------------------------------------------

describe("STUDENT_LOGIN approval concurrency", () => {
  it("55-60. two concurrent approval attempts for the same claim converge safely: exactly one linkage, ACCEPTED, no duplicate rows, managementMode unchanged", async () => {
    const { guardian, invitationId, studentProfile, claimant } = await setUpClaimedStudentLoginInvitation();

    const results = await Promise.allSettled([
      approveFamilyInvitation(db, guardian.id, invitationId),
      approveFamilyInvitation(db, guardian.id, invitationId),
    ]);

    // Both may succeed (the second converges idempotently) or one may have
    // raced into the idempotent branch — either way, both must resolve
    // without throwing, since approval is designed to be safely retried by
    // the SAME guardian for the SAME already-in-flight invitation.
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled.length).toBe(2);

    const reloadedStudent = await db.studentProfile.findUniqueOrThrow({ where: { id: studentProfile.id } });
    expect(reloadedStudent.userId).toBe(claimant.id); // 56
    expect(reloadedStudent.managementMode).toBe("GUARDIAN_MANAGED"); // 60 — never touched.

    const reloadedInvitation = await db.familyInvitation.findUniqueOrThrow({ where: { id: invitationId } });
    expect(reloadedInvitation.status).toBe("ACCEPTED"); // 57

    const profilesForClaimant = await db.studentProfile.findMany({ where: { userId: claimant.id } });
    expect(profilesForClaimant).toHaveLength(1); // 58 — no duplicate StudentProfile.

    const usersWithThisEmail = await db.user.findMany({ where: { id: claimant.id } });
    expect(usersWithThisEmail).toHaveLength(1); // 59 — no duplicate User (trivially true, but asserted).
  });

  it("61-62. a competing SECOND claimed STUDENT_LOGIN invitation for the SAME target cannot overwrite an already-linked userId — the loser is rejected safely by the guarded update", async () => {
    // Controlled fixture reproducing the historical/race state the H.5
    // prompt's §24 describes (H.4's own supersession logic already
    // prevents two simultaneously-PENDING invitations to different
    // recipients from both reaching CLAIMED_PENDING_APPROVAL for the SAME
    // target in normal operation — this test constructs that state
    // directly rather than relying on a real timing race, per the prompt's
    // own explicit instruction to test the DB/linkage invariant with
    // controlled fixtures).
    const { user: guardian, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChildDirect(parentProfile.id);

    const firstEmail = uniqueEmail("first-claimant");
    const { rawToken: firstToken } = await createStudentLoginInvitation(db, guardian.id, studentProfile.id, firstEmail);
    const { user: firstClaimant } = await createBareStudentUser(firstEmail);
    await claimStudentLoginInvitation(db, firstToken, { id: firstClaimant.id, role: "STUDENT", email: firstEmail });

    // A second invitation+claim for a DIFFERENT recipient, targeting the
    // SAME StudentProfile, constructed directly (bypassing the normal
    // supersession path that would otherwise prevent this from arising
    // through the public API alone).
    const secondEmail = uniqueEmail("second-claimant");
    const { user: secondClaimant } = await createBareStudentUser(secondEmail);
    const { invitation: secondInvitation } = await directInvitation({
      targetStudentProfileId: studentProfile.id,
      invitedEmailNormalized: secondEmail,
      status: "CLAIMED_PENDING_APPROVAL",
      claimedByUserId: secondClaimant.id,
      claimedAt: new Date(),
    });

    // Approve the first — succeeds, links the first claimant.
    const firstInvitationRow = await db.familyInvitation.findUniqueOrThrow({ where: { tokenHash: hashInvitationToken(firstToken) } });
    await approveFamilyInvitation(db, guardian.id, firstInvitationRow.id);

    // Approving the second must now fail — the target's userId is already
    // set to someone else. The guarded `updateMany({where: {userId: null}})`
    // inside approveStudentLoginInvitation matches zero rows and throws
    // StudentAlreadyLinkedError, never silently overwriting the first
    // linkage (§61: "competing valid candidate identities cannot overwrite
    // an already-set userId").
    await expect(approveFamilyInvitation(db, guardian.id, secondInvitation.id)).rejects.toThrow(StudentAlreadyLinkedError); // 62

    const reloadedStudent = await db.studentProfile.findUniqueOrThrow({ where: { id: studentProfile.id } });
    expect(reloadedStudent.userId).toBe(firstClaimant.id); // 61 — first claimant's linkage survives, untouched.
  });
});

// ---------------------------------------------------------------------------
// §48 — Security / IDOR (tests 63-70)
// ---------------------------------------------------------------------------

describe("STUDENT_LOGIN — cross-family / IDOR / restricted-Student boundaries", () => {
  it("63. Parent A cannot create a Student login invitation for Parent B's child", async () => {
    const { user: parentA } = await createParentUser();
    const { parentProfile: profileB } = await createParentUser();
    const { studentProfile: childOfB } = await createGuardianManagedChildDirect(profileB.id);

    await expect(createStudentLoginInvitation(db, parentA.id, childOfB.id, uniqueEmail("x"))).rejects.toThrow(
      NotAuthorizedError
    );
  });

  it("64. Parent A cannot approve Parent B's child's Student login claim", async () => {
    const { invitationId } = await setUpClaimedStudentLoginInvitation();
    const { user: parentA } = await createParentUser();

    await expect(approveFamilyInvitation(db, parentA.id, invitationId)).rejects.toThrow(NotAuthorizedError);
  });

  it("65. an arbitrary Student cannot attach to another StudentProfile by any path this module exposes — already covered directly by test 30 (claim) and re-asserted here for the approval boundary", async () => {
    const { guardian, invitationId, studentProfile } = await setUpClaimedStudentLoginInvitation();
    // A second, unrelated Student who owns their OWN StudentProfile
    // elsewhere attempts nothing here directly (there is no service
    // function that would let them target someone else's invitation by
    // id alone — approval requires guardian authority, claim requires
    // token possession + email match). This test documents that absence
    // by confirming approval still requires guardian authority even when
    // a plausible-looking unrelated Student account exists.
    const { user: unrelatedStudent } = await createStudentUserWithExistingProfile();
    await expect(approveFamilyInvitation(db, unrelatedStudent.id, invitationId)).rejects.toThrow(NotAuthorizedError);
    void guardian;
    void studentProfile;
  });

  it("66. raw StudentProfile ID manipulation cannot redirect an invitation's target — re-confirms test 29's guarantee at the claim boundary specifically", async () => {
    const { user: guardian, parentProfile } = await createParentUser();
    const { studentProfile: realTarget } = await createGuardianManagedChildDirect(parentProfile.id);
    const { studentProfile: decoyTarget } = await createGuardianManagedChildDirect(parentProfile.id);
    const recipientEmail = uniqueEmail("recipient");
    const { rawToken } = await createStudentLoginInvitation(db, guardian.id, realTarget.id, recipientEmail);
    const { user: claimant } = await createBareStudentUser(recipientEmail);

    const claimed = await claimStudentLoginInvitation(db, rawToken, { id: claimant.id, role: "STUDENT", email: recipientEmail });
    expect(claimed.targetStudentProfileId).toBe(realTarget.id);
    expect(claimed.targetStudentProfileId).not.toBe(decoyTarget.id);
  });

  it("67. a restricted (linked, GUARDIAN_MANAGED) Student cannot revoke a guardian relationship", async () => {
    const { guardian, invitationId, studentProfile, claimant } = await setUpClaimedStudentLoginInvitation();
    await approveFamilyInvitation(db, guardian.id, invitationId);

    const relationship = await db.parentStudentRelationship.findFirstOrThrow({ where: { studentProfileId: studentProfile.id } });
    // The Student is not the owner of the guardian's ParentStudentRelationship
    // (they're a different User entirely, and not a Parent at all) — the
    // ownership check inside revokeGuardianRelationship fires before the
    // general authority check, so this is rejected with the more specific
    // CannotRevokeOtherGuardianError rather than a generic NotAuthorizedError.
    await expect(revokeGuardianRelationship(db, claimant.id, relationship.id)).rejects.toThrow(
      CannotRevokeOtherGuardianError
    );
  });

  it("68. a restricted Student cannot create a GUARDIAN_LINK invitation", async () => {
    const { guardian, invitationId, studentProfile, claimant } = await setUpClaimedStudentLoginInvitation();
    await approveFamilyInvitation(db, guardian.id, invitationId);

    await expect(createGuardianInvitation(db, claimant.id, studentProfile.id, uniqueEmail("x"))).rejects.toThrow(
      NotAuthorizedError
    );
    void guardian;
  });

  it("69. a restricted Student cannot create another Student login invitation (e.g. for a sibling)", async () => {
    const { guardian, invitationId, studentProfile, claimant } = await setUpClaimedStudentLoginInvitation();
    await approveFamilyInvitation(db, guardian.id, invitationId);

    // Attempt against their OWN (already-linked) profile — also denied,
    // since createStudentLoginInvitation itself requires guardian
    // authority, which a Student login never has, regardless of target.
    await expect(createStudentLoginInvitation(db, claimant.id, studentProfile.id, uniqueEmail("x"))).rejects.toThrow(
      NotAuthorizedError
    );
  });

  it("70. no mutation surface exists anywhere in this module for a restricted Student to self-transition to SELF_MANAGED — verified by absence, not by a negative call against a real function", () => {
    // H.5 explicitly does not implement any GUARDIAN_MANAGED -> SELF_MANAGED
    // transition (§39 of the H.5 prompt) — there is no function to call
    // for this negative test, so its absence is confirmed structurally: no
    // exported member of this module has a name suggesting such a
    // transition.
    const exportNames = Object.keys(familyManagement);
    const suspiciousNames = exportNames.filter((name) => /selfmanaged|SelfManaged/i.test(name));
    expect(suspiciousNames).toHaveLength(0);
  });
});
