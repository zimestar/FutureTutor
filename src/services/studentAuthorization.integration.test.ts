import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";
import {
  canActForStudent,
  canManageStudentAccount,
  canPayForStudent,
  hasActiveGuardianAuthority,
} from "./studentAuthorization";

// Phase H.2 — permanent DB-integration tests for the cross-family/IDOR and
// transaction-client cases that a pure-function unit test cannot
// meaningfully exercise (studentAuthorization.test.ts covers the full
// decision matrix with zero DB involvement; this file proves the actual
// Prisma query joins correctly scope to the right actor+student pair
// against real rows). Required test list items 17-20 and 22 (see the H.2
// implementation prompt §24).
//
// Runs ONLY against the isolated DATABASE_URL_TEST database, verified via
// resolveVerifiedTestDatabase() in beforeAll — this throws (fails closed)
// before any connection is even opened if DATABASE_URL_TEST is unset or
// unsafe. The normal development database is never touched by this file.

let db: PrismaClient;
const createdUserIds: string[] = [];
const createdStudentProfileIds: string[] = [];
const createdRelationshipIds: string[] = [];

beforeAll(() => {
  const target = resolveVerifiedTestDatabase(); // FAILS CLOSED here if unset/unsafe — see src/test-support/testDatabaseSafety.ts
  const adapter = new PrismaPg({ connectionString: target.connectionString });
  db = new PrismaClient({ adapter });
});

afterAll(async () => {
  await db?.$disconnect();
});

