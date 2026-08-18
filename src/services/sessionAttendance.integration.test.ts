import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";

// Session Lifecycle Phase 2 — permanent DB-integration tests for the
// attendance/check-in foundation: SessionAttendanceEvent persistence,
// sessionAuthorization.ts's DB-backed resolve* wrappers, recordSessionCheckIn's
// full transactional behavior, and getSessionContext's read model. Mirrors
// sessionLifecyclePhase1.integration.test.ts / cancellationRefund.integration.test.ts's
// own DB-target-redirection technique exactly (resolveVerifiedTestDatabase,
// tracked-id cleanup arrays, ambient @/lib/db singleton redirected to
// futuretutor_test BEFORE any transitively-DB-touching module is imported).
// Concurrency/race scenarios live in the sibling
// sessionAttendanceConcurrency.integration.test.ts file.

vi.mock("@/lib/stripe", () => ({ getStripeClient: vi.fn() }));

import { getStripeClient } from "@/lib/stripe";

let createCustomerPriceQuote: typeof import("./customerPricing").createCustomerPriceQuote;
let createTutorPayoutQuote: typeof import("./tutorPayout").createTutorPayoutQuote;
let reserveBookingPendingPayment: typeof import("./bookingCreation").reserveBookingPendingPayment;
let convergeToCaptured: typeof import("./payments").convergeToCaptured;
let recordSessionCheckIn: typeof import("./sessionLifecycle").recordSessionCheckIn;
let getSessionContext: typeof import("./sessionLifecycle").getSessionContext;
let SessionCheckInNotAuthorizedError: typeof import("./sessionLifecycle").SessionCheckInNotAuthorizedError;
let SessionNotCheckInEligibleError: typeof import("./sessionLifecycle").SessionNotCheckInEligibleError;
let SessionCheckInTooEarlyError: typeof import("./sessionLifecycle").SessionCheckInTooEarlyError;
let SessionViewerNotAuthorizedError: typeof import("./sessionLifecycle").SessionViewerNotAuthorizedError;
let CHECK_IN_WINDOW_MS_BEFORE_START: typeof import("./sessionLifecycle").CHECK_IN_WINDOW_MS_BEFORE_START;

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

// 5 minutes in the future by default: far enough that a booking is still
// "not yet started" (satisfies H.8's now<startAt cancellation boundary,
// exercised in a couple of these tests), but close enough that it already
// falls INSIDE the 15-minute check-in eligibility window (window opens at
// startAt-15min = now-10min here) — so tests that don't care about the
// early-check-in-window boundary specifically can call recordSessionCheckIn
// with the real (uninjected) clock and still succeed. Tests that DO care
// about the window boundary pass their own explicit startAt override.
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
  ({
    recordSessionCheckIn,
    getSessionContext,
    SessionCheckInNotAuthorizedError,
    SessionNotCheckInEligibleError,
    SessionCheckInTooEarlyError,
    SessionViewerNotAuthorizedError,
    CHECK_IN_WINDOW_MS_BEFORE_START,
  } = await import("./sessionLifecycle"));

  const { db: ambientDb } = await import("@/lib/db");
  const [{ current_database: ambientDatabaseName }] = await ambientDb.$queryRaw<
    Array<{ current_database: string }>
  >`SELECT current_database()`;
  if (ambientDatabaseName !== target.databaseName) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton reports current_database() = "${ambientDatabaseName}", but the verified test database is "${target.databaseName}". Refusing to run any Session Lifecycle Phase 2 integration test.`
    );
  }
  const devDatabaseNameForSafetyCheckOnly = devDatabaseUrlForSafetyCheckOnly
    ? new URL(devDatabaseUrlForSafetyCheckOnly).pathname.replace(/^\//, "")
    : null;
  if (devDatabaseNameForSafetyCheckOnly && ambientDatabaseName === devDatabaseNameForSafetyCheckOnly) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton's current_database() ("${ambientDatabaseName}") equals the real development database name. Refusing to run any Session Lifecycle Phase 2 integration test.`
    );
  }

  const subject = await db.subject.create({ data: { slug: `sa-it-subject-${randomUUID()}`, sortOrder: 999 } });
  subjectId = subject.id;
  const level = await db.academicLevel.create({ data: { slug: `sa-it-level-${randomUUID()}`, sortOrder: 999 } });
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
  vi.mocked(getStripeClient).mockReset();
  if (createdBookingIds.length > 0) {
    await db.auditLog.deleteMany({ where: { entityId: { in: createdBookingIds } } });
    await db.refund.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
    await db.tutorEarning.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
    await db.session_.deleteMany({ where: { bookingId: { in: createdBookingIds } } }); // cascades SessionAttendanceEvent
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
  return `sa-it-${prefix}-${randomUUID()}@futuretutor.test`;
}

