import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";
import {
  listChildrenForGuardian,
  getFamilyManagementDetail,
  revokeGuardianRelationship,
  createStudentLoginInvitation,
  createGuardianManagedStudent,
  NotAuthorizedError,
  CannotRevokeOtherGuardianError,
} from "./familyManagement";
import {
  getStudentProfileForActor,
  updateStudentProfileForActor,
  ForbiddenFieldError,
  BetaOnlineOnlyModeError,
  type StudentProfileUpdateInput,
} from "./profileManagement";

// Phase H.6 — permanent DB-integration tests for the Family Dashboard,
// Profile Read, Profile Edit, and Sibling Isolation requirements (§45-§48
// of the H.6 prompt, numbered 1-38 continuously exactly as the prompt
// itself numbers them). Runs ONLY against the isolated DATABASE_URL_TEST
// database, verified via resolveVerifiedTestDatabase() in beforeAll.

let db: PrismaClient;
const createdUserIds: string[] = [];
const createdStudentProfileIds: string[] = [];
const createdRelationshipIds: string[] = [];
const createdAcademicLevelIds: string[] = [];

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
  if (createdAcademicLevelIds.length > 0) {
    await db.academicLevel.deleteMany({ where: { id: { in: createdAcademicLevelIds } } });
    createdAcademicLevelIds.length = 0;
  }
});

function uniqueEmail(prefix: string) {
  return `h6-it-${prefix}-${randomUUID()}@futuretutor.test`;
}

async function createParentUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("parent"), role: "PARENT" } });
  createdUserIds.push(user.id);
  const parentProfile = await db.parentProfile.create({ data: { userId: user.id, firstName: "Test", lastName: "Parent" } });
  return { user, parentProfile };
}

async function createTutorUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("tutor"), role: "TUTOR" } });
  createdUserIds.push(user.id);
  return { user };
}

async function createBareStudentUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("student"), role: "STUDENT" } });
  createdUserIds.push(user.id);
  return { user };
}

