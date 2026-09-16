import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";
import { resolveSelfReminderRecipient, resolveStudentReminderRecipients } from "./recipient";
import { getTutorLifecycle } from "../tutorLifecycle";
import { getStudentProfileLifecycle } from "../studentLifecycle";

// LIFECYCLE-1B Phase 4 — DB-backed tests for the recipient resolver. Same
// established convention as lifecycle.integration.test.ts. Runs ONLY
// against the isolated DATABASE_URL_TEST database.

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
  return `lifecycle1b-it-${prefix}-${randomUUID()}@futuretutor.test`;
}

describe("§19 Tutor recipient resolution", () => {
  it("resolves the tutor's own user as SELF, contactAllowed true, with no NotificationPreference row (defaults to enabled)", async () => {
    const user = await db.user.create({ data: { email: uniqueEmail("tutor"), role: "TUTOR" } });
    createdUserIds.push(user.id);
    const tutorProfile = await db.tutorProfile.create({ data: { userId: user.id, slug: `it-${randomUUID()}`, applicationStatus: "DRAFT" } });
    const state = await getTutorLifecycle(db, tutorProfile.id);
    const [recipient] = await resolveSelfReminderRecipient(db, state!, null);
    expect(recipient.relationship).toBe("SELF");
    expect(recipient.recipientUserId).toBe(user.id);
    expect(recipient.contactAllowed).toBe(true);
    expect(recipient.recipientEmail).toBe(user.email);
  });

  it("§22 email disabled by preference suppresses contact", async () => {
    const user = await db.user.create({ data: { email: uniqueEmail("tutor2"), role: "TUTOR" } });
    createdUserIds.push(user.id);
    await db.notificationPreference.create({ data: { userId: user.id, emailEnabled: false } });
    const tutorProfile = await db.tutorProfile.create({ data: { userId: user.id, slug: `it-${randomUUID()}`, applicationStatus: "DRAFT" } });
    const state = await getTutorLifecycle(db, tutorProfile.id);
    const [recipient] = await resolveSelfReminderRecipient(db, state!, null);
    expect(recipient.contactAllowed).toBe(false);
    expect(recipient.suppressionReason).toBe("EMAIL_DISABLED_BY_PREFERENCE");
  });
});