async function createTutorUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("tutor"), role: "TUTOR" } });
  createdUserIds.push(user.id);
  const tutorProfile = await db.tutorProfile.create({
    data: { userId: user.id, slug: `sa-it-tutor-${randomUUID()}`, applicationStatus: "APPROVED", payoutTier: "NEW", learningMode: "BOTH" },
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

async function createParentUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("parent"), role: "PARENT" } });
  createdUserIds.push(user.id);
  const parentProfile = await db.parentProfile.create({ data: { userId: user.id, firstName: "Test", lastName: "Parent" } });
  createdParentProfileIds.push(parentProfile.id);
  return { user, parentProfile };
}

async function createGuardianManagedChild(parentProfileId: string, status: "ACTIVE" | "REVOKED" = "ACTIVE") {
  const studentProfile = await db.studentProfile.create({
    data: { firstName: "Emma", lastName: "Kid", dateOfBirth: new Date("2015-01-01T00:00:00.000Z"), managementMode: "GUARDIAN_MANAGED", userId: null },
  });
  createdStudentProfileIds.push(studentProfile.id);
  const relationship = await db.parentStudentRelationship.create({
    data: { parentProfileId, studentProfileId: studentProfile.id, status },
  });
  createdRelationshipIds.push(relationship.id);
  return { studentProfile, relationship };
}

async function makeQuote(actorUserId: string, studentProfileId: string, requestedStartAt: Date = DEFAULT_TEST_START_AT) {
  const quote = await createCustomerPriceQuote(
    { createdByUserId: actorUserId, studentProfileId, subjectId, academicLevelId, tutoringMode: "ONLINE", durationMinutes: 60, requestedStartAt },
    db
  );
  createdCustomerQuoteIds.push(quote.id);
  return quote;
}

async function makePayoutQuote(tutorProfileId: string, customerQuoteId: string, requestedStartAt: Date = DEFAULT_TEST_START_AT) {
  const payoutQuote = await createTutorPayoutQuote(
    { tutorProfileId, subjectId, academicLevelId, tutoringMode: "ONLINE", durationMinutes: 60, requestedStartAt },
    customerQuoteId,
    db
  );
  createdTutorPayoutQuoteIds.push(payoutQuote.id);
  return payoutQuote;
}

async function makePayment(quoteId: string, payerUserId: string) {
  const quote = await db.customerPriceQuote.findUniqueOrThrow({ where: { id: quoteId } });
  const payment = await db.payment.create({
    data: { id: randomUUID(), customerPriceQuoteId: quoteId, payerUserId, amountCents: quote.totalCents, currency: quote.currency, status: "PENDING" },
  });
  createdPaymentIds.push(payment.id);
  return payment;
}

