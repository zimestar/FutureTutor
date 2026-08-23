import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";
import { withSerializableRetry } from "@/lib/serializableRetry";
import type { VideoProviderAdapter, VideoParticipantRole } from "./videoProvider";

// VIDEO-1A — join authorization + token issuance integration coverage.
// Mirrors sessionNoShowConvergence.integration.test.ts's exact DB-target-
// redirection technique. Never calls a real Daily API. All authorization
// re-checks (student/tutor/guardian/revoked-guardian/unrelated actors/admin/
// cancelled booking/IN_PERSON booking/window boundaries) run against the
// REAL resolveStudentCapabilities/resolveVideoJoinAuthority stack and a real
// database — only the video PROVIDER is faked.

vi.mock("@/lib/stripe", () => ({ getStripeClient: vi.fn() }));

let createCustomerPriceQuote: typeof import("./customerPricing").createCustomerPriceQuote;
let createTutorPayoutQuote: typeof import("./tutorPayout").createTutorPayoutQuote;
let reserveBookingPendingPayment: typeof import("./bookingCreation").reserveBookingPendingPayment;
let convergeToCaptured: typeof import("./payments").convergeToCaptured;
let cancelBookingWithRefund: typeof import("./cancellationPolicy").cancelBookingWithRefund;
let requestVideoJoinToken: typeof import("./videoJoin").requestVideoJoinToken;
let confirmVideoParticipantJoined: typeof import("./videoJoin").confirmVideoParticipantJoined;
let VideoSessionNotFoundError: typeof import("./videoJoin").VideoSessionNotFoundError;
let UnauthorizedVideoParticipantError: typeof import("./videoJoin").UnauthorizedVideoParticipantError;
let BookingNotConfirmedError: typeof import("./videoJoin").BookingNotConfirmedError;
let VideoNotSupportedForBookingError: typeof import("./videoJoin").VideoNotSupportedForBookingError;
let VideoTooEarlyError: typeof import("./videoJoin").VideoTooEarlyError;
let VideoWindowClosedError: typeof import("./videoJoin").VideoWindowClosedError;

let db: PrismaClient;
let subjectId: string;
let academicLevelId: string;

const createdUserIds: string[] = [];
const createdStudentProfileIds: string[] = [];
const createdParentProfileIds: string[] = [];
const createdRelationshipIds: string[] = [];
const createdTutorProfileIds: string[] = [];
const createdCustomerQuoteIds: string[] = [];
const createdTutorPayoutQuoteIds: string[] = [];
const createdPaymentIds: string[] = [];
const createdBookingIds: string[] = [];

const DEFAULT_TEST_START_AT = new Date(Date.now() + 5 * 60 * 1000);

