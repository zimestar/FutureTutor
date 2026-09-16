import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";
import { loadTutorLifecycleInput, assessTutorLifecycle } from "./tutorLifecycle";
import { loadParentLifecycleInput, assessParentLifecycle } from "./parentLifecycle";
import {
  loadStudentProfileLifecycleInput,
  assessStudentProfileLifecycle,
  loadStudentLoginLinkingInput,
} from "./studentLifecycle";
import { getLifecycleJourneyForStudentUser } from "./index";

// LIFECYCLE-1A — DB-backed tests for the loader functions (the only pieces
// of this module that touch Prisma) and for the admin-exclusion guarantee
// (§28), which can only be proven against a real User row + role. Runs ONLY
// against the isolated DATABASE_URL_TEST database, verified in beforeAll —
// same convention as src/services/studentActivationState.integration.test.ts.
// Read-only from the lifecycle module's own perspective: every write below
// is direct test fixture setup, never a call into src/lib/lifecycle itself
// (that module has no write path at all).

let db: PrismaClient;
const createdUserIds: string[] = [];
const createdTutorProfileIds: string[] = [];
const createdParentProfileIds: string[] = [];
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
  if (createdParentProfileIds.length > 0) {
    createdParentProfileIds.length = 0; // cascades with the User delete below
  }
  if (createdTutorProfileIds.length > 0) {
    createdTutorProfileIds.length = 0; // cascades with the User delete below
  }
  if (createdUserIds.length > 0) {
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
});

function uniqueEmail(prefix: string) {
  return `lifecycle1a-it-${prefix}-${randomUUID()}@futuretutor.test`;
}

async function createTutorUser(overrides: { applicationStatus?: "DRAFT" | "SUBMITTED" | "APPROVED" } = {}) {
  const user = await db.user.create({ data: { email: uniqueEmail("tutor"), role: "TUTOR" } });
  createdUserIds.push(user.id);
  const tutorProfile = await db.tutorProfile.create({
    data: { userId: user.id, slug: `it-tutor-${randomUUID()}`, applicationStatus: overrides.applicationStatus ?? "DRAFT" },
  });
  createdTutorProfileIds.push(tutorProfile.id);
  return { user, tutorProfile };
}

async function createParentUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("parent"), role: "PARENT" } });
  createdUserIds.push(user.id);
  const parentProfile = await db.parentProfile.create({ data: { userId: user.id, firstName: "Test", lastName: "Parent" } });
  createdParentProfileIds.push(parentProfile.id);
  return { user, parentProfile };
}

async function createSelfManagedStudentUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("student"), role: "STUDENT" } });
  createdUserIds.push(user.id);
  const studentProfile = await db.studentProfile.create({
    data: {
      userId: user.id,
      firstName: "Kid",
      lastName: "Test",
      managementMode: "SELF_MANAGED",
      dateOfBirth: new Date("2000-01-01T00:00:00.000Z"),
      province: "AB",
    },
  });
  createdStudentProfileIds.push(studentProfile.id);
  return { user, studentProfile };
}

async function createGuardianManagedChild(parentProfileId: string) {
  const studentProfile = await db.studentProfile.create({
    data: { firstName: "Kid", lastName: "Test", managementMode: "GUARDIAN_MANAGED", userId: null },
  });
  createdStudentProfileIds.push(studentProfile.id);
  const relationship = await db.parentStudentRelationship.create({
    data: { parentProfileId, studentProfileId: studentProfile.id, status: "ACTIVE" },
  });
  createdRelationshipIds.push(relationship.id);
  return { studentProfile, relationship };
}