async function createGuardianManagedChild(parentProfileId: string, overrides: Partial<{ firstName: string; city: string | null }> = {}) {
  const studentProfile = await db.studentProfile.create({
    data: {
      firstName: overrides.firstName ?? "Kid",
      lastName: "Test",
      dateOfBirth: new Date("2015-01-01T00:00:00.000Z"),
      managementMode: "GUARDIAN_MANAGED",
      city: overrides.city ?? null,
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

/** Links a bare STUDENT user to a GUARDIAN_MANAGED child, simulating the
 * end state of a completed H.5 STUDENT_LOGIN approval, without needing to
 * run the full invitation lifecycle for tests that only care about the
 * post-link state. */
async function linkStudentUser(studentProfileId: string, userId: string) {
  return db.studentProfile.update({ where: { id: studentProfileId }, data: { userId } });
}

async function createSelfManagedStudent() {
  const user = await db.user.create({ data: { email: uniqueEmail("self"), role: "STUDENT" } });
  createdUserIds.push(user.id);
  const studentProfile = await db.studentProfile.create({
    data: { userId: user.id, firstName: "Adult", lastName: "Student", managementMode: "SELF_MANAGED" },
  });
  createdStudentProfileIds.push(studentProfile.id);
  return { user, studentProfile };
}

async function createAcademicLevel() {
  const level = await db.academicLevel.create({ data: { slug: `h6-it-level-${randomUUID()}` } });
  createdAcademicLevelIds.push(level.id);
  return level;
}

// ---------------------------------------------------------------------------
// §45 — Family Dashboard (tests 1-10)
// ---------------------------------------------------------------------------

describe("Family Dashboard", () => {
  it("1. Parent with zero children sees zero linked children", async () => {
    const { user } = await createParentUser();
    const children = await listChildrenForGuardian(db, user.id);
    expect(children).toEqual([]);
  });

  it("2. Parent with one ACTIVE child relationship sees that child", async () => {
    const { user, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const children = await listChildrenForGuardian(db, user.id);
    expect(children).toHaveLength(1);
    expect(children[0].studentProfile.id).toBe(studentProfile.id);
  });

  it("3. Parent with multiple ACTIVE relationships sees all own linked children", async () => {
    const { user, parentProfile } = await createParentUser();
    await createGuardianManagedChild(parentProfile.id, { firstName: "ChildA" });
    await createGuardianManagedChild(parentProfile.id, { firstName: "ChildB" });
    const children = await listChildrenForGuardian(db, user.id);
    expect(children).toHaveLength(2);
  });

  it("4. Child IDs are distinct and correctly mapped", async () => {
    const { user, parentProfile } = await createParentUser();
    const { studentProfile: childA } = await createGuardianManagedChild(parentProfile.id, { firstName: "ChildA" });
    const { studentProfile: childB } = await createGuardianManagedChild(parentProfile.id, { firstName: "ChildB" });
    const children = await listChildrenForGuardian(db, user.id);
    const ids = children.map((c) => c.studentProfile.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toEqual(expect.arrayContaining([childA.id, childB.id]));
  });

  it("5. REVOKED relationship child is not exposed as currently manageable", async () => {
    const { user, parentProfile } = await createParentUser();
    const { relationship } = await createGuardianManagedChild(parentProfile.id);
    await db.parentStudentRelationship.update({ where: { id: relationship.id }, data: { status: "REVOKED" } });
    const children = await listChildrenForGuardian(db, user.id);
    expect(children).toEqual([]);
  });

  it("6. Parent A does not see Parent B's child", async () => {
    const { user: parentA, parentProfile: profileA } = await createParentUser();
    const { parentProfile: profileB } = await createParentUser();
    await createGuardianManagedChild(profileA.id, { firstName: "ChildA" });
    const { studentProfile: childB } = await createGuardianManagedChild(profileB.id, { firstName: "ChildB" });

    const children = await listChildrenForGuardian(db, parentA.id);
    expect(children.map((c) => c.studentProfile.id)).not.toContain(childB.id);
  });

  it("7. Parent A cannot fetch Parent B child detail directly", async () => {
    const { user: parentA } = await createParentUser();
    const { parentProfile: profileB } = await createParentUser();
    const { studentProfile: childB } = await createGuardianManagedChild(profileB.id);

    await expect(getFamilyManagementDetail(db, parentA.id, childB.id)).rejects.toThrow(NotAuthorizedError);
  });

  it("8. Parent A cannot infer another child's guardian data from the denial itself", async () => {
    const { user: parentA } = await createParentUser();
    const { parentProfile: profileB } = await createParentUser();
    const { studentProfile: childB } = await createGuardianManagedChild(profileB.id);

    try {
      await getFamilyManagementDetail(db, parentA.id, childB.id);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(NotAuthorizedError);
      // A bare NotAuthorizedError carries no message/metadata about the
      // target child, guardian names, or existence — nothing to leak.
      expect((error as Error).message).toBe("");
    }
  });

  it("9. Parent with two children can fetch Child A and Child B independently", async () => {
    const { user, parentProfile } = await createParentUser();
    const { studentProfile: childA } = await createGuardianManagedChild(parentProfile.id, { firstName: "ChildA" });
    const { studentProfile: childB } = await createGuardianManagedChild(parentProfile.id, { firstName: "ChildB" });

    const detailA = await getFamilyManagementDetail(db, user.id, childA.id);
    const detailB = await getFamilyManagementDetail(db, user.id, childB.id);
    expect(detailA.studentProfile.id).toBe(childA.id);
    expect(detailB.studentProfile.id).toBe(childB.id);
    expect(detailA.studentProfile.firstName).toBe("ChildA");
    expect(detailB.studentProfile.firstName).toBe("ChildB");
  });

  it("10. Child A state never contaminates Child B state after an update to Child A", async () => {
    const { user, parentProfile } = await createParentUser();
    const { studentProfile: childA } = await createGuardianManagedChild(parentProfile.id, { firstName: "ChildA" });
    const { studentProfile: childB } = await createGuardianManagedChild(parentProfile.id, { firstName: "ChildB" });

    await updateStudentProfileForActor(db, user.id, childA.id, { firstName: "ChildA-Renamed" });

    const refetchedB = await db.studentProfile.findUniqueOrThrow({ where: { id: childB.id } });
    expect(refetchedB.firstName).toBe("ChildB");
  });
});

// ---------------------------------------------------------------------------
// §46 — Profile Read (tests 11-18)
// ---------------------------------------------------------------------------

describe("Profile Read", () => {
  it("11. SELF_MANAGED Student reads own profile", async () => {
    const { user, studentProfile } = await createSelfManagedStudent();
    const view = await getStudentProfileForActor(db, user.id, studentProfile.id);
    expect(view).not.toBeNull();
    expect(view!.capabilities.canManageStudentAccount).toBe(true);
  });

  it("12. SELF_MANAGED Student cannot read unrelated Student profile", async () => {
    const { user: studentA } = await createSelfManagedStudent();
    const { studentProfile: profileB } = await createSelfManagedStudent();
    const view = await getStudentProfileForActor(db, studentA.id, profileB.id);
    expect(view).toBeNull();
  });

  it("13. GUARDIAN_MANAGED linked Student reads own profile", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: studentUser } = await createBareStudentUser();
    await linkStudentUser(studentProfile.id, studentUser.id);

    const view = await getStudentProfileForActor(db, studentUser.id, studentProfile.id);
    expect(view).not.toBeNull();
    expect(view!.capabilities.isLinkedStudentSelf).toBe(true);
    expect(view!.capabilities.canManageStudentAccount).toBe(false);
    expect(view!.editableFields).toEqual(["preferredLanguage"]);
  });

  it("14. GUARDIAN_MANAGED linked Student cannot read sibling profile", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile: childA } = await createGuardianManagedChild(parentProfile.id, { firstName: "ChildA" });
    const { studentProfile: childB } = await createGuardianManagedChild(parentProfile.id, { firstName: "ChildB" });
    const { user: studentUserA } = await createBareStudentUser();
    await linkStudentUser(childA.id, studentUserA.id);

    const view = await getStudentProfileForActor(db, studentUserA.id, childB.id);
    expect(view).toBeNull();
  });

  it("15. ACTIVE guardian reads linked child", async () => {
    const { user, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const view = await getStudentProfileForActor(db, user.id, studentProfile.id);
    expect(view).not.toBeNull();
    expect(view!.capabilities.canManageStudentAccount).toBe(true);
  });

  it("16. REVOKED guardian cannot read child through family-management surface", async () => {
    const { user, parentProfile } = await createParentUser();
    const { studentProfile, relationship } = await createGuardianManagedChild(parentProfile.id);
    await db.parentStudentRelationship.update({ where: { id: relationship.id }, data: { status: "REVOKED" } });

    const view = await getStudentProfileForActor(db, user.id, studentProfile.id);
    expect(view).toBeNull();
    await expect(getFamilyManagementDetail(db, user.id, studentProfile.id)).rejects.toThrow(NotAuthorizedError);
  });

  it("17. unrelated Parent cannot read child", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: unrelatedParent } = await createParentUser();

    const view = await getStudentProfileForActor(db, unrelatedParent.id, studentProfile.id);
    expect(view).toBeNull();
  });

  it("18. Tutor cannot use the H.6 family/profile-management read path", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: tutorUser } = await createTutorUser();

    const view = await getStudentProfileForActor(db, tutorUser.id, studentProfile.id);
    expect(view).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §47 — Profile Edit (tests 19-31)
// ---------------------------------------------------------------------------

describe("Profile Edit", () => {
  it("19. SELF_MANAGED Student can update an allowed own profile field", async () => {
    const { user, studentProfile } = await createSelfManagedStudent();
    const updated = await updateStudentProfileForActor(db, user.id, studentProfile.id, { city: "Montreal" });
    expect(updated.city).toBe("Montreal");
  });

  it("20. SELF_MANAGED Student cannot patch a system-controlled field (managementMode)", async () => {
    const { user, studentProfile } = await createSelfManagedStudent();
    const forged = { managementMode: "GUARDIAN_MANAGED" } as unknown as StudentProfileUpdateInput;
    await expect(updateStudentProfileForActor(db, user.id, studentProfile.id, forged)).rejects.toThrow(ForbiddenFieldError);
  });

  it("21. ACTIVE guardian can update an allowed child profile field", async () => {
    const { user, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const updated = await updateStudentProfileForActor(db, user.id, studentProfile.id, { firstName: "Renamed" });
    expect(updated.firstName).toBe("Renamed");
  });

  it("22. unrelated Parent cannot update child", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: unrelatedParent } = await createParentUser();

    await expect(
      updateStudentProfileForActor(db, unrelatedParent.id, studentProfile.id, { firstName: "Hacked" })
    ).rejects.toThrow(NotAuthorizedError);
  });

  it("23. REVOKED guardian cannot update child", async () => {
    const { user, parentProfile } = await createParentUser();
    const { studentProfile, relationship } = await createGuardianManagedChild(parentProfile.id);
    await db.parentStudentRelationship.update({ where: { id: relationship.id }, data: { status: "REVOKED" } });

    await expect(updateStudentProfileForActor(db, user.id, studentProfile.id, { firstName: "X" })).rejects.toThrow(
      NotAuthorizedError
    );
  });

  it("24. GUARDIAN_MANAGED Student can update the actual low-stakes field (preferredLanguage)", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: studentUser } = await createBareStudentUser();
    await linkStudentUser(studentProfile.id, studentUser.id);

    const updated = await updateStudentProfileForActor(db, studentUser.id, studentProfile.id, { preferredLanguage: "fr" });
    expect(updated.preferredLanguage).toBe("fr");
  });

  it("25. GUARDIAN_MANAGED Student cannot update dateOfBirth", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: studentUser } = await createBareStudentUser();
    await linkStudentUser(studentProfile.id, studentUser.id);

    const forged = { dateOfBirth: new Date("2010-01-01") } as unknown as StudentProfileUpdateInput;
    await expect(updateStudentProfileForActor(db, studentUser.id, studentProfile.id, forged)).rejects.toThrow(
      ForbiddenFieldError
    );
  });

  it("26. GUARDIAN_MANAGED Student cannot update managementMode", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: studentUser } = await createBareStudentUser();
    await linkStudentUser(studentProfile.id, studentUser.id);

    const forged = { managementMode: "SELF_MANAGED" } as unknown as StudentProfileUpdateInput;
    await expect(updateStudentProfileForActor(db, studentUser.id, studentProfile.id, forged)).rejects.toThrow(
      ForbiddenFieldError
    );
  });

  it("27. GUARDIAN_MANAGED Student cannot update userId", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: studentUser } = await createBareStudentUser();
    await linkStudentUser(studentProfile.id, studentUser.id);

    const forged = { userId: "some-other-user-id" } as unknown as StudentProfileUpdateInput;
    await expect(updateStudentProfileForActor(db, studentUser.id, studentProfile.id, forged)).rejects.toThrow(
      ForbiddenFieldError
    );
  });

  it("28. GUARDIAN_MANAGED Student cannot update guardian/relationship-shaped state", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: studentUser } = await createBareStudentUser();
    await linkStudentUser(studentProfile.id, studentUser.id);

    const forged = { relationshipId: "forged-id" } as unknown as StudentProfileUpdateInput;
    await expect(updateStudentProfileForActor(db, studentUser.id, studentProfile.id, forged)).rejects.toThrow(
      ForbiddenFieldError
    );
  });

  it("29. GUARDIAN_MANAGED Student cannot update academic/matching/pricing-affecting fields", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: studentUser } = await createBareStudentUser();
    await linkStudentUser(studentProfile.id, studentUser.id);
    const level = await createAcademicLevel();

    await expect(
      updateStudentProfileForActor(db, studentUser.id, studentProfile.id, { academicLevelId: level.id })
    ).rejects.toThrow(ForbiddenFieldError);
    await expect(
      updateStudentProfileForActor(db, studentUser.id, studentProfile.id, { tutoringMode: "ONLINE" })
    ).rejects.toThrow(ForbiddenFieldError);
  });

  it("30. a direct call bypassing the UI's rendered fields (forbidden field for this actor) fails server-side regardless of what any form would have shown", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: studentUser } = await createBareStudentUser();
    await linkStudentUser(studentProfile.id, studentUser.id);

    // No UI for this restricted Student ever renders a "city" input, but
    // the service is what actually enforces that — not the absence of a
    // rendered field.
    await expect(updateStudentProfileForActor(db, studentUser.id, studentProfile.id, { city: "Toronto" })).rejects.toThrow(
      ForbiddenFieldError
    );
  });

  it("31. a mass-assignment payload mixing a valid and a forbidden field is rejected atomically — the valid field is not silently applied", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id, { city: "OriginalCity" });
    const { user: studentUser } = await createBareStudentUser();
    await linkStudentUser(studentProfile.id, studentUser.id);

    const mixed = { preferredLanguage: "fr", city: "ShouldNotApply" } as unknown as StudentProfileUpdateInput;
    await expect(updateStudentProfileForActor(db, studentUser.id, studentProfile.id, mixed)).rejects.toThrow(
      ForbiddenFieldError
    );

    const refetched = await db.studentProfile.findUniqueOrThrow({ where: { id: studentProfile.id } });
    expect(refetched.city).toBe("OriginalCity");
    expect(refetched.preferredLanguage).toBe("en");
  });
});