beforeAll(async () => {
  const target = resolveVerifiedTestDatabase();
  const devDatabaseUrlForSafetyCheckOnly = process.env.DATABASE_URL;
  const adapter = new PrismaPg({ connectionString: target.connectionString });
  db = new PrismaClient({ adapter });

  process.env.DATABASE_URL = target.connectionString;

  ({ createCustomerPriceQuote } = await import("./customerPricing"));
  ({ createTutorPayoutQuote } = await import("./tutorPayout"));
  ({ reserveBookingPendingPayment } = await import("./bookingCreation"));
  ({ convergeToCaptured } = await import("./payments"));
  ({ cancelBookingWithRefund } = await import("./cancellationPolicy"));
  ({
    requestVideoJoinToken,
    confirmVideoParticipantJoined,
    VideoSessionNotFoundError,
    UnauthorizedVideoParticipantError,
    BookingNotConfirmedError,
    VideoNotSupportedForBookingError,
    VideoTooEarlyError,
    VideoWindowClosedError,
  } = await import("./videoJoin"));

  const { db: ambientDb } = await import("@/lib/db");
  const [{ current_database: ambientDatabaseName }] = await ambientDb.$queryRaw<
    Array<{ current_database: string }>
  >`SELECT current_database()`;
  if (ambientDatabaseName !== target.databaseName) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton reports current_database() = "${ambientDatabaseName}", but the verified test database is "${target.databaseName}". Refusing to run any video join integration test.`
    );
  }
  const devDatabaseNameForSafetyCheckOnly = devDatabaseUrlForSafetyCheckOnly
    ? new URL(devDatabaseUrlForSafetyCheckOnly).pathname.replace(/^\//, "")
    : null;
  if (devDatabaseNameForSafetyCheckOnly && ambientDatabaseName === devDatabaseNameForSafetyCheckOnly) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton's current_database() ("${ambientDatabaseName}") equals the real development database name. Refusing to run any video join integration test.`
    );
  }

  const subject = await db.subject.create({ data: { slug: `vjoin-it-subject-${randomUUID()}`, sortOrder: 999 } });
  subjectId = subject.id;
  const level = await db.academicLevel.create({ data: { slug: `vjoin-it-level-${randomUUID()}`, sortOrder: 999 } });
  academicLevelId = level.id;

  const existingSettings = await db.marketplacePricingSettings.findFirst();
  if (!existingSettings) await db.marketplacePricingSettings.create({ data: {} });

  await db.customerBasePriceRule.create({
    data: { subjectId, academicLevelId: null, baseDurationMinutes: 60, basePriceCents: 10000, pricingVersion: "CUSTOMER_PRICING_V1" },
  });
  await db.tutorBasePayoutRule.create({
    data: { tutorTier: "NEW", subjectId, academicLevelId: null, baseDurationMinutes: 60, payoutCents: 6000, payoutVersion: "TUTOR_PAYOUT_V1" },
  });
});

afterAll(async () => {
  await db.tutorBasePayoutRule.deleteMany({ where: { subjectId } });
  await db.customerBasePriceRule.deleteMany({ where: { subjectId } });
  await db.academicLevel.delete({ where: { id: academicLevelId } });
  await db.subject.delete({ where: { id: subjectId } });
  await db?.$disconnect();
});

