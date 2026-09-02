import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";
import { createUserForSignup } from "./signup";
import { canManageStudentAccount, canInitiatePaidBooking, hasActiveGuardianAuthority } from "./studentAuthorization";

// Phase H.3 — permanent DB-integration tests for createUserForSignup, the
// atomic User+profile creation core shared by the Student/Parent/Tutor
// signup paths (see src/lib/actions/auth.ts's registerAction, which calls
// this same function). Runs ONLY against the isolated DATABASE_URL_TEST
// database, verified via resolveVerifiedTestDatabase() in beforeAll — this
// throws (fails closed) before any connection is even opened if
// DATABASE_URL_TEST is unset or unsafe. The normal development database is
// never touched by this file.

let db: PrismaClient;
const createdUserIds: string[] = [];
const createdStudentProfileIds: string[] = [];

beforeAll(() => {
  const target = resolveVerifiedTestDatabase();
  const adapter = new PrismaPg({ connectionString: target.connectionString });
  db = new PrismaClient({ adapter });
});

afterAll(async () => {
  await db?.$disconnect();
});

afterEach(async () => {
  // Same cleanup ordering H.2 established and required: a SELF_MANAGED
  // StudentProfile's userId->User relation is SetNull, and SetNull-ing it
  // to NULL is exactly what StudentProfile_selfManagedRequiresUser_check
  // correctly refuses — so the StudentProfile row must be deleted
  // explicitly before its owning User. ParentProfile/TutorProfile cascade
  // cleanly on User deletion (unchanged Cascade relations), so no separate
  // tracking is needed for those.
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
  return `h3-it-${prefix}-${randomUUID()}@futuretutor.test`;
}

describe("createUserForSignup — STUDENT", () => {
  it("1. creates exactly one User + one SELF_MANAGED StudentProfile, linked", async () => {
    const email = uniqueEmail("student");
    const user = await createUserForSignup(db, {
      firstName: "Sam",
      lastName: "Student",
      email,
      passwordHash: "hash",
      role: "STUDENT",
      dateOfBirth: new Date("2010-06-15T00:00:00.000Z"),
      province: "ON",
    });
    createdUserIds.push(user.id);

    expect(user.role).toBe("STUDENT");
    const studentProfile = await db.studentProfile.findUnique({ where: { userId: user.id } });
    expect(studentProfile).not.toBeNull();
    createdStudentProfileIds.push(studentProfile!.id);
    expect(studentProfile!.managementMode).toBe("SELF_MANAGED");
    expect(studentProfile!.userId).toBe(user.id);
  });

  it("BETA-AGE1: persists province exactly as given, for any of the 13 canonical codes", async () => {
    const email = uniqueEmail("student-province");
    const user = await createUserForSignup(db, {
      firstName: "Prov",
      lastName: "Student",
      email,
      passwordHash: "hash",
      role: "STUDENT",
      dateOfBirth: new Date("2000-01-01T00:00:00.000Z"),
      province: "BC",
    });
    createdUserIds.push(user.id);
    const studentProfile = await db.studentProfile.findUnique({ where: { userId: user.id } });
    createdStudentProfileIds.push(studentProfile!.id);

    expect(studentProfile!.province).toBe("BC");
  });

  it("BETA-AGE1: throws when province is missing for role STUDENT (defensive — the Zod schema + registerAction's own eligibility check are the primary gates)", async () => {
    const email = uniqueEmail("student-missing-province");
    await expect(
      createUserForSignup(db, {
        firstName: "No",
        lastName: "Province",
        email,
        passwordHash: "hash",
        role: "STUDENT",
        dateOfBirth: new Date("2000-01-01T00:00:00.000Z"),
      })
    ).rejects.toThrow(/province is required/);

    // Confirms the throw happened before any DB write — nothing to clean up.
    expect(await db.user.findUnique({ where: { email } })).toBeNull();
  });

  it("LEGAL-19: records termsAcceptedAt/Version/Locale exactly as given", async () => {
    const email = uniqueEmail("student-terms");
    const acceptedAt = new Date("2026-08-30T12:00:00.000Z");
    const user = await createUserForSignup(db, {
      firstName: "Tia",
      lastName: "Student",
      email,
      passwordHash: "hash",
      role: "STUDENT",
      dateOfBirth: new Date("2010-06-15T00:00:00.000Z"),
      province: "ON",
      termsAcceptedAt: acceptedAt,
      termsAcceptedVersion: "2026-08-30",
      termsAcceptedLocale: "fr",
    });
    createdUserIds.push(user.id);
    const studentProfile = await db.studentProfile.findUnique({ where: { userId: user.id } });
    createdStudentProfileIds.push(studentProfile!.id);

    expect(user.termsAcceptedAt?.toISOString()).toBe(acceptedAt.toISOString());
    expect(user.termsAcceptedVersion).toBe("2026-08-30");
    expect(user.termsAcceptedLocale).toBe("fr");
  });

  it("leaves termsAcceptedAt/Version/Locale null when not supplied (e.g. the guardian-invitation account-creation path)", async () => {
    const email = uniqueEmail("student-no-terms");
    const user = await createUserForSignup(db, {
      firstName: "No",
      lastName: "Terms",
      email,
      passwordHash: "hash",
      role: "STUDENT",
      dateOfBirth: new Date("2010-06-15T00:00:00.000Z"),
      province: "ON",
    });
    createdUserIds.push(user.id);
    const studentProfile = await db.studentProfile.findUnique({ where: { userId: user.id } });
    createdStudentProfileIds.push(studentProfile!.id);

    expect(user.termsAcceptedAt).toBeNull();
    expect(user.termsAcceptedVersion).toBeNull();
    expect(user.termsAcceptedLocale).toBeNull();
  });

  it("2. persists dateOfBirth exactly as given (no timezone drift)", async () => {
    const email = uniqueEmail("student-dob");
    const dob = new Date("1995-11-02T00:00:00.000Z");
    const user = await createUserForSignup(db, {
      firstName: "Dana",
      lastName: "Student",
      email,
      passwordHash: "hash",
      role: "STUDENT",
      dateOfBirth: dob,
      province: "ON",
    });
    createdUserIds.push(user.id);

    const studentProfile = await db.studentProfile.findUnique({ where: { userId: user.id } });
    createdStudentProfileIds.push(studentProfile!.id);
    expect(studentProfile!.dateOfBirth?.toISOString()).toBe(dob.toISOString());
  });

  it("3. creates zero ParentProfile/TutorProfile rows as a side effect", async () => {
    const email = uniqueEmail("student-noside");
    const user = await createUserForSignup(db, {
      firstName: "Sam",
      lastName: "Student",
      email,
      passwordHash: "hash",
      role: "STUDENT",
      dateOfBirth: new Date("2008-01-01T00:00:00.000Z"),
      province: "ON",
    });
    createdUserIds.push(user.id);
    const studentProfile = await db.studentProfile.findUnique({ where: { userId: user.id } });
    createdStudentProfileIds.push(studentProfile!.id);

    expect(await db.parentProfile.findUnique({ where: { userId: user.id } })).toBeNull();
    expect(await db.tutorProfile.findUnique({ where: { userId: user.id } })).toBeNull();
  });

  it("4. throws when dateOfBirth is missing for role STUDENT (defensive — the Zod schema is the primary gate)", async () => {
    const email = uniqueEmail("student-missing-dob");
    await expect(
      createUserForSignup(db, { firstName: "No", lastName: "Dob", email, passwordHash: "hash", role: "STUDENT" })
    ).rejects.toThrow(/dateOfBirth is required/);

    // Confirms the throw happened before any DB write — nothing to clean up.
    expect(await db.user.findUnique({ where: { email } })).toBeNull();
  });

  it("11. the newly created Student User can manage/pay for their own StudentProfile immediately after signup", async () => {
    const email = uniqueEmail("student-self-auth");
    const user = await createUserForSignup(db, {
      firstName: "Sam",
      lastName: "Student",
      email,
      passwordHash: "hash",
      role: "STUDENT",
      dateOfBirth: new Date("2005-03-20T00:00:00.000Z"),
      province: "ON",
    });
    createdUserIds.push(user.id);
    const studentProfile = await db.studentProfile.findUnique({ where: { userId: user.id } });
    createdStudentProfileIds.push(studentProfile!.id);

    expect(await canManageStudentAccount(db, user.id, studentProfile!.id)).toBe(true);
    expect(await canInitiatePaidBooking(db, user.id, studentProfile!.id)).toBe(true);
  });
});

describe("createUserForSignup — PARENT", () => {
  it("5. creates exactly one User + one ParentProfile, linked", async () => {
    const email = uniqueEmail("parent");
    const user = await createUserForSignup(db, {
      firstName: "Pat",
      lastName: "Parent",
      email,
      passwordHash: "hash",
      role: "PARENT",
    });
    createdUserIds.push(user.id);

    expect(user.role).toBe("PARENT");
    const parentProfile = await db.parentProfile.findUnique({ where: { userId: user.id } });
    expect(parentProfile).not.toBeNull();
    expect(parentProfile!.firstName).toBe("Pat");
  });

  it("6. creates zero StudentProfile/TutorProfile/ParentStudentRelationship/FamilyInvitation rows", async () => {
    const email = uniqueEmail("parent-noside");
    const user = await createUserForSignup(db, {
      firstName: "Pat",
      lastName: "Parent",
      email,
      passwordHash: "hash",
      role: "PARENT",
    });
    createdUserIds.push(user.id);
    const parentProfile = await db.parentProfile.findUnique({ where: { userId: user.id } });

    expect(await db.studentProfile.findUnique({ where: { userId: user.id } })).toBeNull();
    expect(await db.tutorProfile.findUnique({ where: { userId: user.id } })).toBeNull();
    expect(await db.parentStudentRelationship.findMany({ where: { parentProfileId: parentProfile!.id } })).toHaveLength(0);
    expect(await db.familyInvitation.findMany({ where: { invitedByUserId: user.id } })).toHaveLength(0);
  });

  it("10. a freshly created Parent has zero implicit authority over an unrelated StudentProfile", async () => {
    const parentEmail = uniqueEmail("parent-zero-auth");
    const parentUser = await createUserForSignup(db, {
      firstName: "Pat",
      lastName: "Parent",
      email: parentEmail,
      passwordHash: "hash",
      role: "PARENT",
    });
    createdUserIds.push(parentUser.id);

    const studentEmail = uniqueEmail("student-unrelated");
    const studentUser = await createUserForSignup(db, {
      firstName: "Sam",
      lastName: "Student",
      email: studentEmail,
      passwordHash: "hash",
      role: "STUDENT",
      dateOfBirth: new Date("2012-09-01T00:00:00.000Z"),
      province: "ON",
    });
    createdUserIds.push(studentUser.id);
    const studentProfile = await db.studentProfile.findUnique({ where: { userId: studentUser.id } });
    createdStudentProfileIds.push(studentProfile!.id);

    expect(await hasActiveGuardianAuthority(db, parentUser.id, studentProfile!.id)).toBe(false);
    expect(await canManageStudentAccount(db, parentUser.id, studentProfile!.id)).toBe(false);
  });
});

describe("createUserForSignup — TUTOR", () => {
  it("7. creates exactly one User + one TutorProfile with the given slug", async () => {
    const email = uniqueEmail("tutor");
    const slug = `h3-it-tutor-${randomUUID()}`;
    const user = await createUserForSignup(db, {
      firstName: "Tara",
      lastName: "Tutor",
      email,
      passwordHash: "hash",
      role: "TUTOR",
      tutorSlug: slug,
    });
    createdUserIds.push(user.id);

    expect(user.role).toBe("TUTOR");
    const tutorProfile = await db.tutorProfile.findUnique({ where: { userId: user.id } });
    expect(tutorProfile).not.toBeNull();
    expect(tutorProfile!.slug).toBe(slug);
  });

  it("12. creates zero StudentProfile/ParentProfile rows as a side effect", async () => {
    const email = uniqueEmail("tutor-noside");
    const slug = `h3-it-tutor-${randomUUID()}`;
    const user = await createUserForSignup(db, {
      firstName: "Tara",
      lastName: "Tutor",
      email,
      passwordHash: "hash",
      role: "TUTOR",
      tutorSlug: slug,
    });
    createdUserIds.push(user.id);

    expect(await db.studentProfile.findUnique({ where: { userId: user.id } })).toBeNull();
    expect(await db.parentProfile.findUnique({ where: { userId: user.id } })).toBeNull();
  });

  it("9. a nested-create failure (duplicate slug) rolls back the whole operation — no orphan User row", async () => {
    const takenSlug = `h3-it-tutor-taken-${randomUUID()}`;
    const firstEmail = uniqueEmail("tutor-slug-a");
    const firstUser = await createUserForSignup(db, {
      firstName: "First",
      lastName: "Tutor",
      email: firstEmail,
      passwordHash: "hash",
      role: "TUTOR",
      tutorSlug: takenSlug,
    });
    createdUserIds.push(firstUser.id);

    const secondEmail = uniqueEmail("tutor-slug-b");
    await expect(
      createUserForSignup(db, {
        firstName: "Second",
        lastName: "Tutor",
        email: secondEmail,
        passwordHash: "hash",
        role: "TUTOR",
        tutorSlug: takenSlug, // collides with firstUser's TutorProfile.slug (@unique)
      })
    ).rejects.toThrow();

    // The whole db.user.create (User + nested TutorProfile) is one atomic
    // write — the TutorProfile.slug collision must roll back the User
    // insert too, leaving nothing behind under secondEmail.
    expect(await db.user.findUnique({ where: { email: secondEmail } })).toBeNull();
  });
});

describe("createUserForSignup — duplicate email safety", () => {
  it("8. a duplicate email is rejected by the database's own unique constraint", async () => {
    const email = uniqueEmail("dup-email");
    const first = await createUserForSignup(db, {
      firstName: "Original",
      lastName: "User",
      email,
      passwordHash: "hash",
      role: "PARENT",
    });
    createdUserIds.push(first.id);

    await expect(
      createUserForSignup(db, { firstName: "Duplicate", lastName: "User", email, passwordHash: "hash", role: "PARENT" })
    ).rejects.toThrow();

    // Exactly one User row exists for this email — the original, untouched.
    const matches = await db.user.findMany({ where: { email } });
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe(first.id);
  });
});

describe("createUserForSignup — role isolation across independent signups", () => {
  it("13. a Student and a Parent signed up independently don't interfere with each other's rows", async () => {
    const studentEmail = uniqueEmail("iso-student");
    const parentEmail = uniqueEmail("iso-parent");

    const studentUser = await createUserForSignup(db, {
      firstName: "Iso",
      lastName: "Student",
      email: studentEmail,
      passwordHash: "hash",
      role: "STUDENT",
      dateOfBirth: new Date("2011-04-04T00:00:00.000Z"),
      province: "ON",
    });
    createdUserIds.push(studentUser.id);
    const studentProfile = await db.studentProfile.findUnique({ where: { userId: studentUser.id } });
    createdStudentProfileIds.push(studentProfile!.id);

    const parentUser = await createUserForSignup(db, {
      firstName: "Iso",
      lastName: "Parent",
      email: parentEmail,
      passwordHash: "hash",
      role: "PARENT",
    });
    createdUserIds.push(parentUser.id);

    expect(studentUser.id).not.toBe(parentUser.id);
    expect(await db.parentProfile.findUnique({ where: { userId: studentUser.id } })).toBeNull();
    expect(await db.studentProfile.findUnique({ where: { userId: parentUser.id } })).toBeNull();
  });

  it("14. role stored on the User row is exactly the requested role for every signup type", async () => {
    const tutorEmail = uniqueEmail("role-exact-tutor");
    const tutorUser = await createUserForSignup(db, {
      firstName: "Role",
      lastName: "Check",
      email: tutorEmail,
      passwordHash: "hash",
      role: "TUTOR",
      tutorSlug: `h3-it-tutor-${randomUUID()}`,
    });
    createdUserIds.push(tutorUser.id);
    expect(tutorUser.role).toBe("TUTOR");

    const parentEmail = uniqueEmail("role-exact-parent");
    const parentUser = await createUserForSignup(db, {
      firstName: "Role",
      lastName: "Check",
      email: parentEmail,
      passwordHash: "hash",
      role: "PARENT",
    });
    createdUserIds.push(parentUser.id);
    expect(parentUser.role).toBe("PARENT");
  });
});
