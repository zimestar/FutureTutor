import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";

// Session Lifecycle Phase 2 — genuine-concurrency regression suite. Every
// race below uses real Promise.all/Promise.allSettled against the real
// isolated test database (never mocks) — mirroring
// cancellationConcurrency.integration.test.ts's own established style
// exactly. The core invariant under test throughout: recordSessionCheckIn's
// Serializable transaction + withSerializableRetry (src/lib/serializableRetry.ts)
// makes "only one SCHEDULED->IN_PROGRESS transition, startedAt written
// exactly once" true by construction (a genuine write-skew rw-conflict
// between two concurrent first-check-ins, caught by Postgres's own
// serializable-snapshot-isolation and resolved by retry — the same class of
// race H.8's own tutorEarning-vs-markEligibleEarnings conflict already
// relies on, see cancellationPolicy.ts's own comments on this).

vi.mock("@/lib/stripe", () => ({ getStripeClient: vi.fn() }));

import { getStripeClient } from "@/lib/stripe";

let createCustomerPriceQuote: typeof import("./customerPricing").createCustomerPriceQuote;
let createTutorPayoutQuote: typeof import("./tutorPayout").createTutorPayoutQuote;
let reserveBookingPendingPayment: typeof import("./bookingCreation").reserveBookingPendingPayment;
let convergeToCaptured: typeof import("./payments").convergeToCaptured;
let cancelBookingWithRefund: typeof import("./cancellationPolicy").cancelBookingWithRefund;
let recordSessionCheckIn: typeof import("./sessionLifecycle").recordSessionCheckIn;

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

// See sessionAttendance.integration.test.ts's own comment on this same
// constant: 5 minutes out keeps a booking "not yet started" while already
// falling inside the 15-minute check-in eligibility window, so most races
// below can use the real (uninjected) clock.
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
  ({ recordSessionCheckIn } = await import("./sessionLifecycle"));

  const { db: ambientDb } = await import("@/lib/db");
  const [{ current_database: ambientDatabaseName }] = await ambientDb.$queryRaw<
    Array<{ current_database: string }>
  >`SELECT current_database()`;
  if (ambientDatabaseName !== target.databaseName) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton reports current_database() = "${ambientDatabaseName}", but the verified test database is "${target.databaseName}". Refusing to run any Session Lifecycle Phase 2 concurrency test.`
    );
  }
  const devDatabaseNameForSafetyCheckOnly = devDatabaseUrlForSafetyCheckOnly
    ? new URL(devDatabaseUrlForSafetyCheckOnly).pathname.replace(/^\//, "")
    : null;
  if (devDatabaseNameForSafetyCheckOnly && ambientDatabaseName === devDatabaseNameForSafetyCheckOnly) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton's current_database() ("${ambientDatabaseName}") equals the real development database name. Refusing to run any Session Lifecycle Phase 2 concurrency test.`
    );
  }

  const subject = await db.subject.create({ data: { slug: `sac-it-subject-${randomUUID()}`, sortOrder: 999 } });
  subjectId = subject.id;
  const level = await db.academicLevel.create({ data: { slug: `sac-it-level-${randomUUID()}`, sortOrder: 999 } });
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
  return `sac-it-${prefix}-${randomUUID()}@futuretutor.test`;
}