describe("§20/§21 Student recipient resolution — guardian safety", () => {
  it("§21 a GUARDIAN_MANAGED student with an active guardian resolves the GUARDIAN as recipient, never the student directly", async () => {
    const parentUser = await db.user.create({ data: { email: uniqueEmail("parent"), role: "PARENT" } });
    createdUserIds.push(parentUser.id);
    const parentProfile = await db.parentProfile.create({ data: { userId: parentUser.id, firstName: "Guardian", lastName: "Test" } });
    const studentProfile = await db.studentProfile.create({ data: { firstName: "Kid", lastName: "Test", managementMode: "GUARDIAN_MANAGED", userId: null } });
    createdStudentProfileIds.push(studentProfile.id);
    const relationship = await db.parentStudentRelationship.create({ data: { parentProfileId: parentProfile.id, studentProfileId: studentProfile.id, status: "ACTIVE" } });
    createdRelationshipIds.push(relationship.id);

    const state = await getStudentProfileLifecycle(db, studentProfile.id);
    const recipients = await resolveStudentReminderRecipients(db, state!);

    expect(recipients).toHaveLength(1);
    expect(recipients[0].relationship).toBe("GUARDIAN");
    expect(recipients[0].recipientUserId).toBe(parentUser.id);
    expect(recipients[0].contactAllowed).toBe(true);
  });

  it("§22 a GUARDIAN_MANAGED student with NO active guardian relationship has no safe recipient — never invents one", async () => {
    const studentProfile = await db.studentProfile.create({ data: { firstName: "Kid", lastName: "Orphan", managementMode: "GUARDIAN_MANAGED", userId: null } });
    createdStudentProfileIds.push(studentProfile.id);
    const state = await getStudentProfileLifecycle(db, studentProfile.id);
    const recipients = await resolveStudentReminderRecipients(db, state!);
    expect(recipients).toHaveLength(1);
    expect(recipients[0].contactAllowed).toBe(false);
    expect(recipients[0].suppressionReason).toBe("NO_SAFE_RECIPIENT");
  });

  it("a SELF_MANAGED student resolves themselves as SELF, never a guardian", async () => {
    const user = await db.user.create({ data: { email: uniqueEmail("student"), role: "STUDENT" } });
    createdUserIds.push(user.id);
    const studentProfile = await db.studentProfile.create({
      data: { userId: user.id, firstName: "Adult", lastName: "Student", managementMode: "SELF_MANAGED", dateOfBirth: new Date("2000-01-01"), province: "AB" },
    });
    createdStudentProfileIds.push(studentProfile.id);
    const state = await getStudentProfileLifecycle(db, studentProfile.id);
    const recipients = await resolveStudentReminderRecipients(db, state!);
    expect(recipients).toHaveLength(1);
    expect(recipients[0].relationship).toBe("SELF");
    expect(recipients[0].recipientUserId).toBe(user.id);
  });

  it("multiple active guardians each resolve as an independent recipient — never an arbitrarily-picked single one", async () => {
    const parentUserA = await db.user.create({ data: { email: uniqueEmail("parentA"), role: "PARENT" } });
    const parentUserB = await db.user.create({ data: { email: uniqueEmail("parentB"), role: "PARENT" } });
    createdUserIds.push(parentUserA.id, parentUserB.id);
    const parentProfileA = await db.parentProfile.create({ data: { userId: parentUserA.id, firstName: "GuardianA", lastName: "Test" } });
    const parentProfileB = await db.parentProfile.create({ data: { userId: parentUserB.id, firstName: "GuardianB", lastName: "Test" } });
    const studentProfile = await db.studentProfile.create({ data: { firstName: "Kid", lastName: "TwoGuardians", managementMode: "GUARDIAN_MANAGED", userId: null } });
    createdStudentProfileIds.push(studentProfile.id);
    const relA = await db.parentStudentRelationship.create({ data: { parentProfileId: parentProfileA.id, studentProfileId: studentProfile.id, status: "ACTIVE" } });
    const relB = await db.parentStudentRelationship.create({ data: { parentProfileId: parentProfileB.id, studentProfileId: studentProfile.id, status: "ACTIVE" } });
    createdRelationshipIds.push(relA.id, relB.id);

    const state = await getStudentProfileLifecycle(db, studentProfile.id);
    const recipients = await resolveStudentReminderRecipients(db, state!);

    expect(recipients).toHaveLength(2);
    expect(recipients.map((r) => r.recipientUserId).sort()).toEqual([parentUserA.id, parentUserB.id].sort());
  });

  it("a REVOKED-only relationship is never treated as a safe recipient", async () => {
    const parentUser = await db.user.create({ data: { email: uniqueEmail("parentRevoked"), role: "PARENT" } });
    createdUserIds.push(parentUser.id);
    const parentProfile = await db.parentProfile.create({ data: { userId: parentUser.id, firstName: "Revoked", lastName: "Guardian" } });
    const studentProfile = await db.studentProfile.create({ data: { firstName: "Kid", lastName: "Revoked", managementMode: "GUARDIAN_MANAGED", userId: null } });
    createdStudentProfileIds.push(studentProfile.id);
    const relationship = await db.parentStudentRelationship.create({
      data: { parentProfileId: parentProfile.id, studentProfileId: studentProfile.id, status: "REVOKED", revokedAt: new Date() },
    });
    createdRelationshipIds.push(relationship.id);

    const state = await getStudentProfileLifecycle(db, studentProfile.id);
    const recipients = await resolveStudentReminderRecipients(db, state!);
    expect(recipients).toHaveLength(1);
    expect(recipients[0].contactAllowed).toBe(false);
    expect(recipients[0].suppressionReason).toBe("NO_SAFE_RECIPIENT");
  });
});
