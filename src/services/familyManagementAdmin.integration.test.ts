import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";
import {
  listFamilyInvitationsRequiringAdminAttention,
  approveFamilyInvitation,
  hashInvitationToken,
  NotAuthorizedError,
} from "./familyManagement";

// Phase H.9 — permanent DB-integration tests for the Family-Accounts Admin
// visibility read model (listFamilyInvitationsRequiringAdminAttention).
// Runs ONLY against the isolated DATABASE_URL_TEST database, verified via
// resolveVerifiedTestDatabase() in beforeAll — fails closed before any
// connection opens if unset/unsafe. The normal development database is
// never touched by this file.
//
// Covers, per the H.9 implementation prompt's minimum test list:
//   - Admin (ADMIN and SUPER_ADMIN) access succeeds.
//   - Non-admin access is denied (PARENT, STUDENT, TUTOR).
//   - An active guardian's real per-student authority cannot substitute for
//     Admin authority on this global, cross-family read (the specific
//     "learner/guardian relationships cannot bypass authorization" case).
//   - CLAIMED_PENDING_APPROVAL records are surfaced, with the correct
//     fields (student, inviter, claimant, dates, type).
//   - PENDING/ACCEPTED/EXPIRED/REVOKED records are excluded (intended
//     filtering).
//   - The pastDue flag reuses the same expiry gate the real mutations
//     enforce (isInvitationExpired), never a fabricated status.
//   - Privacy: no dateOfBirth or other unrelated field is ever present on a
//     returned row.
//   - The pre-existing guardian approve workflow is unaffected by this
//     addition (Family Accounts regression).

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
  return `h9-it-${prefix}-${randomUUID()}@futuretutor.test`;
}

async function createParentUser(email?: string) {
  const user = await db.user.create({ data: { email: email ?? uniqueEmail("parent"), role: "PARENT", name: "Test Guardian" } });
  createdUserIds.push(user.id);
  const parentProfile = await db.parentProfile.create({ data: { userId: user.id, firstName: "Test", lastName: "Guardian" } });
  return { user, parentProfile };
}

async function createAdminUser(role: "ADMIN" | "SUPER_ADMIN" = "SUPER_ADMIN") {
  const user = await db.user.create({ data: { email: uniqueEmail("admin"), role, name: "Test Admin" } });
  createdUserIds.push(user.id);
  return { user };
}

async function createStudentUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("student"), role: "STUDENT", name: "Test Student" } });
  createdUserIds.push(user.id);
  return { user };
}

async function createTutorUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("tutor"), role: "TUTOR" } });
  createdUserIds.push(user.id);
  return { user };
}