// ---------------------------------------------------------------------------
// BETA-HARDEN1 — Closed Beta online-only enforcement in
// updateStudentProfileForActor (src/lib/closedBetaConfig.ts's
// closedBetaOnlineOnlyActive()). CLOSED_BETA_MODE is set/restored around
// each test so these assertions don't depend on ambient environment state.
// ---------------------------------------------------------------------------

describe("BETA-HARDEN1 — online-only tutoringMode gate", () => {
  const ORIGINAL_MODE = process.env.CLOSED_BETA_MODE;
  afterEach(() => {
    if (ORIGINAL_MODE === undefined) delete process.env.CLOSED_BETA_MODE;
    else process.env.CLOSED_BETA_MODE = ORIGINAL_MODE;
  });

  it("32. gate active: a self-managed Student cannot change tutoringMode to IN_PERSON", async () => {
    process.env.CLOSED_BETA_MODE = "active";
    const { user, studentProfile } = await createSelfManagedStudent();
    await expect(
      updateStudentProfileForActor(db, user.id, studentProfile.id, { tutoringMode: "IN_PERSON" })
    ).rejects.toThrow(BetaOnlineOnlyModeError);
  });

  it("33. gate active: an ACTIVE guardian cannot change a child's tutoringMode to BOTH", async () => {
    process.env.CLOSED_BETA_MODE = "active";
    const { user, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    await expect(
      updateStudentProfileForActor(db, user.id, studentProfile.id, { tutoringMode: "BOTH" })
    ).rejects.toThrow(BetaOnlineOnlyModeError);
  });

  it("34. gate active: changing tutoringMode to ONLINE always succeeds", async () => {
    process.env.CLOSED_BETA_MODE = "active";
    const { user, studentProfile } = await createSelfManagedStudent();
    const updated = await updateStudentProfileForActor(db, user.id, studentProfile.id, { tutoringMode: "ONLINE" });
    expect(updated.tutoringMode).toBe("ONLINE");
  });

  it("35. gate active: resubmitting a historical profile's existing non-ONLINE value unchanged is a harmless no-op, not rejected — and does not block a concurrent edit to a different field", async () => {
    process.env.CLOSED_BETA_MODE = "active";
    const { user, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    // Simulate a profile created before this gate existed.
    await db.studentProfile.update({ where: { id: studentProfile.id }, data: { tutoringMode: "BOTH" } });

    const updated = await updateStudentProfileForActor(db, user.id, studentProfile.id, {
      tutoringMode: "BOTH",
      city: "Ottawa",
    });
    expect(updated.tutoringMode).toBe("BOTH");
    expect(updated.city).toBe("Ottawa");
  });

  it("36. gate active: a historical non-ONLINE profile still cannot be changed to a DIFFERENT non-ONLINE value", async () => {
    process.env.CLOSED_BETA_MODE = "active";
    const { user, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    await db.studentProfile.update({ where: { id: studentProfile.id }, data: { tutoringMode: "BOTH" } });

    await expect(
      updateStudentProfileForActor(db, user.id, studentProfile.id, { tutoringMode: "IN_PERSON" })
    ).rejects.toThrow(BetaOnlineOnlyModeError);
  });

  it("37. gate inactive (CLOSED_BETA_MODE=inactive): IN_PERSON/BOTH are accepted exactly as before this mission", async () => {
    process.env.CLOSED_BETA_MODE = "inactive";
    const { user, studentProfile } = await createSelfManagedStudent();
    const updated = await updateStudentProfileForActor(db, user.id, studentProfile.id, { tutoringMode: "IN_PERSON" });
    expect(updated.tutoringMode).toBe("IN_PERSON");
  });

  it("38. createGuardianManagedStudent (the real service function, not this file's raw-Prisma test fixture) defaults new children to ONLINE while the gate is active, not the schema's own BOTH default", async () => {
    process.env.CLOSED_BETA_MODE = "active";
    const { user, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedStudent(db, user.id, {
      firstName: "Gate",
      lastName: "Default",
      dateOfBirth: new Date("2015-01-01T00:00:00.000Z"),
    });
    createdStudentProfileIds.push(studentProfile.id);
    const relationship = await db.parentStudentRelationship.findFirstOrThrow({
      where: { studentProfileId: studentProfile.id, parentProfileId: parentProfile.id },
    });
    createdRelationshipIds.push(relationship.id);

    expect(studentProfile.tutoringMode).toBe("ONLINE");
  });

  it("39. createGuardianManagedStudent defaults new children to BOTH when the gate is explicitly inactive — unchanged pre-mission behavior", async () => {
    process.env.CLOSED_BETA_MODE = "inactive";
    const { user, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedStudent(db, user.id, {
      firstName: "Gate",
      lastName: "Inactive",
      dateOfBirth: new Date("2015-01-01T00:00:00.000Z"),
    });
    createdStudentProfileIds.push(studentProfile.id);
    const relationship = await db.parentStudentRelationship.findFirstOrThrow({
      where: { studentProfileId: studentProfile.id, parentProfileId: parentProfile.id },
    });
    createdRelationshipIds.push(relationship.id);

    expect(studentProfile.tutoringMode).toBe("BOTH");
  });
});

// ---------------------------------------------------------------------------
// §48 — Sibling Isolation (tests 32-38)
// ---------------------------------------------------------------------------

describe("Sibling Isolation", () => {
  async function createSiblingFixture() {
    const { user: parentUser, parentProfile } = await createParentUser();
    const { studentProfile: childA, relationship: relationshipA } = await createGuardianManagedChild(parentProfile.id, {
      firstName: "ChildA",
    });
    const { studentProfile: childB, relationship: relationshipB } = await createGuardianManagedChild(parentProfile.id, {
      firstName: "ChildB",
    });
    const { user: studentUserA } = await createBareStudentUser();
    await linkStudentUser(childA.id, studentUserA.id);
    return { parentUser, parentProfile, childA, childB, relationshipA, relationshipB, studentUserA };
  }

  it("32. Child A cannot read Child B", async () => {
    const { studentUserA, childB } = await createSiblingFixture();
    const view = await getStudentProfileForActor(db, studentUserA.id, childB.id);
    expect(view).toBeNull();
  });

  it("33. Child A cannot edit Child B", async () => {
    const { studentUserA, childB } = await createSiblingFixture();
    await expect(updateStudentProfileForActor(db, studentUserA.id, childB.id, { city: "Nope" })).rejects.toThrow(
      NotAuthorizedError
    );
  });

  it("34. Child A cannot see Child B's guardian list", async () => {
    const { studentUserA, childB } = await createSiblingFixture();
    await expect(getFamilyManagementDetail(db, studentUserA.id, childB.id)).rejects.toThrow(NotAuthorizedError);
  });

  it("35. Child A cannot see Child B's Student-login state", async () => {
    const { studentUserA, childB } = await createSiblingFixture();
    // getFamilyManagementDetail is the only surface that exposes
    // studentLoginStatus for a child — denying it denies the login state too.
    await expect(getFamilyManagementDetail(db, studentUserA.id, childB.id)).rejects.toThrow(NotAuthorizedError);
  });

  it("36. Child A cannot invoke H.4 guardian actions for Child B", async () => {
    const { studentUserA, relationshipB } = await createSiblingFixture();
    // revokeGuardianRelationship's ownership check (§Final Guardian
    // Revocation Policy Correction, H.4) runs BEFORE the general H.2
    // authority check — studentUserA is not relationshipB's own
    // parentProfile.userId (it isn't a parent at all), so this is denied
    // as CannotRevokeOtherGuardianError, not the more generic
    // NotAuthorizedError. Either way, the action is blocked — this test
    // asserts the actual (correct) denial reason, not a generic one.
    await expect(revokeGuardianRelationship(db, studentUserA.id, relationshipB.id)).rejects.toThrow(
      CannotRevokeOtherGuardianError
    );
  });

  it("37. Child A cannot invoke H.5 Student-login actions for Child B", async () => {
    const { studentUserA, childB } = await createSiblingFixture();
    await expect(
      createStudentLoginInvitation(db, studentUserA.id, childB.id, uniqueEmail("target"))
    ).rejects.toThrow(NotAuthorizedError);
  });

  it("38. Child A cannot enumerate Child B through the Family Dashboard query", async () => {
    const { studentUserA, childB } = await createSiblingFixture();
    const children = await listChildrenForGuardian(db, studentUserA.id);
    expect(children).toEqual([]);
    expect(children.map((c) => c.studentProfile.id)).not.toContain(childB.id);
  });
});
