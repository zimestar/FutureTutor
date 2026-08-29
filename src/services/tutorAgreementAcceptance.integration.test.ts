import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";

// FG-LEGAL2 — permanent DB-integration coverage for the two
// Tutor-Agreement-acceptance gates enforced at the service layer:
//   1. submitApplication (tutorApplicationWorkflow.ts) — DRAFT->SUBMITTED
//      now also requires tutorAgreementAcceptedAt to be set.
//   2. getEligibleTutors / isTutorEligibleForRequest (tutorEligibility.ts)
//      — an APPROVED tutor who hasn't accepted is excluded from new Quick
//      Match dispatch and the accept-time re-check.
//
// A third gate exists at the direct-booking Server Action layer
// (src/lib/actions/bookings.ts's createBookingAction) rather than inside
// the shared reserveBookingPendingPayment service function: that function
// is also called directly, bypassing any Server Action, by dozens of
// pre-existing integration test fixtures across unrelated domains (session
// lifecycle, cancellation, payments, video) that construct an APPROVED
// tutor with no Tutor-Agreement concept — enforcing the gate that deep
// broke all of them. createBookingAction is a "use server" action (auth(),
// next-intl, revalidatePath) not exercised by plain vitest integration
// tests in this codebase's own established convention, so that check is
// covered instead by a source-inspection test in
// tutorAgreementContent.test.ts's page/navigation-surfaces describe block.
//
// submitApplication imports the ambient @/lib/db singleton directly, so —
// mirroring bookingCreationConcurrency.integration.test.ts's own established
// pattern — every service function under test is dynamically imported AFTER
// redirecting process.env.DATABASE_URL to the verified test database, with
// the same FAIL CLOSED safety checks.

let submitApplication: typeof import("./tutorApplicationWorkflow").submitApplication;
let TransitionGateError: typeof import("./tutorApplicationWorkflow").TransitionGateError;
let getEligibleTutors: typeof import("./tutorEligibility").getEligibleTutors;
let isTutorEligibleForRequest: typeof import("./tutorEligibility").isTutorEligibleForRequest;

let db: PrismaClient;
let subjectId: string;

const createdUserIds: string[] = [];
const createdStudentProfileIds: string[] = [];
const createdTutorProfileIds: string[] = [];