async function createGuardianManagedChild(parentProfileId: string, overrides?: { firstName?: string; lastName?: string }) {
  const studentProfile = await db.studentProfile.create({
    data: {
      firstName: overrides?.firstName ?? "Kid",
      lastName: overrides?.lastName ?? "Test",
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
  type: "GUARDIAN_LINK" | "STUDENT_LOGIN";
  targetStudentProfileId: string;
  invitedEmailNormalized: string;
  invitedByUserId?: string | null;
  status?: "PENDING" | "CLAIMED_PENDING_APPROVAL" | "ACCEPTED" | "EXPIRED" | "REVOKED";
  expiresAt?: Date;
  claimedByUserId?: string | null;
  claimedAt?: Date | null;
  approvedByUserId?: string | null;
  approvedAt?: Date | null;
}) {
  const rawToken = randomUUID();
  const tokenHash = hashInvitationToken(rawToken);
  const invitation = await db.familyInvitation.create({
    data: {
      type: params.type,
      targetStudentProfileId: params.targetStudentProfileId,
      invitedEmailNormalized: params.invitedEmailNormalized,
      invitedByUserId: params.invitedByUserId ?? null,
      tokenHash,
      status: params.status ?? "PENDING",
      expiresAt: params.expiresAt ?? new Date(Date.now() + 1000 * 60 * 60),
      claimedByUserId: params.claimedByUserId ?? null,
      claimedAt: params.claimedAt ?? null,
      approvedByUserId: params.approvedByUserId ?? null,
      approvedAt: params.approvedAt ?? null,
    },
  });
  return invitation;
}

describe("listFamilyInvitationsRequiringAdminAttention — Phase H.9 admin authorization", () => {
  it("SUPER_ADMIN access succeeds", async () => {
    const { user: admin } = await createAdminUser("SUPER_ADMIN");
    const rows = await listFamilyInvitationsRequiringAdminAttention(db, { id: admin.id, role: admin.role });
    expect(Array.isArray(rows)).toBe(true);
  });

  it("ADMIN access succeeds", async () => {
    const { user: admin } = await createAdminUser("ADMIN");
    const rows = await listFamilyInvitationsRequiringAdminAttention(db, { id: admin.id, role: admin.role });
    expect(Array.isArray(rows)).toBe(true);
  });

  it("PARENT access is denied, even a PARENT with real ACTIVE guardian authority over a student whose invitation is CLAIMED_PENDING_APPROVAL — a per-student authority relationship must never substitute for global Admin authority", async () => {
    const { user: guardian, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    await directInvitation({
      type: "GUARDIAN_LINK",
      targetStudentProfileId: studentProfile.id,
      invitedEmailNormalized: uniqueEmail("claimant"),
      invitedByUserId: guardian.id,
      status: "CLAIMED_PENDING_APPROVAL",
      claimedByUserId: guardian.id,
      claimedAt: new Date(),
    });

    await expect(
      listFamilyInvitationsRequiringAdminAttention(db, { id: guardian.id, role: guardian.role })
    ).rejects.toThrow(NotAuthorizedError);
  });

  it("STUDENT access is denied", async () => {
    const { user: student } = await createStudentUser();
    await expect(
      listFamilyInvitationsRequiringAdminAttention(db, { id: student.id, role: student.role })
    ).rejects.toThrow(NotAuthorizedError);
  });

  it("TUTOR access is denied", async () => {
    const { user: tutor } = await createTutorUser();
    await expect(
      listFamilyInvitationsRequiringAdminAttention(db, { id: tutor.id, role: tutor.role })
    ).rejects.toThrow(NotAuthorizedError);
  });
});

describe("listFamilyInvitationsRequiringAdminAttention — surfaced records (Phase H.9)", () => {
  it("surfaces a CLAIMED_PENDING_APPROVAL GUARDIAN_LINK invitation with the expected fields", async () => {
    const { user: admin } = await createAdminUser();
    const { user: inviter, parentProfile } = await createParentUser();
    const { user: claimant } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id, { firstName: "Ada", lastName: "Lovelace" });
    const claimedAt = new Date();
    const invitation = await directInvitation({
      type: "GUARDIAN_LINK",
      targetStudentProfileId: studentProfile.id,
      invitedEmailNormalized: claimant.email!,
      invitedByUserId: inviter.id,
      status: "CLAIMED_PENDING_APPROVAL",
      claimedByUserId: claimant.id,
      claimedAt,
    });

    const rows = await listFamilyInvitationsRequiringAdminAttention(db, { id: admin.id, role: admin.role });
    const row = rows.find((r) => r.id === invitation.id);

    expect(row).toBeDefined();
    expect(row!.type).toBe("GUARDIAN_LINK");
    expect(row!.status).toBe("CLAIMED_PENDING_APPROVAL");
    expect(row!.targetStudentProfileId).toBe(studentProfile.id);
    expect(row!.studentFirstName).toBe("Ada");
    expect(row!.studentLastName).toBe("Lovelace");
    expect(row!.invitedByUser?.email).toBe(inviter.email);
    expect(row!.claimedByUser?.email).toBe(claimant.email);
    expect(row!.claimedAt?.getTime()).toBe(claimedAt.getTime());
    expect(row!.pastDue).toBe(false);
  });

  it("surfaces a CLAIMED_PENDING_APPROVAL STUDENT_LOGIN invitation with type STUDENT_LOGIN", async () => {
    const { user: admin } = await createAdminUser();
    const { user: inviter, parentProfile } = await createParentUser();
    const { user: claimantStudent } = await createStudentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const invitation = await directInvitation({
      type: "STUDENT_LOGIN",
      targetStudentProfileId: studentProfile.id,
      invitedEmailNormalized: claimantStudent.email!,
      invitedByUserId: inviter.id,
      status: "CLAIMED_PENDING_APPROVAL",
      claimedByUserId: claimantStudent.id,
      claimedAt: new Date(),
    });

    const rows = await listFamilyInvitationsRequiringAdminAttention(db, { id: admin.id, role: admin.role });
    const row = rows.find((r) => r.id === invitation.id);

    expect(row).toBeDefined();
    expect(row!.type).toBe("STUDENT_LOGIN");
  });

  it("excludes PENDING, ACCEPTED, EXPIRED, and REVOKED invitations for the same student (intended filtering)", async () => {
    const { user: admin } = await createAdminUser();
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);

    const pending = await directInvitation({
      type: "GUARDIAN_LINK",
      targetStudentProfileId: studentProfile.id,
      invitedEmailNormalized: uniqueEmail("pending"),
      status: "PENDING",
    });
    const accepted = await directInvitation({
      type: "GUARDIAN_LINK",
      targetStudentProfileId: studentProfile.id,
      invitedEmailNormalized: uniqueEmail("accepted"),
      status: "ACCEPTED",
      claimedByUserId: null,
      approvedAt: new Date(),
    });
    const expired = await directInvitation({
      type: "GUARDIAN_LINK",
      targetStudentProfileId: studentProfile.id,
      invitedEmailNormalized: uniqueEmail("expired"),
      status: "EXPIRED",
    });
    const revoked = await directInvitation({
      type: "GUARDIAN_LINK",
      targetStudentProfileId: studentProfile.id,
      invitedEmailNormalized: uniqueEmail("revoked"),
      status: "REVOKED",
    });

    const rows = await listFamilyInvitationsRequiringAdminAttention(db, { id: admin.id, role: admin.role });
    const surfacedIds = new Set(rows.map((r) => r.id));

    expect(surfacedIds.has(pending.id)).toBe(false);
    expect(surfacedIds.has(accepted.id)).toBe(false);
    expect(surfacedIds.has(expired.id)).toBe(false);
    expect(surfacedIds.has(revoked.id)).toBe(false);
  });

  it("flags pastDue: true for a CLAIMED_PENDING_APPROVAL invitation whose expiresAt has already passed (reuses the same gate the real mutation enforces, not a fabricated status)", async () => {
    const { user: admin } = await createAdminUser();
    const { user: claimant, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const invitation = await directInvitation({
      type: "GUARDIAN_LINK",
      targetStudentProfileId: studentProfile.id,
      invitedEmailNormalized: claimant.email!,
      status: "CLAIMED_PENDING_APPROVAL",
      claimedByUserId: claimant.id,
      claimedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10),
      expiresAt: new Date(Date.now() - 1000 * 60 * 60), // 1 hour in the past
    });

    const rows = await listFamilyInvitationsRequiringAdminAttention(db, { id: admin.id, role: admin.role });
    const row = rows.find((r) => r.id === invitation.id);

    expect(row).toBeDefined();
    expect(row!.pastDue).toBe(true);
  });

  it("flags pastDue: false for a CLAIMED_PENDING_APPROVAL invitation still within its expiry window", async () => {
    const { user: admin } = await createAdminUser();
    const { user: claimant, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const invitation = await directInvitation({
      type: "GUARDIAN_LINK",
      targetStudentProfileId: studentProfile.id,
      invitedEmailNormalized: claimant.email!,
      status: "CLAIMED_PENDING_APPROVAL",
      claimedByUserId: claimant.id,
      claimedAt: new Date(),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    });

    const rows = await listFamilyInvitationsRequiringAdminAttention(db, { id: admin.id, role: admin.role });
    const row = rows.find((r) => r.id === invitation.id);

    expect(row).toBeDefined();
    expect(row!.pastDue).toBe(false);
  });

  it("empty state: a PENDING-only invitation never contributes to the result set (baseline-delta, not an assumption of a globally pristine shared test DB)", async () => {
    // Compares a before/after count delta rather than asserting the global
    // result is literally [] — the isolated test database is shared across
    // every integration test *file*, so asserting absolute emptiness here
    // would be fragile against unrelated tests/fixtures; scoping to a delta
    // matches this codebase's own established convention (every other
    // integration test file scopes its assertions to ids it created, never
    // to the table's total global state).
    const { user: admin } = await createAdminUser();
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);

    const before = await listFamilyInvitationsRequiringAdminAttention(db, { id: admin.id, role: admin.role });

    await directInvitation({
      type: "GUARDIAN_LINK",
      targetStudentProfileId: studentProfile.id,
      invitedEmailNormalized: uniqueEmail("only-pending"),
      status: "PENDING",
    });

    const after = await listFamilyInvitationsRequiringAdminAttention(db, { id: admin.id, role: admin.role });
    expect(after.length).toBe(before.length);
  });
});

describe("listFamilyInvitationsRequiringAdminAttention — privacy boundary (Phase H.9 §8)", () => {
  it("a returned row never exposes dateOfBirth or any field beyond the documented minimal shape", async () => {
    const { user: admin } = await createAdminUser();
    const { user: claimant, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    await directInvitation({
      type: "GUARDIAN_LINK",
      targetStudentProfileId: studentProfile.id,
      invitedEmailNormalized: claimant.email!,
      status: "CLAIMED_PENDING_APPROVAL",
      claimedByUserId: claimant.id,
      claimedAt: new Date(),
    });

    const rows = await listFamilyInvitationsRequiringAdminAttention(db, { id: admin.id, role: admin.role });
    expect(rows.length).toBeGreaterThan(0);

    const allowedKeys = new Set([
      "id",
      "type",
      "status",
      "targetStudentProfileId",
      "studentFirstName",
      "studentLastName",
      "invitedEmailNormalized",
      "invitedByUser",
      "claimedByUser",
      "createdAt",
      "claimedAt",
      "expiresAt",
      "pastDue",
    ]);
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        expect(allowedKeys.has(key)).toBe(true);
      }
      expect(row).not.toHaveProperty("dateOfBirth");
      if (row.invitedByUser) expect(Object.keys(row.invitedByUser).sort()).toEqual(["email", "name"]);
      if (row.claimedByUser) expect(Object.keys(row.claimedByUser).sort()).toEqual(["email", "name"]);
    }
  });
});

describe("Family Accounts regression — the pre-existing guardian approval workflow is unaffected by Phase H.9's read-only addition", () => {
  it("an active guardian can still approve a CLAIMED_PENDING_APPROVAL GUARDIAN_LINK invitation exactly as before", async () => {
    const { user: inviter, parentProfile: inviterProfile } = await createParentUser();
    const { user: claimant, parentProfile: claimantProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(inviterProfile.id);

    const invitation = await directInvitation({
      type: "GUARDIAN_LINK",
      targetStudentProfileId: studentProfile.id,
      invitedEmailNormalized: claimant.email!,
      invitedByUserId: inviter.id,
      status: "CLAIMED_PENDING_APPROVAL",
      claimedByUserId: claimant.id,
      claimedAt: new Date(),
    });

    const result = await approveFamilyInvitation(db, inviter.id, invitation.id);
    expect(result.invitation.status).toBe("ACCEPTED");

    const relationship = await db.parentStudentRelationship.findUnique({
      where: {
        parentProfileId_studentProfileId: { parentProfileId: claimantProfile.id, studentProfileId: studentProfile.id },
      },
    });
    expect(relationship?.status).toBe("ACTIVE");
    if (relationship) createdRelationshipIds.push(relationship.id);
  });
});