async function createTutorUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("tutor"), role: "TUTOR" } });
  createdUserIds.push(user.id);
  const tutorProfile = await db.tutorProfile.create({
    data: { userId: user.id, slug: `sac-it-tutor-${randomUUID()}`, applicationStatus: "APPROVED", payoutTier: "NEW", learningMode: "BOTH" },
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

async function createGuardianManagedChild(parentProfileId: string) {
  const studentProfile = await db.studentProfile.create({
    data: { firstName: "Emma", lastName: "Kid", dateOfBirth: new Date("2015-01-01T00:00:00.000Z"), managementMode: "GUARDIAN_MANAGED", userId: null },
  });
  createdStudentProfileIds.push(studentProfile.id);
  const relationship = await db.parentStudentRelationship.create({
    data: { parentProfileId, studentProfileId: studentProfile.id, status: "ACTIVE" },
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

async function setupConfirmedCapturedBooking(overrides: { startAt?: Date; guardian?: boolean } = {}) {
  const tutor = await createTutorUser();
  let student: { user: { id: string } | null; studentProfile: { id: string } };
  let parent: { user: { id: string }; parentProfile: { id: string } } | null = null;

  if (overrides.guardian) {
    parent = await createParentUser();
    const child = await createGuardianManagedChild(parent.parentProfile.id);
    student = { user: null, studentProfile: child.studentProfile };
  } else {
    student = await createSelfManagedStudent();
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
  return { tutor, student, parent, quote, payoutQuote, booking };
}

describe("Session Lifecycle Phase 2 concurrency/race regression suite", () => {
  it("1. Tutor and Student checking in concurrently for the first time -> both succeed, exactly one triggers IN_PROGRESS, startedAt written once", async () => {
    const { tutor, student, booking } = await setupConfirmedCapturedBooking();

    const [tutorResult, studentResult] = await Promise.all([
      recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" }),
      recordSessionCheckIn(booking.id, student.user!.id, "STUDENT", { actorRole: "STUDENT" }),
    ]);

    // Both check-ins succeeded and each recorded its own evidence row.
    expect(tutorResult.attendanceEventId).not.toBe(studentResult.attendanceEventId);

    // Exactly one of the two calls observed itself as the transition.
    const transitionCount = [tutorResult.transitionedToInProgress, studentResult.transitionedToInProgress].filter(
      Boolean
    ).length;
    expect(transitionCount).toBe(1);

    // Final DB state: IN_PROGRESS, startedAt set exactly once.
    const finalSession = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
    expect(finalSession.status).toBe("IN_PROGRESS");
    expect(finalSession.startedAt).not.toBeNull();

    // Exactly one CHECK_IN row per participant — no duplicate/orphaned rows
    // from a retried-then-rolled-back attempt.
    const events = await db.sessionAttendanceEvent.findMany({ where: { sessionId: finalSession.id } });
    expect(events.length).toBe(2);
    expect(events.filter((e) => e.participantRole === "TUTOR").length).toBe(1);
    expect(events.filter((e) => e.participantRole === "STUDENT").length).toBe(1);

    // Both results' own view of the final state agree with the DB.
    expect(tutorResult.sessionStatus === "IN_PROGRESS" || studentResult.sessionStatus === "IN_PROGRESS").toBe(true);
  });

  it("2. Repeat Tutor check-in racing (two concurrent calls, same Tutor) -> both succeed, two evidence rows, no double transition", async () => {
    const { tutor, booking } = await setupConfirmedCapturedBooking();

    const [a, b] = await Promise.all([
      recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" }),
      recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" }),
    ]);

    expect(a.attendanceEventId).not.toBe(b.attendanceEventId);
    expect(a.transitionedToInProgress).toBe(false);
    expect(b.transitionedToInProgress).toBe(false);

    const finalSession = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
    expect(finalSession.status).toBe("SCHEDULED");
    expect(finalSession.startedAt).toBeNull();

    const events = await db.sessionAttendanceEvent.findMany({ where: { sessionId: finalSession.id, participantRole: "TUTOR" } });
    expect(events.length).toBe(2);
  });

  it("3. Repeat Student check-in racing (two concurrent calls, same Student) -> both succeed, two evidence rows", async () => {
    const { student, booking } = await setupConfirmedCapturedBooking();

    const [a, b] = await Promise.all([
      recordSessionCheckIn(booking.id, student.user!.id, "STUDENT", { actorRole: "STUDENT" }),
      recordSessionCheckIn(booking.id, student.user!.id, "STUDENT", { actorRole: "STUDENT" }),
    ]);

    expect(a.attendanceEventId).not.toBe(b.attendanceEventId);
    const finalSession = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
    expect(finalSession.status).toBe("SCHEDULED");
    const events = await db.sessionAttendanceEvent.findMany({ where: { sessionId: finalSession.id, participantRole: "STUDENT" } });
    expect(events.length).toBe(2);
  });

  it("4. Guardian and Tutor-declaring-learner racing to record the SAME learner's presence -> both succeed as two append-only rows, no unique-constraint violation", async () => {
    const { tutor, parent, booking } = await setupConfirmedCapturedBooking({ guardian: true });

    const [guardianResult, tutorDeclaredResult] = await Promise.all([
      recordSessionCheckIn(booking.id, parent!.user.id, "STUDENT", { actorRole: "PARENT" }),
      recordSessionCheckIn(booking.id, tutor.user.id, "STUDENT", { actorRole: "TUTOR" }),
    ]);

    expect(guardianResult.actorRole).toBe("GUARDIAN");
    expect(tutorDeclaredResult.actorRole).toBe("TUTOR_DECLARING_LEARNER");
    expect(guardianResult.attendanceEventId).not.toBe(tutorDeclaredResult.attendanceEventId);

    const events = await db.sessionAttendanceEvent.findMany({
      where: { sessionId: guardianResult.sessionId, participantRole: "STUDENT" },
    });
    expect(events.length).toBe(2);
    // Since TUTOR never checked in for its own role, session stays SCHEDULED.
    const finalSession = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
    expect(finalSession.status).toBe("SCHEDULED");
  });

  it("5. Two concurrent unauthorized check-in attempts -> both rejected, zero attendance rows created", async () => {
    const { booking } = await setupConfirmedCapturedBooking();
    const unrelatedA = await createSelfManagedStudent();
    const unrelatedB = await createSelfManagedStudent();

    const outcomes = await Promise.allSettled([
      recordSessionCheckIn(booking.id, unrelatedA.user.id, "STUDENT", { actorRole: "STUDENT" }),
      recordSessionCheckIn(booking.id, unrelatedB.user.id, "STUDENT", { actorRole: "STUDENT" }),
    ]);

    expect(outcomes.every((o) => o.status === "rejected")).toBe(true);

    const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
    const events = await db.sessionAttendanceEvent.findMany({ where: { sessionId: session.id } });
    expect(events.length).toBe(0);
    expect(session.status).toBe("SCHEDULED");
  });

  it("6. Cancellation racing with check-in near startAt -> no corrupted state (Session_ never IN_PROGRESS while Booking is CANCELLED)", async () => {
    const startAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes out: inside the 15-minute check-in window, still before startAt (cancellable)
    const { tutor, student, booking } = await setupConfirmedCapturedBooking({ startAt });

    const outcomes = await Promise.allSettled([
      cancelBookingWithRefund(booking.id, student.user!.id, { actorRole: "STUDENT" }),
      recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" }),
    ]);
    // At least one settles; we don't assert which wins — only that the
    // resulting state is never corrupted.
    void outcomes;

    const finalBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    const finalSession = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });

    expect(["CONFIRMED", "CANCELLED"]).toContain(finalBooking.status);
    if (finalBooking.status === "CANCELLED") {
      expect(finalSession.status).toBe("CANCELLED");
    }
    // The one invariant that must never break: IN_PROGRESS while cancelled.
    expect(finalSession.status === "IN_PROGRESS" && finalBooking.status === "CANCELLED").toBe(false);
  });

  it("7. Three-way race (Tutor x2 + Student x1, first-time) -> still exactly one IN_PROGRESS transition, startedAt set once", async () => {
    const { tutor, student, booking } = await setupConfirmedCapturedBooking();

    const results = await Promise.all([
      recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" }),
      recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" }),
      recordSessionCheckIn(booking.id, student.user!.id, "STUDENT", { actorRole: "STUDENT" }),
    ]);

    const transitionCount = results.filter((r) => r.transitionedToInProgress).length;
    expect(transitionCount).toBe(1);

    const finalSession = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
    expect(finalSession.status).toBe("IN_PROGRESS");
    const tutorEvents = await db.sessionAttendanceEvent.findMany({
      where: { sessionId: finalSession.id, participantRole: "TUTOR" },
    });
    expect(tutorEvents.length).toBe(2);
  });
});