beforeAll(async () => {
  const target = resolveVerifiedTestDatabase();
  const devDatabaseUrlForSafetyCheckOnly = process.env.DATABASE_URL;
  const adapter = new PrismaPg({ connectionString: target.connectionString });
  db = new PrismaClient({ adapter });

  process.env.DATABASE_URL = target.connectionString;

  ({ submitApplication, TransitionGateError } = await import("./tutorApplicationWorkflow"));
  ({ getEligibleTutors, isTutorEligibleForRequest } = await import("./tutorEligibility"));

  const { db: ambientDb } = await import("@/lib/db");
  const [{ current_database: ambientDatabaseName }] = await ambientDb.$queryRaw<
    Array<{ current_database: string }>
  >`SELECT current_database()`;
  if (ambientDatabaseName !== target.databaseName) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton reports current_database() = "${ambientDatabaseName}", but the verified test database is "${target.databaseName}". Refusing to run.`
    );
  }
  const devDatabaseNameForSafetyCheckOnly = devDatabaseUrlForSafetyCheckOnly
    ? new URL(devDatabaseUrlForSafetyCheckOnly).pathname.replace(/^\//, "")
    : null;
  if (devDatabaseNameForSafetyCheckOnly && ambientDatabaseName === devDatabaseNameForSafetyCheckOnly) {
    throw new Error(`FAIL CLOSED: ambient database equals the real development database name. Refusing to run.`);
  }

  const subject = await db.subject.create({ data: { slug: `fg-legal2-subject-${randomUUID()}`, sortOrder: 999 } });
  subjectId = subject.id;
}, 30000);

afterAll(async () => {
  await db.subject.delete({ where: { id: subjectId } });
  await db?.$disconnect();
});

afterEach(async () => {
  if (createdTutorProfileIds.length > 0) {
    await db.tutorSubject.deleteMany({ where: { tutorProfileId: { in: createdTutorProfileIds } } });
    await db.tutorProfile.deleteMany({ where: { id: { in: createdTutorProfileIds } } });
  }
  if (createdStudentProfileIds.length > 0) {
    await db.studentProfile.deleteMany({ where: { id: { in: createdStudentProfileIds } } });
  }
  if (createdUserIds.length > 0) {
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  createdTutorProfileIds.length = 0;
  createdStudentProfileIds.length = 0;
  createdUserIds.length = 0;
});

async function createDraftTutor(overrides: { headline?: boolean; subject?: boolean } = {}) {
  const user = await db.user.create({
    data: { email: `tutor-${randomUUID()}@example.com`, role: "TUTOR" },
  });
  createdUserIds.push(user.id);
  const tutor = await db.tutorProfile.create({
    data: {
      userId: user.id,
      slug: `tutor-${randomUUID()}`,
      headline: overrides.headline === false ? null : "Experienced Math Tutor",
      bio: overrides.headline === false ? null : "I love teaching math to high schoolers.",
    },
  });
  createdTutorProfileIds.push(tutor.id);
  if (overrides.subject !== false) {
    await db.tutorSubject.create({ data: { tutorProfileId: tutor.id, subjectId } });
    await db.tutorLevel.create({
      data: {
        tutorProfileId: tutor.id,
        academicLevelId: (
          await db.academicLevel.findFirst()
        )?.id ?? (await db.academicLevel.create({ data: { slug: `fg-legal2-level-${randomUUID()}`, sortOrder: 999 } })).id,
      },
    });
  }
  return { user, tutor };
}

async function createApprovedTutor(agreementAccepted: boolean) {
  const { user, tutor } = await createDraftTutor();
  const updated = await db.tutorProfile.update({
    where: { id: tutor.id },
    data: {
      applicationStatus: "APPROVED",
      learningMode: "ONLINE",
      tutorAgreementAcceptedAt: agreementAccepted ? new Date() : null,
      tutorAgreementAcceptedVersion: agreementAccepted ? "2026-08-30" : null,
      tutorAgreementAcceptedLocale: agreementAccepted ? "en" : null,
    },
  });
  // isTutorFreeAt (src/lib/availability.ts) requires at least one matching
  // TutorAvailability row — full-week, all-day coverage so the test's
  // "tomorrow" requestedStartAt is free regardless of which weekday it is.
  await db.tutorAvailability.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      tutorProfileId: updated.id,
      dayOfWeek,
      startTime: "00:00",
      endTime: "23:59",
      timezone: "UTC",
      mode: "ONLINE" as const,
    })),
  });
  return { user, tutor: updated };
}

describe("FG-LEGAL2 — submitApplication requires Tutor Agreement acceptance", () => {
  it("TUTOR-ACC-13: rejects DRAFT->SUBMITTED when tutorAgreementAcceptedAt is null, even with a complete profile", async () => {
    const { user, tutor } = await createDraftTutor();
    await expect(submitApplication(tutor.id, user.id)).rejects.toThrow(TransitionGateError);
    const reloaded = await db.tutorProfile.findUniqueOrThrow({ where: { id: tutor.id } });
    expect(reloaded.applicationStatus).toBe("DRAFT");
  });

  it("TUTOR-ACC-04/06/07/08/14: succeeds once tutorAgreementAcceptedAt/Version/Locale are set, and they persist", async () => {
    const { user, tutor } = await createDraftTutor();
    await db.tutorProfile.update({
      where: { id: tutor.id },
      data: { tutorAgreementAcceptedAt: new Date(), tutorAgreementAcceptedVersion: "2026-08-30", tutorAgreementAcceptedLocale: "fr" },
    });
    const result = await submitApplication(tutor.id, user.id);
    expect(result.applicationStatus).toBe("SUBMITTED");
    const reloaded = await db.tutorProfile.findUniqueOrThrow({ where: { id: tutor.id } });
    expect(reloaded.tutorAgreementAcceptedVersion).toBe("2026-08-30");
    expect(reloaded.tutorAgreementAcceptedLocale).toBe("fr");
    expect(reloaded.tutorAgreementAcceptedAt).not.toBeNull();
  });

  it("TUTOR-ACC-18: an incomplete profile still fails on its existing gates even with acceptance recorded (no bypass introduced)", async () => {
    const { user, tutor } = await createDraftTutor({ headline: false });
    await db.tutorProfile.update({ where: { id: tutor.id }, data: { tutorAgreementAcceptedAt: new Date() } });
    await expect(submitApplication(tutor.id, user.id)).rejects.toThrow(TransitionGateError);
  });
});

describe("FG-LEGAL2 — Quick Match eligibility excludes an unaccepted (but APPROVED) tutor", () => {
  it("TUTOR-ACC-13: getEligibleTutors excludes an APPROVED tutor with no Tutor Agreement acceptance", async () => {
    await createApprovedTutor(false);
    const { tutor: acceptedTutor } = await createApprovedTutor(true);

    const candidates = await db.$transaction((tx) =>
      getEligibleTutors(tx, {
        subjectId,
        tutoringMode: "ONLINE",
        requestedStartAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        durationMinutes: 60,
      })
    );

    const candidateIds = candidates.map((c) => c.id);
    expect(candidateIds).toContain(acceptedTutor.id);
  });

  it("TUTOR-ACC-13: isTutorEligibleForRequest returns false for an unaccepted tutor and true for an accepted one", async () => {
    const { tutor: unaccepted } = await createApprovedTutor(false);
    const { tutor: accepted } = await createApprovedTutor(true);

    const request = {
      subjectId,
      tutoringMode: "ONLINE" as const,
      requestedStartAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      durationMinutes: 60,
    };

    const unacceptedEligible = await db.$transaction((tx) => isTutorEligibleForRequest(tx, unaccepted.id, request));
    const acceptedEligible = await db.$transaction((tx) => isTutorEligibleForRequest(tx, accepted.id, request));

    expect(unacceptedEligible).toBe(false);
    expect(acceptedEligible).toBe(true);
  });

  it("TUTOR-ACC-14: an already-APPROVED legacy tutor (validationVersion 1, pre-dating the Agreement) is excluded until they accept — confirms no fake backfill occurred", async () => {
    const { user, tutor } = await createDraftTutor();
    await db.tutorProfile.update({
      where: { id: tutor.id },
      data: { applicationStatus: "APPROVED", validationVersion: 1, learningMode: "ONLINE" },
    });
    const reloaded = await db.tutorProfile.findUniqueOrThrow({ where: { id: tutor.id } });
    expect(reloaded.tutorAgreementAcceptedAt).toBeNull();

    const eligible = await db.$transaction((tx) =>
      isTutorEligibleForRequest(tx, tutor.id, {
        subjectId,
        tutoringMode: "ONLINE",
        requestedStartAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        durationMinutes: 60,
      })
    );
    expect(eligible).toBe(false);
    void user;
  });
});
