import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";

// BETA-IP1-A — DB-backed coverage for resolveExactLocationAccess (the IO
// wrapper's own TutorProfile lookup, not re-testing computeExactLocationAccess's
// pure decision matrix, which bookingLocationAccess.test.ts already covers
// exhaustively) plus canActForStudent's real guardian-authorization behavior
// for the Student/Parent-owner path getBookingLocationAction relies on.
// Mirrors videoJoin.integration.test.ts's DB-target-redirection technique.

let resolveExactLocationAccess: typeof import("./bookingLocationAccess").resolveExactLocationAccess;
let toExactLocationDto: typeof import("./bookingLocationAccess").toExactLocationDto;
let toApproximateLocationDto: typeof import("./bookingLocationAccess").toApproximateLocationDto;
let canActForStudent: typeof import("./studentAuthorization").canActForStudent;

let db: PrismaClient;
let subjectId: string;

const createdUserIds: string[] = [];
const createdStudentProfileIds: string[] = [];
const createdParentProfileIds: string[] = [];
const createdRelationshipIds: string[] = [];
const createdTutorProfileIds: string[] = [];
const createdBookingIds: string[] = [];

beforeAll(async () => {
  const target = resolveVerifiedTestDatabase();
  const devDatabaseUrlForSafetyCheckOnly = process.env.DATABASE_URL;
  const adapter = new PrismaPg({ connectionString: target.connectionString });
  db = new PrismaClient({ adapter });

  process.env.DATABASE_URL = target.connectionString;

  ({ resolveExactLocationAccess, toExactLocationDto, toApproximateLocationDto } = await import("./bookingLocationAccess"));
  ({ canActForStudent } = await import("./studentAuthorization"));

  const [{ current_database: ambientDatabaseName }] = await db.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
  if (ambientDatabaseName !== target.databaseName) {
    throw new Error(`FAIL CLOSED: current_database() = "${ambientDatabaseName}", expected "${target.databaseName}".`);
  }
  const devDatabaseNameForSafetyCheckOnly = devDatabaseUrlForSafetyCheckOnly
    ? new URL(devDatabaseUrlForSafetyCheckOnly).pathname.replace(/^\//, "")
    : null;
  if (devDatabaseNameForSafetyCheckOnly && ambientDatabaseName === devDatabaseNameForSafetyCheckOnly) {
    throw new Error(`FAIL CLOSED: ambient database equals the real development database ("${ambientDatabaseName}").`);
  }

  const subject = await db.subject.create({ data: { slug: `ip1a-subject-${randomUUID()}`, sortOrder: 999 } });
  subjectId = subject.id;
}, 30000);

afterAll(async () => {
  await db.subject.delete({ where: { id: subjectId } });
  await db?.$disconnect();
});

afterEach(async () => {
  if (createdBookingIds.length > 0) {
    await db.booking.deleteMany({ where: { id: { in: createdBookingIds } } });
    createdBookingIds.length = 0;
  }
  if (createdRelationshipIds.length > 0) {
    await db.parentStudentRelationship.deleteMany({ where: { id: { in: createdRelationshipIds } } });
    createdRelationshipIds.length = 0;
  }
  if (createdTutorProfileIds.length > 0) {
    await db.tutorProfile.deleteMany({ where: { id: { in: createdTutorProfileIds } } });
    createdTutorProfileIds.length = 0;
  }
  if (createdStudentProfileIds.length > 0) {
    await db.studentProfile.deleteMany({ where: { id: { in: createdStudentProfileIds } } });
    createdStudentProfileIds.length = 0;
  }
  if (createdParentProfileIds.length > 0) {
    await db.parentProfile.deleteMany({ where: { id: { in: createdParentProfileIds } } });
    createdParentProfileIds.length = 0;
  }
  if (createdUserIds.length > 0) {
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
});

function uniqueEmail(prefix: string) {
  return `ip1a-${prefix}-${randomUUID()}@futuretutor.test`;
}

async function createTutor() {
  const user = await db.user.create({ data: { email: uniqueEmail("tutor"), role: "TUTOR" } });
  createdUserIds.push(user.id);
  const tutorProfile = await db.tutorProfile.create({
    data: { userId: user.id, slug: `ip1a-tutor-${randomUUID()}`, applicationStatus: "APPROVED", payoutTier: "NEW", learningMode: "IN_PERSON" },
  });
  createdTutorProfileIds.push(tutorProfile.id);
  return { user, tutorProfile };
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

async function createGuardianManagedFamily(relationshipStatus: "ACTIVE" | "REVOKED" = "ACTIVE") {
  const studentProfile = await db.studentProfile.create({
    data: { firstName: "Minor", lastName: "Student", managementMode: "GUARDIAN_MANAGED" },
  });
  createdStudentProfileIds.push(studentProfile.id);
  const parentUser = await db.user.create({ data: { email: uniqueEmail("parent"), role: "PARENT" } });
  createdUserIds.push(parentUser.id);
  const parentProfile = await db.parentProfile.create({ data: { userId: parentUser.id, firstName: "Legal", lastName: "Guardian" } });
  createdParentProfileIds.push(parentProfile.id);
  const relationship = await db.parentStudentRelationship.create({
    data: {
      parentProfileId: parentProfile.id,
      studentProfileId: studentProfile.id,
      status: relationshipStatus,
      revokedAt: relationshipStatus === "REVOKED" ? new Date() : null,
    },
  });
  createdRelationshipIds.push(relationship.id);
  return { parentUser, parentProfile, studentProfile };
}

async function createInPersonBooking(overrides: { tutorProfileId: string; studentProfileId: string; status?: "DRAFT" | "PENDING_PAYMENT" | "CONFIRMED" | "COMPLETED" | "NO_SHOW" | "CANCELLED"; mode?: "IN_PERSON" | "ONLINE"; arrivalInstructions?: string | null }) {
  const startAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const booking = await db.booking.create({
    data: {
      studentProfileId: overrides.studentProfileId,
      tutorProfileId: overrides.tutorProfileId,
      subjectId,
      startAt,
      endAt: new Date(startAt.getTime() + 60 * 60 * 1000),
      timezone: "America/Toronto",
      mode: overrides.mode ?? "IN_PERSON",
      platformFeeCentsSnapshot: 0,
      totalCents: 8000,
      status: overrides.status ?? "CONFIRMED",
      bookingAddressLine1: "123 Main St",
      bookingAddressLine2: "Unit 4",
      bookingCity: "Toronto",
      bookingProvince: "ON",
      bookingPostalCode: "M5V2T6",
      bookingArrivalInstructions: overrides.arrivalInstructions === undefined ? "Use the side entrance and ring the bell." : overrides.arrivalInstructions,
    },
  });
  createdBookingIds.push(booking.id);
  return booking;
}

describe("resolveExactLocationAccess (IO wrapper — real TutorProfile lookup)", () => {
  it("IP-SEC-2: grants the booking's own tutor on a CONFIRMED booking", async () => {
    const tutor = await createTutor();
    const student = await createSelfManagedStudent();
    const booking = await createInPersonBooking({ tutorProfileId: tutor.tutorProfile.id, studentProfileId: student.studentProfile.id });
    const result = await resolveExactLocationAccess(db, tutor.user.id, booking);
    expect(result).toEqual({ granted: true });
  });

  it("IP-SEC-3/5: denies a real but unrelated tutor (has a TutorProfile, just not this booking's)", async () => {
    const tutor = await createTutor();
    const otherTutor = await createTutor();
    const student = await createSelfManagedStudent();
    const booking = await createInPersonBooking({ tutorProfileId: tutor.tutorProfile.id, studentProfileId: student.studentProfile.id });
    const result = await resolveExactLocationAccess(db, otherTutor.user.id, booking);
    expect(result).toEqual({ granted: false, reason: "NOT_BOOKING_TUTOR" });
  });

  it("denies an actor with no TutorProfile at all (e.g. a Student account)", async () => {
    const tutor = await createTutor();
    const student = await createSelfManagedStudent();
    const booking = await createInPersonBooking({ tutorProfileId: tutor.tutorProfile.id, studentProfileId: student.studentProfile.id });
    const result = await resolveExactLocationAccess(db, student.user.id, booking);
    expect(result).toEqual({ granted: false, reason: "NOT_BOOKING_TUTOR" });
  });

  it("IP-SEC-1: denies the real booking tutor while PENDING_PAYMENT (claimed but not yet confirmed)", async () => {
    const tutor = await createTutor();
    const student = await createSelfManagedStudent();
    const booking = await createInPersonBooking({ tutorProfileId: tutor.tutorProfile.id, studentProfileId: student.studentProfile.id, status: "PENDING_PAYMENT" });
    const result = await resolveExactLocationAccess(db, tutor.user.id, booking);
    expect(result).toEqual({ granted: false, reason: "BOOKING_NOT_CONFIRMED" });
  });

  it("IP-C-SNAP-1: a real persisted arrival-instructions value round-trips through the exact DTO and is excluded from the approximate DTO", async () => {
    const tutor = await createTutor();
    const student = await createSelfManagedStudent();
    const booking = await createInPersonBooking({
      tutorProfileId: tutor.tutorProfile.id,
      studentProfileId: student.studentProfile.id,
      arrivalInstructions: "Park in visitor spot 4, buzz unit 12B.",
    });
    const persisted = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(toExactLocationDto(persisted).arrivalInstructions).toBe("Park in visitor spot 4, buzz unit 12B.");
    expect(toApproximateLocationDto(persisted)).not.toHaveProperty("arrivalInstructions");
  });

  it("a booking created with null arrival instructions persists and reads back as null, not a placeholder string", async () => {
    const tutor = await createTutor();
    const student = await createSelfManagedStudent();
    const booking = await createInPersonBooking({
      tutorProfileId: tutor.tutorProfile.id,
      studentProfileId: student.studentProfile.id,
      arrivalInstructions: null,
    });
    const persisted = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(toExactLocationDto(persisted).arrivalInstructions).toBeNull();
  });
});

describe("canActForStudent — the Student/Parent owner path getBookingLocationAction relies on", () => {
  it("IP-SEC-10: a self-managed adult student can act for their own booking", async () => {
    const student = await createSelfManagedStudent();
    expect(await canActForStudent(db, student.user.id, student.studentProfile.id)).toBe(true);
  });

  it("IP-SEC-8: an authorized ACTIVE guardian can act for their managed minor", async () => {
    const family = await createGuardianManagedFamily("ACTIVE");
    expect(await canActForStudent(db, family.parentUser.id, family.studentProfile.id)).toBe(true);
  });

  it("IP-SEC-9/IP-SEC-7: a REVOKED guardian can no longer act for the minor (must not resurrect access)", async () => {
    const family = await createGuardianManagedFamily("REVOKED");
    expect(await canActForStudent(db, family.parentUser.id, family.studentProfile.id)).toBe(false);
  });

  it("IP-SEC-6/7: an unrelated user cannot act for someone else's student/booking", async () => {
    const family = await createGuardianManagedFamily("ACTIVE");
    const unrelated = await createSelfManagedStudent();
    expect(await canActForStudent(db, unrelated.user.id, family.studentProfile.id)).toBe(false);
  });
});