describe("Tutor lifecycle loader", () => {
  it("loads a real TutorProfile and produces the same assessment the pure evaluator would", async () => {
    const { tutorProfile } = await createTutorUser({ applicationStatus: "DRAFT" });
    const input = await loadTutorLifecycleInput(db, tutorProfile.id);
    expect(input).not.toBeNull();
    const result = assessTutorLifecycle(input!, new Date());
    expect(result.role).toBe("TUTOR");
    expect(result.stage).toBe("DRAFT");
    expect(result.status).toBe("USER_ACTION_REQUIRED");
  });

  it("returns null for a nonexistent TutorProfile id (no fabricated state)", async () => {
    const input = await loadTutorLifecycleInput(db, "nonexistent-tutor-profile-id");
    expect(input).toBeNull();
  });

  it("reflects a suspended TutorProfile.applicationStatus", async () => {
    const { tutorProfile } = await createTutorUser({ applicationStatus: "APPROVED" });
    await db.tutorProfile.update({ where: { id: tutorProfile.id }, data: { applicationStatus: "SUSPENDED" } });
    const input = await loadTutorLifecycleInput(db, tutorProfile.id);
    const result = assessTutorLifecycle(input!, new Date());
    expect(result.status).toBe("SUSPENDED");
    expect(result.reminderEligible).toBe(false);
  });
});

describe("Parent lifecycle loader", () => {
  it("loads a real ParentProfile with zero children -> USER_ACTION_REQUIRED", async () => {
    const { parentProfile } = await createParentUser();
    const input = await loadParentLifecycleInput(db, parentProfile.id);
    const result = assessParentLifecycle(input!, new Date());
    expect(result.stage).toBe("STUDENT_SETUP");
    expect(result.status).toBe("USER_ACTION_REQUIRED");
  });

  it("loads a real ParentProfile with an active child -> COMPLETED", async () => {
    const { parentProfile } = await createParentUser();
    await createGuardianManagedChild(parentProfile.id);
    const input = await loadParentLifecycleInput(db, parentProfile.id);
    const result = assessParentLifecycle(input!, new Date());
    expect(result.status).toBe("COMPLETED");
    expect(result.completedAt).not.toBeNull();
  });
});

describe("Student lifecycle loader", () => {
  it("loads a real SELF_MANAGED StudentProfile missing required fields -> USER_ACTION_REQUIRED", async () => {
    const { studentProfile } = await createSelfManagedStudentUser();
    const input = await loadStudentProfileLifecycleInput(db, studentProfile.id);
    const result = assessStudentProfileLifecycle(input!, new Date());
    // province was set at signup; academicLevelId/city were not.
    expect(result.status).toBe("USER_ACTION_REQUIRED");
    expect(result.nextAction).toBe("/dashboard/profile");
  });

  it("loads a real GUARDIAN_MANAGED StudentProfile with no login -> recipientUserId is null (Phase 10 subject/recipient split)", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const input = await loadStudentProfileLifecycleInput(db, studentProfile.id);
    const result = assessStudentProfileLifecycle(input!, new Date());
    expect(result.recipientUserId).toBeNull();
    expect(result.nextAction).toBe("/dashboard/family");
  });

  it("loadStudentLoginLinkingInput returns null once a StudentProfile is linked (ACTIVE) — STUDENT_PROFILE_READINESS takes over instead", async () => {
    const { user } = await createSelfManagedStudentUser();
    const input = await loadStudentLoginLinkingInput(db, user.id);
    expect(input).toBeNull();
  });

  it("loadStudentLoginLinkingInput resolves UNLINKED for a bare STUDENT user with no profile and no claim", async () => {
    const user = await db.user.create({ data: { email: uniqueEmail("bare-student"), role: "STUDENT" } });
    createdUserIds.push(user.id);
    const input = await loadStudentLoginLinkingInput(db, user.id);
    expect(input?.activationState).toBe("UNLINKED");
  });
});

describe("§28 — admin accounts are never assessed", () => {
  it("getLifecycleJourneyForStudentUser returns null for an ADMIN-role user id (fails closed, never fabricates a journey)", async () => {
    const admin = await db.user.create({ data: { email: uniqueEmail("admin"), role: "ADMIN" } });
    createdUserIds.push(admin.id);
    const result = await getLifecycleJourneyForStudentUser(db, admin.id);
    expect(result).toBeNull();
  });

  it("loadStudentLoginLinkingInput explicitly rejects a non-STUDENT role even if somehow called directly", async () => {
    const admin = await db.user.create({ data: { email: uniqueEmail("admin2"), role: "ADMIN" } });
    createdUserIds.push(admin.id);
    const input = await loadStudentLoginLinkingInput(db, admin.id);
    expect(input).toBeNull();
  });
});