async function reserveBooking(params: {
  actorUserId: string;
  studentProfileId: string;
  tutorProfileId: string;
  customerPriceQuoteId: string;
  tutorPayoutQuoteId: string;
  paymentId: string;
  startAt?: Date;
}) {
  const startAt = params.startAt ?? DEFAULT_TEST_START_AT;
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
  const booking = await db.$transaction(
    (tx) =>
      reserveBookingPendingPayment(tx, {
        actorUserId: params.actorUserId,
        studentProfileId: params.studentProfileId,
        tutorProfileId: params.tutorProfileId,
        subjectId,
        academicLevelId,
        startAt,
        endAt,
        timezone: "America/Toronto",
        mode: "ONLINE",
        paymentId: params.paymentId,
        customerPriceQuoteId: params.customerPriceQuoteId,
        tutorPayoutQuoteId: params.tutorPayoutQuoteId,
        tutoringRequestId: null,
      }),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
  createdBookingIds.push(booking.id);
  return booking;
}

async function setupConfirmedCapturedBooking(overrides: {
  startAt?: Date;
  guardian?: boolean;
} = {}) {
  const tutor = await createTutorUser();
  let student: { user: { id: string } | null; studentProfile: { id: string } };
  let parent: { user: { id: string }; parentProfile: { id: string } } | null = null;
  let relationship: { id: string } | null = null;

  if (overrides.guardian) {
    parent = await createParentUser();
    const child = await createGuardianManagedChild(parent.parentProfile.id, "ACTIVE");
    student = { user: null, studentProfile: child.studentProfile };
    relationship = child.relationship;
  } else {
    const selfStudent = await createSelfManagedStudent();
    student = selfStudent;
  }

  const payerUserId = overrides.guardian ? parent!.user.id : student.user!.id;
  const quote = await makeQuote(payerUserId, student.studentProfile.id, overrides.startAt);
  const payoutQuote = await makePayoutQuote(tutor.tutorProfile.id, quote.id, overrides.startAt);
  const payment = await makePayment(quote.id, payerUserId);
  const booking = await reserveBooking({
    actorUserId: payerUserId,
    studentProfileId: student.studentProfile.id,
    tutorProfileId: tutor.tutorProfile.id,
    customerPriceQuoteId: quote.id,
    tutorPayoutQuoteId: payoutQuote.id,
    paymentId: payment.id,
    startAt: overrides.startAt,
  });
  await db.payment.update({
    where: { id: payment.id },
    data: { status: "AUTHORIZED", stripePaymentIntentId: `pi_fake_${randomUUID()}` },
  });
  await convergeToCaptured(payment.id);
  const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
  return { tutor, student, parent, relationship, quote, payoutQuote, payment: finalPayment, booking };
}

// ===========================================================================
// A. Authorization (DB-integration, exercising the IO wrappers end-to-end
// via recordSessionCheckIn)
// ===========================================================================
describe("Session Lifecycle Phase 2 — check-in authorization (integration)", () => {
  it("owning Tutor may check in as TUTOR", async () => {
    const { tutor, booking } = await setupConfirmedCapturedBooking();
    const result = await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" });
    expect(result.actorRole).toBe("TUTOR_OWNER");
  });

  it("wrong Tutor is rejected", async () => {
    const { booking } = await setupConfirmedCapturedBooking();
    const otherTutor = await createTutorUser();
    await expect(
      recordSessionCheckIn(booking.id, otherTutor.user.id, "TUTOR", { actorRole: "TUTOR" })
    ).rejects.toBeInstanceOf(SessionCheckInNotAuthorizedError);
  });

  it("SELF_MANAGED Student may check in as STUDENT", async () => {
    const { student, booking } = await setupConfirmedCapturedBooking();
    const result = await recordSessionCheckIn(booking.id, student.user!.id, "STUDENT", { actorRole: "STUDENT" });
    expect(result.actorRole).toBe("SELF_MANAGED_STUDENT");
  });

  it("GUARDIAN_MANAGED Parent (ACTIVE relationship) may check in as STUDENT for the learner", async () => {
    const { parent, booking } = await setupConfirmedCapturedBooking({ guardian: true });
    const result = await recordSessionCheckIn(booking.id, parent!.user.id, "STUDENT", { actorRole: "PARENT" });
    expect(result.actorRole).toBe("GUARDIAN");
  });

  it("Tutor may declare the (GUARDIAN_MANAGED) learner physically present", async () => {
    const { tutor, booking } = await setupConfirmedCapturedBooking({ guardian: true });
    const result = await recordSessionCheckIn(booking.id, tutor.user.id, "STUDENT", { actorRole: "TUTOR" });
    expect(result.actorRole).toBe("TUTOR_DECLARING_LEARNER");
  });

  it("Tutor may declare a SELF_MANAGED learner physically present too (Session-specific, not gated on management mode)", async () => {
    const { tutor, booking } = await setupConfirmedCapturedBooking();
    const result = await recordSessionCheckIn(booking.id, tutor.user.id, "STUDENT", { actorRole: "TUTOR" });
    expect(result.actorRole).toBe("TUTOR_DECLARING_LEARNER");
  });

  it("REVOKED guardian relationship is rejected", async () => {
    // Reservation requires ACTIVE financial authority (H.2's
    // canInitiatePaidBooking), so the booking must be created while ACTIVE
    // and only revoked afterward — mirroring
    // cancellationConcurrency.integration.test.ts's own
    // "guardian-revoked-mid-cancellation" setup exactly.
    const { parent, relationship, booking } = await setupConfirmedCapturedBooking({ guardian: true });
    await db.parentStudentRelationship.update({ where: { id: relationship!.id }, data: { status: "REVOKED" } });

    await expect(
      recordSessionCheckIn(booking.id, parent!.user.id, "STUDENT", { actorRole: "PARENT" })
    ).rejects.toBeInstanceOf(SessionCheckInNotAuthorizedError);
  });

  it("Unrelated Parent (no relationship at all) is rejected", async () => {
    const { booking } = await setupConfirmedCapturedBooking({ guardian: true });
    const unrelatedParent = await createParentUser();
    await expect(
      recordSessionCheckIn(booking.id, unrelatedParent.user.id, "STUDENT", { actorRole: "PARENT" })
    ).rejects.toBeInstanceOf(SessionCheckInNotAuthorizedError);
  });

  it("Unrelated Student (not self, not guardian) is rejected", async () => {
    const { booking } = await setupConfirmedCapturedBooking();
    const unrelatedStudent = await createSelfManagedStudent();
    await expect(
      recordSessionCheckIn(booking.id, unrelatedStudent.user.id, "STUDENT", { actorRole: "STUDENT" })
    ).rejects.toBeInstanceOf(SessionCheckInNotAuthorizedError);
  });

  it("Admin cannot perform check-in on behalf of a participant (never impersonates presence)", async () => {
    const { booking } = await setupConfirmedCapturedBooking();
    const admin = await db.user.create({ data: { email: uniqueEmail("admin"), role: "ADMIN" } });
    createdUserIds.push(admin.id);
    await expect(
      recordSessionCheckIn(booking.id, admin.id, "STUDENT", { actorRole: "ADMIN" })
    ).rejects.toBeInstanceOf(SessionCheckInNotAuthorizedError);
    await expect(
      recordSessionCheckIn(booking.id, admin.id, "TUTOR", { actorRole: "ADMIN" })
    ).rejects.toBeInstanceOf(SessionCheckInNotAuthorizedError);
  });
});

// ===========================================================================
// B. Evidence — actor vs participant distinction, server time, append-only,
// duplicate/repeat behavior, persisted source.
// ===========================================================================
describe("Session Lifecycle Phase 2 — attendance evidence (integration)", () => {
  it("actor vs subject distinction: Tutor recording learner presence persists participantRole=STUDENT, recordedByUserId=Tutor's own id", async () => {
    const { tutor, booking } = await setupConfirmedCapturedBooking({ guardian: true });
    const result = await recordSessionCheckIn(booking.id, tutor.user.id, "STUDENT", { actorRole: "TUTOR" });

    const event = await db.sessionAttendanceEvent.findUniqueOrThrow({ where: { id: result.attendanceEventId } });
    expect(event.participantRole).toBe("STUDENT");
    expect(event.recordedByUserId).toBe(tutor.user.id);
    expect(event.eventType).toBe("CHECK_IN");
    expect(event.source).toBe("IN_PERSON_MANUAL");
  });

  it("server time is authoritative: occurredAt equals the injected clock(), not real wall-clock time", async () => {
    const { tutor, booking } = await setupConfirmedCapturedBooking();
    const fakeNow = new Date("2026-08-20T17:58:00.000Z");
    const result = await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", {
      actorRole: "TUTOR",
      clock: () => fakeNow,
    });
    expect(result.occurredAt.getTime()).toBe(fakeNow.getTime());

    const event = await db.sessionAttendanceEvent.findUniqueOrThrow({ where: { id: result.attendanceEventId } });
    expect(event.occurredAt.getTime()).toBe(fakeNow.getTime());
  });

  it("a forged client-supplied timestamp cannot influence the persisted evidence (no such parameter exists on the function signature)", async () => {
    const { tutor, booking } = await setupConfirmedCapturedBooking();
    const before = Date.now();
    // recordSessionCheckIn's real type signature has no timestamp-input
    // field at all; simulate a hostile caller attempting to smuggle one in
    // anyway via `as any` — it must be silently ignored because the
    // function body never reads any such field, only clock().
    const forged = new Date("2020-01-01T00:00:00.000Z");
    const hostileOptions = { actorRole: "TUTOR" as const, occurredAt: forged, checkedInAt: forged, startedAt: forged };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", hostileOptions as any);
    const after = Date.now();

    expect(result.occurredAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.occurredAt.getTime()).toBeLessThanOrEqual(after);
    expect(result.occurredAt.getTime()).not.toBe(forged.getTime());
  });

  it("append-only: a second CHECK_IN for the same participant creates a NEW row, never rewrites the first", async () => {
    const { tutor, booking } = await setupConfirmedCapturedBooking();
    const first = await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", {
      actorRole: "TUTOR",
      clock: () => new Date("2026-08-20T17:00:00.000Z"),
    });
    const second = await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", {
      actorRole: "TUTOR",
      clock: () => new Date("2026-08-20T17:05:00.000Z"),
    });

    expect(first.attendanceEventId).not.toBe(second.attendanceEventId);
    const allEvents = await db.sessionAttendanceEvent.findMany({
      where: { sessionId: first.sessionId, participantRole: "TUTOR" },
      orderBy: { occurredAt: "asc" },
    });
    expect(allEvents.length).toBe(2);
    expect(allEvents[0].id).toBe(first.attendanceEventId);
    expect(allEvents[1].id).toBe(second.attendanceEventId);
    // The first row's own occurredAt is untouched by the second check-in.
    expect(allEvents[0].occurredAt.getTime()).toBe(new Date("2026-08-20T17:00:00.000Z").getTime());
  });

  it("repeat check-in after IN_PROGRESS is recorded as evidence and does not error", async () => {
    const { tutor, student, booking } = await setupConfirmedCapturedBooking();
    await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" });
    const started = await recordSessionCheckIn(booking.id, student.user!.id, "STUDENT", { actorRole: "STUDENT" });
    expect(started.sessionStatus).toBe("IN_PROGRESS");

    const repeat = await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" });
    expect(repeat.sessionStatus).toBe("IN_PROGRESS");
    expect(repeat.transitionedToInProgress).toBe(false);
    expect(repeat.startedAt?.getTime()).toBe(started.startedAt?.getTime());
  });
});