afterEach(async () => {
  const { getStripeClient } = await import("@/lib/stripe");
  vi.mocked(getStripeClient).mockReset();
  if (createdBookingIds.length > 0) {
    await db.auditLog.deleteMany({ where: { entityId: { in: createdBookingIds } } });
    await db.refund.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
    await db.tutorEarning.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
    await db.session_.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
    await db.bookingStatusHistory.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
    await db.booking.deleteMany({ where: { id: { in: createdBookingIds } } });
    createdBookingIds.length = 0;
  }
  if (createdPaymentIds.length > 0) {
    await db.paymentAttempt.deleteMany({ where: { paymentId: { in: createdPaymentIds } } });
    await db.payment.deleteMany({ where: { id: { in: createdPaymentIds } } });
    createdPaymentIds.length = 0;
  }
  if (createdTutorPayoutQuoteIds.length > 0) {
    await db.tutorPayoutQuote.deleteMany({ where: { id: { in: createdTutorPayoutQuoteIds } } });
    createdTutorPayoutQuoteIds.length = 0;
  }
  if (createdCustomerQuoteIds.length > 0) {
    await db.customerPriceQuote.deleteMany({ where: { id: { in: createdCustomerQuoteIds } } });
    createdCustomerQuoteIds.length = 0;
  }
  if (createdTutorProfileIds.length > 0) {
    await db.tutorProfile.deleteMany({ where: { id: { in: createdTutorProfileIds } } });
    createdTutorProfileIds.length = 0;
  }
  if (createdRelationshipIds.length > 0) {
    await db.parentStudentRelationship.deleteMany({ where: { id: { in: createdRelationshipIds } } });
    createdRelationshipIds.length = 0;
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
    await db.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
});

function uniqueEmail(prefix: string) {
  return `vjoin-it-${prefix}-${randomUUID()}@futuretutor.test`;
}

async function createTutorUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("tutor"), role: "TUTOR" } });
  createdUserIds.push(user.id);
  const tutorProfile = await db.tutorProfile.create({
    data: { userId: user.id, slug: `vjoin-it-tutor-${randomUUID()}`, applicationStatus: "APPROVED", payoutTier: "NEW", learningMode: "BOTH" },
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

async function createGuardianManagedStudentWithParent(relationshipStatus: "ACTIVE" | "REVOKED" = "ACTIVE") {
  const studentProfile = await db.studentProfile.create({
    data: { firstName: "Child", lastName: "Student", managementMode: "GUARDIAN_MANAGED" },
  });
  createdStudentProfileIds.push(studentProfile.id);
  const parentUser = await db.user.create({ data: { email: uniqueEmail("parent"), role: "PARENT" } });
  createdUserIds.push(parentUser.id);
  const parentProfile = await db.parentProfile.create({ data: { userId: parentUser.id, firstName: "Test", lastName: "Parent" } });
  createdParentProfileIds.push(parentProfile.id);
  const relationship = await db.parentStudentRelationship.create({
    data: { parentProfileId: parentProfile.id, studentProfileId: studentProfile.id, status: relationshipStatus, createdByUserId: parentUser.id },
  });
  createdRelationshipIds.push(relationship.id);
  return { parentUser, parentProfile, studentProfile };
}

async function setupConfirmedBooking(overrides: { startAt?: Date; mode?: "ONLINE" | "IN_PERSON" | "BOTH" } = {}) {
  const startAt = overrides.startAt ?? DEFAULT_TEST_START_AT;
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
  const mode = overrides.mode ?? "ONLINE";
  const tutor = await createTutorUser();
  const student = await createSelfManagedStudent();

  const quote = await createCustomerPriceQuote(
    { createdByUserId: student.user.id, studentProfileId: student.studentProfile.id, subjectId, academicLevelId, tutoringMode: mode, durationMinutes: 60, requestedStartAt: startAt },
    db
  );
  createdCustomerQuoteIds.push(quote.id);
  const payoutQuote = await createTutorPayoutQuote(
    { tutorProfileId: tutor.tutorProfile.id, subjectId, academicLevelId, tutoringMode: mode, durationMinutes: 60, requestedStartAt: startAt },
    quote.id,
    db
  );
  createdTutorPayoutQuoteIds.push(payoutQuote.id);
  const payment = await db.payment.create({
    data: { id: randomUUID(), customerPriceQuoteId: quote.id, payerUserId: student.user.id, amountCents: quote.totalCents, currency: quote.currency, status: "PENDING" },
  });
  createdPaymentIds.push(payment.id);

  const booking = await withSerializableRetry(() =>
    db.$transaction(
      (tx) =>
        reserveBookingPendingPayment(tx, {
          actorUserId: student.user.id,
          studentProfileId: student.studentProfile.id,
          tutorProfileId: tutor.tutorProfile.id,
          subjectId,
          academicLevelId,
          startAt,
          endAt,
          timezone: "America/Toronto",
          mode,
          paymentId: payment.id,
          customerPriceQuoteId: quote.id,
          tutorPayoutQuoteId: payoutQuote.id,
          tutoringRequestId: null,
        }),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  );
  createdBookingIds.push(booking.id);

  await db.payment.update({ where: { id: payment.id }, data: { status: "AUTHORIZED", stripePaymentIntentId: `pi_fake_${randomUUID()}` } });
  await convergeToCaptured(payment.id);

  const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
  return { tutor, student, booking, session };
}

function makeFakeProvider(): VideoProviderAdapter & { __tokenCalls: Array<{ role: VideoParticipantRole; participantExternalId: string }> } {
  let nextId = 1;
  const tokenCalls: Array<{ role: VideoParticipantRole; participantExternalId: string }> = [];
  return {
    name: "DAILY",
    async createRoom() {
      return { providerRoomId: `ft-fake-room-${nextId++}` };
    },
    async createParticipantToken(input) {
      tokenCalls.push({ role: input.role, participantExternalId: input.participantExternalId });
      return { token: `fake-token-${randomUUID()}`, expiresAt: input.expiresAt };
    },
    async revokeRoomAccess() {},
    get __tokenCalls() {
      return tokenCalls;
    },
  };
}

describe("requestVideoJoinToken — authorization matrix", () => {
  it("STUDENT: the booking's own self-managed student is authorized", async () => {
    const { student, booking } = await setupConfirmedBooking();
    const provider = makeFakeProvider();
    const result = await requestVideoJoinToken(booking.id, student.user.id, provider, { actorRole: "STUDENT" });
    expect(result.participantRole).toBe("STUDENT");
    expect(provider.__tokenCalls[0]).toMatchObject({ role: "STUDENT", participantExternalId: student.user.id });
  });

  it("TUTOR: the booking's own tutor is authorized", async () => {
    const { tutor, booking } = await setupConfirmedBooking();
    const provider = makeFakeProvider();
    const result = await requestVideoJoinToken(booking.id, tutor.user.id, provider, { actorRole: "TUTOR" });
    expect(result.participantRole).toBe("TUTOR");
  });

  it("ACTIVE guardian: authorized as OBSERVER", async () => {
    const tutor = await createTutorUser();
    const { parentUser, studentProfile } = await createGuardianManagedStudentWithParent("ACTIVE");
    const startAt = DEFAULT_TEST_START_AT;
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
    const quote = await createCustomerPriceQuote(
      { createdByUserId: parentUser.id, studentProfileId: studentProfile.id, subjectId, academicLevelId, tutoringMode: "ONLINE", durationMinutes: 60, requestedStartAt: startAt },
      db
    );
    createdCustomerQuoteIds.push(quote.id);
    const payoutQuote = await createTutorPayoutQuote(
      { tutorProfileId: tutor.tutorProfile.id, subjectId, academicLevelId, tutoringMode: "ONLINE", durationMinutes: 60, requestedStartAt: startAt },
      quote.id,
      db
    );
    createdTutorPayoutQuoteIds.push(payoutQuote.id);
    const payment = await db.payment.create({
      data: { id: randomUUID(), customerPriceQuoteId: quote.id, payerUserId: parentUser.id, amountCents: quote.totalCents, currency: quote.currency, status: "PENDING" },
    });
    createdPaymentIds.push(payment.id);
    const booking = await withSerializableRetry(() =>
      db.$transaction(
        (tx) =>
          reserveBookingPendingPayment(tx, {
            actorUserId: parentUser.id,
            studentProfileId: studentProfile.id,
            tutorProfileId: tutor.tutorProfile.id,
            subjectId,
            academicLevelId,
            startAt,
            endAt,
            timezone: "America/Toronto",
            mode: "ONLINE",
            paymentId: payment.id,
            customerPriceQuoteId: quote.id,
            tutorPayoutQuoteId: payoutQuote.id,
            tutoringRequestId: null,
          }),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      )
    );
    createdBookingIds.push(booking.id);
    await db.payment.update({ where: { id: payment.id }, data: { status: "AUTHORIZED", stripePaymentIntentId: `pi_fake_${randomUUID()}` } });
    await convergeToCaptured(payment.id);

    const provider = makeFakeProvider();
    const result = await requestVideoJoinToken(booking.id, parentUser.id, provider, { actorRole: "PARENT" });
    expect(result.participantRole).toBe("OBSERVER");
    expect(provider.__tokenCalls[0].role).toBe("OBSERVER");
  });

  it("DENIED: a REVOKED guardian", async () => {
    const { studentProfile } = await createGuardianManagedStudentWithParent("REVOKED");
    // Re-fetch the revoked parent user id via the relationship we just created.
    const relationship = await db.parentStudentRelationship.findFirstOrThrow({ where: { studentProfileId: studentProfile.id } });
    const parentProfile = await db.parentProfile.findUniqueOrThrow({ where: { id: relationship.parentProfileId } });
    const tutor = await createTutorUser();

    // Booking must be created by SOME authorized actor — since the guardian
    // is revoked, seed the booking directly against the DB rather than
    // through the actor-checked reservation path (this test is about join
    // authorization, not booking-creation authorization).
    const booking = await seedConfirmedBookingDirect(tutor.tutorProfile.id, studentProfile.id);

    const provider = makeFakeProvider();
    await expect(
      requestVideoJoinToken(booking.id, parentProfile.userId!, provider, { actorRole: "PARENT" })
    ).rejects.toThrow(UnauthorizedVideoParticipantError);
  });

  it("DENIED: an unrelated parent", async () => {
    const { booking } = await setupConfirmedBooking();
    const unrelatedParent = await db.user.create({ data: { email: uniqueEmail("unrelated-parent"), role: "PARENT" } });
    createdUserIds.push(unrelatedParent.id);
    await db.parentProfile
      .create({ data: { userId: unrelatedParent.id, firstName: "Unrelated", lastName: "Parent" } })
      .then((p) => createdParentProfileIds.push(p.id));

    const provider = makeFakeProvider();
    await expect(
      requestVideoJoinToken(booking.id, unrelatedParent.id, provider, { actorRole: "PARENT" })
    ).rejects.toThrow(UnauthorizedVideoParticipantError);
  });

  it("DENIED: an unrelated student", async () => {
    const { booking } = await setupConfirmedBooking();
    const unrelated = await createSelfManagedStudent();
    const provider = makeFakeProvider();
    await expect(
      requestVideoJoinToken(booking.id, unrelated.user.id, provider, { actorRole: "STUDENT" })
    ).rejects.toThrow(UnauthorizedVideoParticipantError);
  });

  it("DENIED: an unrelated tutor", async () => {
    const { booking } = await setupConfirmedBooking();
    const unrelatedTutor = await createTutorUser();
    const provider = makeFakeProvider();
    await expect(
      requestVideoJoinToken(booking.id, unrelatedTutor.user.id, provider, { actorRole: "TUTOR" })
    ).rejects.toThrow(UnauthorizedVideoParticipantError);
  });

  it("DENIED: ADMIN — no silent/automatic admin join in VIDEO-1", async () => {
    const { booking } = await setupConfirmedBooking();
    const adminUser = await db.user.create({ data: { email: uniqueEmail("admin"), role: "ADMIN" } });
    createdUserIds.push(adminUser.id);
    const provider = makeFakeProvider();
    await expect(
      requestVideoJoinToken(booking.id, adminUser.id, provider, { actorRole: "ADMIN" })
    ).rejects.toThrow(UnauthorizedVideoParticipantError);
  });

  it("BOOKING_NOT_CONFIRMED-equivalent: a cancelled booking is denied", async () => {
    const { student, tutor, booking } = await setupConfirmedBooking();
    await cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" });
    const provider = makeFakeProvider();
    await expect(
      requestVideoJoinToken(booking.id, tutor.user.id, provider, { actorRole: "TUTOR" })
    ).rejects.toThrow(BookingNotConfirmedError);
  });

  it("VIDEO_NOT_SUPPORTED_FOR_BOOKING: an IN_PERSON booking is denied", async () => {
    const { student, booking } = await setupConfirmedBooking({ mode: "IN_PERSON" });
    const provider = makeFakeProvider();
    await expect(
      requestVideoJoinToken(booking.id, student.user.id, provider, { actorRole: "STUDENT" })
    ).rejects.toThrow(VideoNotSupportedForBookingError);
  });

  it("accepts a BOTH-mode booking", async () => {
    const { student, booking } = await setupConfirmedBooking({ mode: "BOTH" });
    const provider = makeFakeProvider();
    const result = await requestVideoJoinToken(booking.id, student.user.id, provider, { actorRole: "STUDENT" });
    expect(result.participantRole).toBe("STUDENT");
  });

  it("VIDEO_TOO_EARLY: rejects a join attempt before the window opens", async () => {
    const farFuture = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const { student, booking } = await setupConfirmedBooking({ startAt: farFuture });
    const provider = makeFakeProvider();
    await expect(
      requestVideoJoinToken(booking.id, student.user.id, provider, { actorRole: "STUDENT" })
    ).rejects.toThrow(VideoTooEarlyError);
  });

  it("VIDEO_WINDOW_CLOSED: rejects a join attempt well after the grace window", async () => {
    const past = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const { student, booking } = await setupConfirmedBooking({ startAt: past });
    const provider = makeFakeProvider();
    await expect(
      requestVideoJoinToken(booking.id, student.user.id, provider, { actorRole: "STUDENT", clock: () => new Date() })
    ).rejects.toThrow(VideoWindowClosedError);
  });

  it("throws VideoSessionNotFoundError for a nonexistent booking", async () => {
    const provider = makeFakeProvider();
    await expect(
      requestVideoJoinToken("nonexistent-booking-id", "some-user-id", provider, { actorRole: "STUDENT" })
    ).rejects.toThrow(VideoSessionNotFoundError);
  });
});

describe("requestVideoJoinToken — token mechanics and financial firewall", () => {
  it("provisions the room just-in-time if the sweep has not yet run, without creating a duplicate room", async () => {
    const { student, booking, session } = await setupConfirmedBooking();
    expect((await db.session_.findUniqueOrThrow({ where: { id: session.id } })).providerRoomId).toBeNull();
    const provider = makeFakeProvider();

    await requestVideoJoinToken(booking.id, student.user.id, provider, { actorRole: "STUDENT" });
    const afterFirst = await db.session_.findUniqueOrThrow({ where: { id: session.id } });
    expect(afterFirst.providerRoomId).not.toBeNull();

    await requestVideoJoinToken(booking.id, student.user.id, provider, { actorRole: "STUDENT" });
    const afterSecond = await db.session_.findUniqueOrThrow({ where: { id: session.id } });
    expect(afterSecond.providerRoomId).toBe(afterFirst.providerRoomId); // same room, not a second one
  });

  it("does not persist the issued token anywhere", async () => {
    const { student, booking } = await setupConfirmedBooking();
    const provider = makeFakeProvider();
    const result = await requestVideoJoinToken(booking.id, student.user.id, provider, { actorRole: "STUDENT" });

    const bookingRow = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    const sessionRow = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
    expect(JSON.stringify(bookingRow)).not.toContain(result.token);
    expect(JSON.stringify(sessionRow)).not.toContain(result.token);
  });

  it("re-checks authorization on every call — does not cache a prior grant across a status change", async () => {
    const { student, tutor, booking } = await setupConfirmedBooking();
    const provider = makeFakeProvider();

    await requestVideoJoinToken(booking.id, student.user.id, provider, { actorRole: "STUDENT" }); // succeeds while CONFIRMED
    await cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" });

    await expect(
      requestVideoJoinToken(booking.id, tutor.user.id, provider, { actorRole: "TUTOR" })
    ).rejects.toThrow(BookingNotConfirmedError);
  });

  it("never mutates Booking/Payment/TutorEarning state as a side effect of issuing a token", async () => {
    const { student, booking } = await setupConfirmedBooking();
    const provider = makeFakeProvider();

    await requestVideoJoinToken(booking.id, student.user.id, provider, { actorRole: "STUDENT" });

    const bookingAfter = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(bookingAfter.status).toBe("CONFIRMED");
    const payment = await db.payment.findFirst({ where: { customerPriceQuote: { studentProfileId: student.studentProfile.id } } });
    expect(payment?.status).toBe("CAPTURED"); // unchanged from setup
    const earning = await db.tutorEarning.findUnique({ where: { bookingId: booking.id } });
    expect(earning?.status).toBe("PENDING_ELIGIBLE"); // unchanged — token issuance never touches financial state
  });
});

describe("confirmVideoParticipantJoined — the actual-join signal, firewalled from token issuance", () => {
  it("does NOT record attendance merely because a token was requested", async () => {
    const { student, booking, session } = await setupConfirmedBooking();
    const provider = makeFakeProvider();

    await requestVideoJoinToken(booking.id, student.user.id, provider, { actorRole: "STUDENT" });

    const events = await db.sessionAttendanceEvent.findMany({ where: { sessionId: session.id } });
    expect(events).toHaveLength(0);
  });

  it("records ONLINE_ACTIVITY attendance for the student when explicitly confirmed", async () => {
    const { student, booking, session } = await setupConfirmedBooking();

    await confirmVideoParticipantJoined(booking.id, student.user.id, "STUDENT");

    const events = await db.sessionAttendanceEvent.findMany({ where: { sessionId: session.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ participantRole: "STUDENT", source: "ONLINE_ACTIVITY", eventType: "CHECK_IN" });
  });

  it("records ONLINE_ACTIVITY attendance for the tutor when explicitly confirmed", async () => {
    const { tutor, booking, session } = await setupConfirmedBooking();

    await confirmVideoParticipantJoined(booking.id, tutor.user.id, "TUTOR");

    const events = await db.sessionAttendanceEvent.findMany({ where: { sessionId: session.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ participantRole: "TUTOR", source: "ONLINE_ACTIVITY" });
  });

  it("never records attendance for a GUARDIAN_OBSERVER — an observing parent is neither party", async () => {
    const tutor = await createTutorUser();
    const { parentUser, studentProfile } = await createGuardianManagedStudentWithParent("ACTIVE");
    const booking = await seedConfirmedBookingDirect(tutor.tutorProfile.id, studentProfile.id);

    const result = await confirmVideoParticipantJoined(booking.id, parentUser.id, "PARENT");

    expect(result).toBeNull();
    const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
    const events = await db.sessionAttendanceEvent.findMany({ where: { sessionId: session.id } });
    expect(events).toHaveLength(0);
  });

  it("dual online confirmation still transitions Session_ SCHEDULED -> IN_PROGRESS via the existing state machine, unmodified", async () => {
    const { tutor, student, booking, session } = await setupConfirmedBooking();

    await confirmVideoParticipantJoined(booking.id, tutor.user.id, "TUTOR");
    let updated = await db.session_.findUniqueOrThrow({ where: { id: session.id } });
    expect(updated.status).toBe("SCHEDULED");

    await confirmVideoParticipantJoined(booking.id, student.user.id, "STUDENT");
    updated = await db.session_.findUniqueOrThrow({ where: { id: session.id } });
    expect(updated.status).toBe("IN_PROGRESS");
  });
});

/** Seeds a CONFIRMED Booking + SCHEDULED Session_ directly (bypassing the
 * actor-checked quote/payment reservation pipeline) for tests whose actor
 * is deliberately NOT authorized to have created the booking themselves
 * (e.g. a revoked guardian, an observing parent) — this file's join-
 * authorization tests care about JOIN authorization, not booking-creation
 * authorization, which is covered elsewhere. */
async function seedConfirmedBookingDirect(tutorProfileId: string, studentProfileId: string, startAt: Date = DEFAULT_TEST_START_AT) {
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
  const booking = await db.booking.create({
    data: {
      studentProfileId,
      tutorProfileId,
      subjectId,
      academicLevelId,
      startAt,
      endAt,
      timezone: "America/Toronto",
      mode: "ONLINE",
      status: "CONFIRMED",
      totalCents: 4600,
      currency: "CAD",
      platformFeeCentsSnapshot: 0,
    },
  });
  createdBookingIds.push(booking.id);
  await db.session_.create({ data: { bookingId: booking.id, status: "SCHEDULED" } });
  return booking;
}
