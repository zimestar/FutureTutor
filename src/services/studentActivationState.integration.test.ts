import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";
import { resolveStudentAccountActivationState, hashInvitationToken } from "./familyManagement";
import { canInitiatePaidBooking, canManageStudentAccount } from "./studentAuthorization";

// Phase H.5 Final Claimant-State UX Correction — the 12 required permanent
// tests for resolveStudentAccountActivationState (§12 of the correction
// prompt). Runs ONLY against the isolated DATABASE_URL_TEST database,
// verified via resolveVerifiedTestDatabase() in beforeAll. This resolver is
// UX/account-state logic only — tests 9-12 exist specifically to prove it
// grants nothing: H.2 (src/services/studentAuthorization.ts) remains the
// sole authorization authority regardless of which of these states resolves.

let db: PrismaClient;
const createdUserIds: string[] = [];
const createdStudentProfileIds: string[] = [];
const createdRelationshipIds: string[] = [];
const createdInvitationIds: string[] = [];

beforeAll(() => {
  const target = resolveVerifiedTestDatabase();
  const adapter = new PrismaPg({ connectionString: target.connectionString });
  db = new PrismaClient({ adapter });
});

afterAll(async () => {
  await db?.$disconnect();
});

afterEach(async () => {
  if (createdInvitationIds.length > 0) {
    await db.familyInvitation.deleteMany({ where: { id: { in: createdInvitationIds } } });
    createdInvitationIds.length = 0;
  }
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
  return `h5-activation-it-${prefix}-${randomUUID()}@futuretutor.test`;
}

async function createParentUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("parent"), role: "PARENT" } });
  createdUserIds.push(user.id);
  const parentProfile = await db.parentProfile.create({ data: { userId: user.id, firstName: "Test", lastName: "Parent" } });
  return { user, parentProfile };
}

async function createBareStudentUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("student"), role: "STUDENT" } });
  createdUserIds.push(user.id);
  return { user };
}