// ===========================================================================
// C. Session transition — one side only stays SCHEDULED; both -> IN_PROGRESS;
// startedAt set once; Booking status remains CONFIRMED; Booking.endAt
// unchanged; no TutorEarning mutation.
// ===========================================================================
describe("Session Lifecycle Phase 2 — Session_ transition (integration)", () => {
  it("only Tutor checked in -> Session_ stays SCHEDULED", async () => {
    const { tutor, booking } = await setupConfirmedCapturedBooking();
    const result = await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" });
    expect(result.sessionStatus).toBe("SCHEDULED");
    expect(result.startedAt).toBeNull();
    expect(result.transitionedToInProgress).toBe(false);
  });

  it("only Student checked in -> Session_ stays SCHEDULED", async () => {
    const { student, booking } = await setupConfirmedCapturedBooking();
    const result = await recordSessionCheckIn(booking.id, student.user!.id, "STUDENT", { actorRole: "STUDENT" });
    expect(result.sessionStatus).toBe("SCHEDULED");
    expect(result.startedAt).toBeNull();
  });

  it("both checked in -> Session_ transitions to IN_PROGRESS with server-derived startedAt", async () => {
    const { tutor, student, booking } = await setupConfirmedCapturedBooking({
      startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    const tutorClock = () => new Date(booking.startAt.getTime() - 2 * 60 * 1000); // 17:58-equivalent
    const studentClock = () => new Date(booking.startAt.getTime() + 4 * 60 * 1000); // 18:04-equivalent

    await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR", clock: tutorClock });
    const result = await recordSessionCheckIn(booking.id, student.user!.id, "STUDENT", {
      actorRole: "STUDENT",
      clock: studentClock,
    });

    expect(result.sessionStatus).toBe("IN_PROGRESS");
    expect(result.transitionedToInProgress).toBe(true);
    // startedAt reflects the SECOND (sufficiency-establishing) presence
    // event's time, not the first, and not Booking.startAt.
    expect(result.startedAt?.getTime()).toBe(studentClock().getTime());
    expect(result.startedAt?.getTime()).not.toBe(booking.startAt.getTime());

    const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
    expect(session.status).toBe("IN_PROGRESS");
    expect(session.startedAt?.getTime()).toBe(studentClock().getTime());
  });

  it("Booking.status remains CONFIRMED and Booking.endAt is unchanged after IN_PROGRESS", async () => {
    const { tutor, student, booking } = await setupConfirmedCapturedBooking();
    await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" });
    await recordSessionCheckIn(booking.id, student.user!.id, "STUDENT", { actorRole: "STUDENT" });

    const finalBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(finalBooking.status).toBe("CONFIRMED");
    expect(finalBooking.endAt.getTime()).toBe(booking.endAt.getTime());
    expect(finalBooking.startAt.getTime()).toBe(booking.startAt.getTime());
  });

  it("no TutorEarning mutation occurs as a result of IN_PROGRESS transition", async () => {
    const { tutor, student, booking } = await setupConfirmedCapturedBooking();
    const earningBefore = await db.tutorEarning.findUniqueOrThrow({ where: { bookingId: booking.id } });

    await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" });
    await recordSessionCheckIn(booking.id, student.user!.id, "STUDENT", { actorRole: "STUDENT" });

    const earningAfter = await db.tutorEarning.findUniqueOrThrow({ where: { bookingId: booking.id } });
    expect(earningAfter.status).toBe(earningBefore.status);
    expect(earningAfter.eligibleAt.getTime()).toBe(earningBefore.eligibleAt.getTime());
    expect(earningAfter.amountCents).toBe(earningBefore.amountCents);
    expect(earningAfter.cancelledAt).toBe(earningBefore.cancelledAt);
    expect(earningAfter.transferredAt).toBe(earningBefore.transferredAt);
  });
});

// ===========================================================================
// D. Rejection cases — cancelled Session, terminal Session, unauthenticated
// window boundaries.
// ===========================================================================
describe("Session Lifecycle Phase 2 — rejection cases (integration)", () => {
  it("cancelled Session rejects check-in", async () => {
    const { tutor, booking } = await setupConfirmedCapturedBooking();
    await db.session_.updateMany({ where: { bookingId: booking.id, status: "SCHEDULED" }, data: { status: "CANCELLED" } });

    await expect(
      recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" })
    ).rejects.toBeInstanceOf(SessionNotCheckInEligibleError);
  });

  it("terminal Session (COMPLETED) rejects check-in", async () => {
    const { tutor, booking } = await setupConfirmedCapturedBooking();
    await db.session_.updateMany({ where: { bookingId: booking.id }, data: { status: "COMPLETED", completedAt: new Date() } });

    await expect(
      recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" })
    ).rejects.toBeInstanceOf(SessionNotCheckInEligibleError);
  });

  it("terminal Session (NO_SHOW) rejects check-in", async () => {
    const { tutor, booking } = await setupConfirmedCapturedBooking();
    await db.session_.updateMany({ where: { bookingId: booking.id }, data: { status: "NO_SHOW" } });

    await expect(
      recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" })
    ).rejects.toBeInstanceOf(SessionNotCheckInEligibleError);
  });

  it("check-in before the eligibility window opens is rejected as too early", async () => {
    const startAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const { tutor, booking } = await setupConfirmedCapturedBooking({ startAt });
    const tooEarly = new Date(startAt.getTime() - CHECK_IN_WINDOW_MS_BEFORE_START - 60 * 1000);

    await expect(
      recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR", clock: () => tooEarly })
    ).rejects.toBeInstanceOf(SessionCheckInTooEarlyError);
  });

  it("check-in exactly at the window boundary succeeds", async () => {
    const startAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const { tutor, booking } = await setupConfirmedCapturedBooking({ startAt });
    const atWindowOpen = new Date(startAt.getTime() - CHECK_IN_WINDOW_MS_BEFORE_START);

    const result = await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", {
      actorRole: "TUTOR",
      clock: () => atWindowOpen,
    });
    expect(result.sessionStatus).toBe("SCHEDULED");
  });

  it("a non-CONFIRMED booking (no Session_ yet) rejects check-in", async () => {
    const tutor = await createTutorUser();
    const student = await createSelfManagedStudent();
    const quote = await makeQuote(student.user.id, student.studentProfile.id);
    const payoutQuote = await makePayoutQuote(tutor.tutorProfile.id, quote.id);
    const payment = await makePayment(quote.id, student.user.id);
    const booking = await reserveBooking({
      actorUserId: student.user.id,
      studentProfileId: student.studentProfile.id,
      tutorProfileId: tutor.tutorProfile.id,
      customerPriceQuoteId: quote.id,
      tutorPayoutQuoteId: payoutQuote.id,
      paymentId: payment.id,
    });
    // Still PENDING_PAYMENT — payment never captured, no Session_ exists.
    await expect(
      recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" })
    ).rejects.toThrow();
  });
});