afterEach(async () => {
  // Explicit fixture cleanup, not a transaction-rollback wrapper — these
  // tests need committed, queryable rows across multiple independent
  // Prisma calls within one test (mirroring real call sites), which a
  // single outer rollback-only transaction cannot represent.
  //
  // Deletion ORDER matters and must respect H.1's own deliberate
  // historical-safety constraints, not route around them:
  //   1. ParentStudentRelationship rows first — H.1 changed this table's
  //      FKs to ParentProfile/StudentProfile from Cascade to Restrict
  //      specifically so guardian history can't be silently destroyed; a
  //      relationship row must be gone before its ParentProfile/
  //      StudentProfile can be removed.
  //   2. StudentProfile rows next, deleted explicitly by id — NOT left to
  //      cascade from deleting their owning User, because a SELF_MANAGED
  //      profile's userId->User relation is SetNull (also an H.1 design
  //      choice), and SetNull-ing a SELF_MANAGED profile's userId to NULL
  //      is exactly what the StudentProfile_selfManagedRequiresUser_check
  //      CHECK constraint correctly refuses. Deleting the StudentProfile
  //      row directly sidesteps that entirely (it's not a policy weakening
  //      — it's cleaning up in the order the schema's own invariants
  //      require).
  //   3. User rows last — ParentProfile/TutorProfile cascade cleanly by
  //      this point since nothing still references them.
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

async function createStudentUser(managementMode: "SELF_MANAGED" | "GUARDIAN_MANAGED") {
  const suffix = randomUUID();
  const user = await db.user.create({
    data: { email: `h2-it-student-${suffix}@futuretutor.test`, role: "STUDENT" },
  });
  createdUserIds.push(user.id);
  const studentProfile = await db.studentProfile.create({
    data: { userId: user.id, firstName: "Test", lastName: "Student", managementMode },
  });
  createdStudentProfileIds.push(studentProfile.id);
  return { user, studentProfile };
}

/** A bare STUDENT-role User with NO StudentProfile of its own — for tests
 * that need to link an existing (already-created) StudentProfile to a
 * fresh login, without also creating a second, unwanted profile. */
async function createBareStudentLoginUser() {
  const suffix = randomUUID();
  const user = await db.user.create({
    data: { email: `h2-it-bare-student-${suffix}@futuretutor.test`, role: "STUDENT" },
  });
  createdUserIds.push(user.id);
  return { user };
}

async function createGuardianlessStudentProfile(managementMode: "GUARDIAN_MANAGED") {
  const suffix = randomUUID();
  // A GUARDIAN_MANAGED child with no login of their own — userId stays
  // null.
  const studentProfile = await db.studentProfile.create({
    data: { userId: null, firstName: `NoLogin-${suffix}`, lastName: "Student", managementMode },
  });
  createdStudentProfileIds.push(studentProfile.id);
  return { studentProfile };
}

async function createParentUser() {
  const suffix = randomUUID();
  const user = await db.user.create({
    data: { email: `h2-it-parent-${suffix}@futuretutor.test`, role: "PARENT" },
  });
  createdUserIds.push(user.id);
  const parentProfile = await db.parentProfile.create({
    data: { userId: user.id, firstName: "Test", lastName: "Parent" },
  });
  return { user, parentProfile };
}

async function createTutorUser() {
  const suffix = randomUUID();
  const user = await db.user.create({
    data: { email: `h2-it-tutor-${suffix}@futuretutor.test`, role: "TUTOR" },
  });
  createdUserIds.push(user.id);
  const tutorProfile = await db.tutorProfile.create({
    data: { userId: user.id, slug: `h2-it-tutor-${suffix}` },
  });
  return { user, tutorProfile };
}

async function linkGuardian(parentProfileId: string, studentProfileId: string, status: "ACTIVE" | "REVOKED" = "ACTIVE") {
  const relationship = await db.parentStudentRelationship.create({
    data: { parentProfileId, studentProfileId, status },
  });
  createdRelationshipIds.push(relationship.id);
  return relationship;
}

describe("studentAuthorization — cross-family / IDOR (DB integration)", () => {
  it("17. Parent A cannot act for Parent B's child", async () => {
    const { studentProfile: childOfB } = await createGuardianlessStudentProfile("GUARDIAN_MANAGED");
    const { parentProfile: parentB } = await createParentUser();
    await linkGuardian(parentB.id, childOfB.id, "ACTIVE");

    const { user: parentA } = await createParentUser();
    // Parent A has a ParentProfile but NO relationship to childOfB.

    const result = await canActForStudent(db, parentA.id, childOfB.id);
    expect(result).toBe(false);
  });

  it("18. sibling/student A cannot gain management authority over sibling/student B", async () => {
    const { studentProfile: siblingA } = await createGuardianlessStudentProfile("GUARDIAN_MANAGED");
    const { studentProfile: siblingB } = await createGuardianlessStudentProfile("GUARDIAN_MANAGED");
    const { parentProfile: sharedParent } = await createParentUser();
    await linkGuardian(sharedParent.id, siblingA.id, "ACTIVE");
    await linkGuardian(sharedParent.id, siblingB.id, "ACTIVE");

    // Give sibling A their own restricted login — a bare User with no
    // StudentProfile of its own, linked onto the existing siblingA profile
    // (using createStudentUser here would create a SECOND StudentProfile
    // and collide with StudentProfile.userId's uniqueness).
    const { user: siblingAUser } = await createBareStudentLoginUser();
    await db.studentProfile.update({ where: { id: siblingA.id }, data: { userId: siblingAUser.id } });

    const result = await canManageStudentAccount(db, siblingAUser.id, siblingB.id);
    expect(result).toBe(false);
  });

  it("19. Tutor cannot manage/pay for Student", async () => {
    const { studentProfile } = await createGuardianlessStudentProfile("GUARDIAN_MANAGED");
    const { user: tutorUser } = await createTutorUser();

    expect(await canManageStudentAccount(db, tutorUser.id, studentProfile.id)).toBe(false);
    expect(await canPayForStudent(db, tutorUser.id, studentProfile.id)).toBe(false);
  });

  it("20. arbitrary authenticated User cannot gain access by merely supplying a studentProfileId", async () => {
    const { studentProfile: targetStudent } = await createStudentUser("SELF_MANAGED");
    const { user: unrelatedUser } = await createStudentUser("SELF_MANAGED"); // their own, unrelated account

    const result = await canActForStudent(db, unrelatedUser.id, targetStudent.id);
    expect(result).toBe(false);
  });

  it("REVOKED guardian relationship (real row) denies authority, confirmed against actual DB state", async () => {
    const { studentProfile } = await createGuardianlessStudentProfile("GUARDIAN_MANAGED");
    const { user: guardianUser, parentProfile } = await createParentUser();
    await linkGuardian(parentProfile.id, studentProfile.id, "REVOKED");

    expect(await hasActiveGuardianAuthority(db, guardianUser.id, studentProfile.id)).toBe(false);
  });

  it("ACTIVE guardian relationship (real row) grants authority, confirmed against actual DB state", async () => {
    const { studentProfile } = await createGuardianlessStudentProfile("GUARDIAN_MANAGED");
    const { user: guardianUser, parentProfile } = await createParentUser();
    await linkGuardian(parentProfile.id, studentProfile.id, "ACTIVE");

    expect(await hasActiveGuardianAuthority(db, guardianUser.id, studentProfile.id)).toBe(true);
  });
});

describe("studentAuthorization — transaction-client compatibility (test 22)", () => {
  it("22. policy helpers operate correctly through a Prisma transaction client, not just the ambient db singleton", async () => {
    const { studentProfile } = await createGuardianlessStudentProfile("GUARDIAN_MANAGED");
    const { user: guardianUser, parentProfile } = await createParentUser();
    await linkGuardian(parentProfile.id, studentProfile.id, "ACTIVE");

    const resultInsideTx = await db.$transaction(async (tx) => {
      return canActForStudent(tx, guardianUser.id, studentProfile.id);
    });
    expect(resultInsideTx).toBe(true);

    // And a denial case, also evaluated through a transaction client.
    const { user: unrelatedUser } = await createParentUser();
    const denialInsideTx = await db.$transaction(async (tx) => {
      return canActForStudent(tx, unrelatedUser.id, studentProfile.id);
    });
    expect(denialInsideTx).toBe(false);
  });
});