async function createGuardianManagedChild(parentProfileId: string) {
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

async function directInvitation(params: {
  targetStudentProfileId: string;
  invitedEmailNormalized: string;
  status: "PENDING" | "CLAIMED_PENDING_APPROVAL" | "ACCEPTED" | "EXPIRED" | "REVOKED";
  expiresAt: Date;
  claimedByUserId?: string | null;
  claimedAt?: Date | null;
}) {
  const tokenHash = hashInvitationToken(randomUUID());
  const invitation = await db.familyInvitation.create({
    data: {
      type: "STUDENT_LOGIN",
      targetStudentProfileId: params.targetStudentProfileId,
      invitedEmailNormalized: params.invitedEmailNormalized,
      tokenHash,
      status: params.status,
      expiresAt: params.expiresAt,
      claimedByUserId: params.claimedByUserId ?? null,
      claimedAt: params.claimedAt ?? null,
    },
  });
  createdInvitationIds.push(invitation.id);
  return invitation;
}

const HOUR = 1000 * 60 * 60;

describe("resolveStudentAccountActivationState", () => {
  it("1. a linked StudentProfile resolves to ACTIVE", async () => {
    const { user: guardian, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: studentUser } = await createBareStudentUser();
    await db.studentProfile.update({ where: { id: studentProfile.id }, data: { userId: studentUser.id } });

    const result = await resolveStudentAccountActivationState(db, studentUser.id);

    expect(result.state).toBe("ACTIVE");
    expect(result.state === "ACTIVE" && result.studentProfileId).toBe(studentProfile.id);
    void guardian;
  });

  it("2. a live, non-expired CLAIMED_PENDING_APPROVAL claim resolves to PENDING_GUARDIAN_APPROVAL", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: studentUser } = await createBareStudentUser();
    const invitation = await directInvitation({
      targetStudentProfileId: studentProfile.id,
      invitedEmailNormalized: studentUser.email!.toLowerCase(),
      status: "CLAIMED_PENDING_APPROVAL",
      expiresAt: new Date(Date.now() + HOUR),
      claimedByUserId: studentUser.id,
      claimedAt: new Date(),
    });

    const result = await resolveStudentAccountActivationState(db, studentUser.id);

    expect(result.state).toBe("PENDING_GUARDIAN_APPROVAL");
    expect(result.state === "PENDING_GUARDIAN_APPROVAL" && result.invitationId).toBe(invitation.id);
  });

  it("3. a REVOKED claim resolves to REJECTED_OR_REVOKED", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: studentUser } = await createBareStudentUser();
    const invitation = await directInvitation({
      targetStudentProfileId: studentProfile.id,
      invitedEmailNormalized: studentUser.email!.toLowerCase(),
      status: "REVOKED",
      expiresAt: new Date(Date.now() + HOUR),
      claimedByUserId: studentUser.id,
      claimedAt: new Date(),
    });

    const result = await resolveStudentAccountActivationState(db, studentUser.id);

    expect(result.state).toBe("REJECTED_OR_REVOKED");
    expect(result.state === "REJECTED_OR_REVOKED" && result.invitationId).toBe(invitation.id);
  });

  it("4. a claimed invitation whose expiresAt has passed resolves to EXPIRED", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: studentUser } = await createBareStudentUser();
    const invitation = await directInvitation({
      targetStudentProfileId: studentProfile.id,
      invitedEmailNormalized: studentUser.email!.toLowerCase(),
      status: "CLAIMED_PENDING_APPROVAL",
      expiresAt: new Date(Date.now() - HOUR),
      claimedByUserId: studentUser.id,
      claimedAt: new Date(Date.now() - 2 * HOUR),
    });

    const result = await resolveStudentAccountActivationState(db, studentUser.id);

    expect(result.state).toBe("EXPIRED");
    expect(result.state === "EXPIRED" && result.invitationId).toBe(invitation.id);
  });

  it("5. no profile and no claim of any kind resolves to UNLINKED", async () => {
    const { user: studentUser } = await createBareStudentUser();

    const result = await resolveStudentAccountActivationState(db, studentUser.id);

    expect(result.state).toBe("UNLINKED");
  });

  it("6. an old REVOKED claim never shadows a newer live PENDING claim — PENDING wins", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: studentUser } = await createBareStudentUser();
    await directInvitation({
      targetStudentProfileId: studentProfile.id,
      invitedEmailNormalized: studentUser.email!.toLowerCase(),
      status: "REVOKED",
      expiresAt: new Date(Date.now() + HOUR),
      claimedByUserId: studentUser.id,
      claimedAt: new Date(Date.now() - 2 * HOUR),
    });
    const livePending = await directInvitation({
      targetStudentProfileId: studentProfile.id,
      invitedEmailNormalized: studentUser.email!.toLowerCase(),
      status: "CLAIMED_PENDING_APPROVAL",
      expiresAt: new Date(Date.now() + HOUR),
      claimedByUserId: studentUser.id,
      claimedAt: new Date(),
    });

    const result = await resolveStudentAccountActivationState(db, studentUser.id);

    expect(result.state).toBe("PENDING_GUARDIAN_APPROVAL");
    expect(result.state === "PENDING_GUARDIAN_APPROVAL" && result.invitationId).toBe(livePending.id);
  });

  it("7. a linked ACTIVE StudentProfile always wins, even with a REVOKED historical claim present", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: studentUser } = await createBareStudentUser();
    await directInvitation({
      targetStudentProfileId: studentProfile.id,
      invitedEmailNormalized: studentUser.email!.toLowerCase(),
      status: "REVOKED",
      expiresAt: new Date(Date.now() + HOUR),
      claimedByUserId: studentUser.id,
      claimedAt: new Date(),
    });
    await db.studentProfile.update({ where: { id: studentProfile.id }, data: { userId: studentUser.id } });

    const result = await resolveStudentAccountActivationState(db, studentUser.id);

    expect(result.state).toBe("ACTIVE");
    expect(result.state === "ACTIVE" && result.studentProfileId).toBe(studentProfile.id);
  });

  it("8. User A's live claim is never visible when resolving User B's state (no cross-user leakage)", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: studentA } = await createBareStudentUser();
    const { user: studentB } = await createBareStudentUser();
    await directInvitation({
      targetStudentProfileId: studentProfile.id,
      invitedEmailNormalized: studentA.email!.toLowerCase(),
      status: "CLAIMED_PENDING_APPROVAL",
      expiresAt: new Date(Date.now() + HOUR),
      claimedByUserId: studentA.id,
      claimedAt: new Date(),
    });

    const resultA = await resolveStudentAccountActivationState(db, studentA.id);
    const resultB = await resolveStudentAccountActivationState(db, studentB.id);

    expect(resultA.state).toBe("PENDING_GUARDIAN_APPROVAL");
    expect(resultB.state).toBe("UNLINKED");
  });

  it("9. H.2 authority is false for a PENDING_GUARDIAN_APPROVAL student against the target profile", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: studentUser } = await createBareStudentUser();
    await directInvitation({
      targetStudentProfileId: studentProfile.id,
      invitedEmailNormalized: studentUser.email!.toLowerCase(),
      status: "CLAIMED_PENDING_APPROVAL",
      expiresAt: new Date(Date.now() + HOUR),
      claimedByUserId: studentUser.id,
      claimedAt: new Date(),
    });

    const result = await resolveStudentAccountActivationState(db, studentUser.id);
    expect(result.state).toBe("PENDING_GUARDIAN_APPROVAL");

    expect(await canInitiatePaidBooking(db, studentUser.id, studentProfile.id)).toBe(false);
    expect(await canManageStudentAccount(db, studentUser.id, studentProfile.id)).toBe(false);
  });

  it("10. H.2 authority is false for a REJECTED_OR_REVOKED student against the target profile", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: studentUser } = await createBareStudentUser();
    await directInvitation({
      targetStudentProfileId: studentProfile.id,
      invitedEmailNormalized: studentUser.email!.toLowerCase(),
      status: "REVOKED",
      expiresAt: new Date(Date.now() + HOUR),
      claimedByUserId: studentUser.id,
      claimedAt: new Date(),
    });

    const result = await resolveStudentAccountActivationState(db, studentUser.id);
    expect(result.state).toBe("REJECTED_OR_REVOKED");

    expect(await canInitiatePaidBooking(db, studentUser.id, studentProfile.id)).toBe(false);
    expect(await canManageStudentAccount(db, studentUser.id, studentProfile.id)).toBe(false);
  });

  it("11. H.2 authority is false for an EXPIRED-claim student against the target profile", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: studentUser } = await createBareStudentUser();
    await directInvitation({
      targetStudentProfileId: studentProfile.id,
      invitedEmailNormalized: studentUser.email!.toLowerCase(),
      status: "CLAIMED_PENDING_APPROVAL",
      expiresAt: new Date(Date.now() - HOUR),
      claimedByUserId: studentUser.id,
      claimedAt: new Date(Date.now() - 2 * HOUR),
    });

    const result = await resolveStudentAccountActivationState(db, studentUser.id);
    expect(result.state).toBe("EXPIRED");

    expect(await canInitiatePaidBooking(db, studentUser.id, studentProfile.id)).toBe(false);
    expect(await canManageStudentAccount(db, studentUser.id, studentProfile.id)).toBe(false);
  });

  it("12. H.2 authority is false for an UNLINKED student against an unrelated GUARDIAN_MANAGED profile", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: studentUser } = await createBareStudentUser();

    const result = await resolveStudentAccountActivationState(db, studentUser.id);
    expect(result.state).toBe("UNLINKED");

    expect(await canInitiatePaidBooking(db, studentUser.id, studentProfile.id)).toBe(false);
    expect(await canManageStudentAccount(db, studentUser.id, studentProfile.id)).toBe(false);
  });
});