// ===========================================================================
// E. Read model — getSessionContext
// ===========================================================================
describe("Session Lifecycle Phase 2 — session read model (integration)", () => {
  it("Tutor viewer sees correct pre-check-in context and allowed actions", async () => {
    const { tutor, booking } = await setupConfirmedCapturedBooking();
    const context = await getSessionContext(booking.id, tutor.user.id, "TUTOR");

    expect(context.viewerRole).toBe("TUTOR_OWNER");
    expect(context.status).toBe("SCHEDULED");
    expect(context.tutorPresenceRecorded).toBe(false);
    expect(context.studentPresenceRecorded).toBe(false);
    expect(context.viewerCanCheckInAsTutor).toBe(true);
    expect(context.allowedActions).toContain("CHECK_IN_AS_TUTOR");
    expect(context.startedAt).toBeNull();
    expect(context.completedAt).toBeNull();
  });

  it("read model reflects presence after check-in and correctly attributes who recorded student presence", async () => {
    const { tutor, booking } = await setupConfirmedCapturedBooking({ guardian: true });
    await recordSessionCheckIn(booking.id, tutor.user.id, "STUDENT", { actorRole: "TUTOR" });

    const context = await getSessionContext(booking.id, tutor.user.id, "TUTOR");
    expect(context.studentPresenceRecorded).toBe(true);
    expect(context.studentPresenceRecordedBy).toBe("TUTOR");
    expect(context.tutorPresenceRecorded).toBe(false);
  });

  it("guardian's own check-in is attributed as GUARDIAN in the read model", async () => {
    const { parent, tutor, booking } = await setupConfirmedCapturedBooking({ guardian: true });
    await recordSessionCheckIn(booking.id, parent!.user.id, "STUDENT", { actorRole: "PARENT" });

    const context = await getSessionContext(booking.id, tutor.user.id, "TUTOR");
    expect(context.studentPresenceRecordedBy).toBe("GUARDIAN");
  });

  it("unrelated Student is denied read access", async () => {
    const { booking } = await setupConfirmedCapturedBooking();
    const unrelatedStudent = await createSelfManagedStudent();
    await expect(getSessionContext(booking.id, unrelatedStudent.user.id, "STUDENT")).rejects.toBeInstanceOf(
      SessionViewerNotAuthorizedError
    );
  });

  it("Admin may view the session context (broader than check-in authority)", async () => {
    const { booking } = await setupConfirmedCapturedBooking();
    const admin = await db.user.create({ data: { email: uniqueEmail("admin"), role: "ADMIN" } });
    createdUserIds.push(admin.id);
    const context = await getSessionContext(booking.id, admin.id, "ADMIN");
    expect(context.viewerRole).toBe("ADMIN");
    // Admin gets no check-in eligibility of its own — read-only.
    expect(context.viewerCanCheckInAsTutor).toBe(false);
    expect(context.viewerCanCheckInAsStudent).toBe(false);
  });

  it("read model does not expose raw attendance event rows or financial fields", async () => {
    const { tutor, booking } = await setupConfirmedCapturedBooking();
    await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" });
    const context = await getSessionContext(booking.id, tutor.user.id, "TUTOR");

    const contextKeys = Object.keys(context);
    expect(contextKeys).not.toContain("attendanceEvents");
    expect(contextKeys).not.toContain("tutorEarning");
    expect(contextKeys).not.toContain("eligibleAt");
  });
});
