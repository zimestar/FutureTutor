import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";

// Session Lifecycle Phase 3 — no-show convergence at the T+15 grace
// deadline. Mirrors sessionAttendance.integration.test.ts /
// sessionAttendanceConcurrency.integration.test.ts's own DB-target-
// redirection technique exactly (resolveVerifiedTestDatabase,
// tracked-id cleanup arrays, ambient @/lib/db singleton redirected to
// futuretutor_test BEFORE any transitively-DB-touching module is
// imported). Time-boundary tests use an INJECTED clock (recordSessionCheckIn
// and resolveSessionNoShowConvergence both accept `options.clock`) rather
// than waiting real wall-clock minutes — exactly the established Phase
// 1/2/H.8 convention for boundary-instant tests. Genuine concurrency tests
// use real Promise.all/Promise.allSettled against the real database, never
// mocks, mirroring sessionAttendanceConcurrency.integration.test.ts exactly.

vi.mock("@/lib/stripe", () => ({ getStripeClient: vi.fn() }));

import { getStripeClient } from "@/lib/stripe";

let createCustomerPriceQuote: typeof import("./customerPricing").createCustomerPriceQuote;
let createTutorPayoutQuote: typeof import("./tutorPayout").createTutorPayoutQuote;
let reserveBookingPendingPayment: typeof import("./bookingCreation").reserveBookingPendingPayment;
let convergeToCaptured: typeof import("./payments").convergeToCaptured;
let cancelBookingWithRefund: typeof import("./cancellationPolicy").cancelBookingWithRefund;
let SessionAlreadyStartedError: typeof import("./cancellationPolicy").SessionAlreadyStartedError;
let recordSessionCheckIn: typeof import("./sessionLifecycle").recordSessionCheckIn;
let getSessionContext: typeof import("./sessionLifecycle").getSessionContext;
let resolveSessionNoShowConvergence: typeof import("./sessionLifecycle").resolveSessionNoShowConvergence;
let sweepDueNoShowConvergence: typeof import("./sessionLifecycle").sweepDueNoShowConvergence;
let computeNoShowGraceDeadline: typeof import("./sessionLifecycle").computeNoShowGraceDeadline;
let SessionNotCheckInEligibleError: typeof import("./sessionLifecycle").SessionNotCheckInEligibleError;

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

// 5 minutes out by default: same rationale as the Phase 2 integration
// suites — already inside the 15-minute check-in window, still before
// startAt (satisfies H.8's now<startAt cancellation boundary). All T+15
// boundary evaluation in this file uses an INJECTED clock relative to
// this real startAt, never real elapsed wall-clock time.
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
  ({ cancelBookingWithRefund, SessionAlreadyStartedError } = await import("./cancellationPolicy"));
  ({
    recordSessionCheckIn,
    getSessionContext,
    resolveSessionNoShowConvergence,
    sweepDueNoShowConvergence,
    computeNoShowGraceDeadline,
    SessionNotCheckInEligibleError,
  } = await import("./sessionLifecycle"));

  const { db: ambientDb } = await import("@/lib/db");
  const [{ current_database: ambientDatabaseName }] = await ambientDb.$queryRaw<
    Array<{ current_database: string }>
  >`SELECT current_database()`;
  if (ambientDatabaseName !== target.databaseName) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton reports current_database() = "${ambientDatabaseName}", but the verified test database is "${target.databaseName}". Refusing to run any Session Lifecycle Phase 3 integration test.`
    );
  }
  const devDatabaseNameForSafetyCheckOnly = devDatabaseUrlForSafetyCheckOnly
    ? new URL(devDatabaseUrlForSafetyCheckOnly).pathname.replace(/^\//, "")
    : null;
  if (devDatabaseNameForSafetyCheckOnly && ambientDatabaseName === devDatabaseNameForSafetyCheckOnly) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton's current_database() ("${ambientDatabaseName}") equals the real development database name. Refusing to run any Session Lifecycle Phase 3 integration test.`
    );
  }

  const subject = await db.subject.create({ data: { slug: `sn3-it-subject-${randomUUID()}`, sortOrder: 999 } });
  subjectId = subject.id;
  const level = await db.academicLevel.create({ data: { slug: `sn3-it-level-${randomUUID()}`, sortOrder: 999 } });
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
  return `sn3-it-${prefix}-${randomUUID()}@futuretutor.test`;
}

async function createTutorUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("tutor"), role: "TUTOR" } });
  createdUserIds.push(user.id);
  const tutorProfile = await db.tutorProfile.create({
    data: { userId: user.id, slug: `sn3-it-tutor-${randomUUID()}`, applicationStatus: "APPROVED", payoutTier: "NEW", learningMode: "BOTH" },
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

async function makeQuote(actorUserId: string, studentProfileId: string, requestedStartAt: Date) {
  const quote = await createCustomerPriceQuote(
    { createdByUserId: actorUserId, studentProfileId, subjectId, academicLevelId, tutoringMode: "ONLINE", durationMinutes: 60, requestedStartAt },
    db
  );
  createdCustomerQuoteIds.push(quote.id);
  return quote;
}

async function makePayoutQuote(tutorProfileId: string, customerQuoteId: string, requestedStartAt: Date) {
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
  startAt: Date;
}) {
  const endAt = new Date(params.startAt.getTime() + 60 * 60 * 1000);
  const booking = await db.$transaction(
    (tx) =>
      reserveBookingPendingPayment(tx, {
        actorUserId: params.actorUserId,
        studentProfileId: params.studentProfileId,
        tutorProfileId: params.tutorProfileId,
        subjectId,
        academicLevelId,
        startAt: params.startAt,
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

async function setupConfirmedCapturedBooking(overrides: { startAt?: Date } = {}) {
  const startAt = overrides.startAt ?? DEFAULT_TEST_START_AT;
  const tutor = await createTutorUser();
  const student = await createSelfManagedStudent();

  const quote = await makeQuote(student.user.id, student.studentProfile.id, startAt);
  const payoutQuote = await makePayoutQuote(tutor.tutorProfile.id, quote.id, startAt);
  const payment = await makePayment(quote.id, student.user.id);
  const booking = await reserveBooking({
    actorUserId: student.user.id,
    studentProfileId: student.studentProfile.id,
    tutorProfileId: tutor.tutorProfile.id,
    customerPriceQuoteId: quote.id,
    tutorPayoutQuoteId: payoutQuote.id,
    paymentId: payment.id,
    startAt,
  });
  await db.payment.update({
    where: { id: payment.id },
    data: { status: "AUTHORIZED", stripePaymentIntentId: `pi_fake_${randomUUID()}` },
  });
  await convergeToCaptured(payment.id);
  return { tutor, student, quote, payoutQuote, payment, booking };
}

describe("Session Lifecycle Phase 3 — no-show convergence at T+15", () => {
  describe("TIME — the T+15 grace-deadline boundary", () => {
    it("1. 1ms before T+15 -> NOT_YET_DUE, no transition, Session_ stays SCHEDULED", async () => {
      const { tutor, booking } = await setupConfirmedCapturedBooking();
      await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" });
      const deadline = computeNoShowGraceDeadline(booking.startAt);
      const oneMsBefore = new Date(deadline.getTime() - 1);

      const result = await resolveSessionNoShowConvergence(booking.id, { clock: () => oneMsBefore });
      expect(result.decision).toBe("NOT_YET_DUE");
      expect(result.transitioned).toBe(false);
      expect(result.sessionStatus).toBe("SCHEDULED");

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("SCHEDULED");
    });

    it("2. Exactly T+15 -> eligible for convergence, transitions immediately", async () => {
      const { tutor, booking } = await setupConfirmedCapturedBooking();
      await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" });
      const deadline = computeNoShowGraceDeadline(booking.startAt);

      const result = await resolveSessionNoShowConvergence(booking.id, { clock: () => deadline });
      expect(result.decision).toBe("STUDENT_NO_SHOW");
      expect(result.transitioned).toBe(true);
      expect(result.sessionStatus).toBe("NO_SHOW");
    });

    it("3. Well after T+15 -> still eligible, converges", async () => {
      const { student, booking } = await setupConfirmedCapturedBooking();
      await recordSessionCheckIn(booking.id, student.user.id, "STUDENT", { actorRole: "STUDENT" });
      const wellAfter = new Date(computeNoShowGraceDeadline(booking.startAt).getTime() + 3 * 60 * 60 * 1000);

      const result = await resolveSessionNoShowConvergence(booking.id, { clock: () => wellAfter });
      expect(result.decision).toBe("TUTOR_NO_SHOW");
      expect(result.transitioned).toBe(true);
      expect(result.sessionStatus).toBe("NO_SHOW");
    });
  });

  describe("PRESENCE — cases A/B/C/D", () => {
    it("4. A) Tutor checked in, Student did not -> STUDENT_NO_SHOW", async () => {
      const { tutor, booking } = await setupConfirmedCapturedBooking();
      await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" });
      const deadline = computeNoShowGraceDeadline(booking.startAt);

      const result = await resolveSessionNoShowConvergence(booking.id, { clock: () => deadline });
      expect(result.decision).toBe("STUDENT_NO_SHOW");
      expect(result.tutorHasCheckedIn).toBe(true);
      expect(result.studentHasCheckedIn).toBe(false);

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("NO_SHOW");
    });

    it("5. B) Student checked in, Tutor did not -> TUTOR_NO_SHOW", async () => {
      const { student, booking } = await setupConfirmedCapturedBooking();
      await recordSessionCheckIn(booking.id, student.user.id, "STUDENT", { actorRole: "STUDENT" });
      const deadline = computeNoShowGraceDeadline(booking.startAt);

      const result = await resolveSessionNoShowConvergence(booking.id, { clock: () => deadline });
      expect(result.decision).toBe("TUTOR_NO_SHOW");

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("NO_SHOW");
    });

    it("6. D) Both checked in -> Session_ already IN_PROGRESS; convergence is a no-op (NOT_APPLICABLE)", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" });
      await recordSessionCheckIn(booking.id, student.user.id, "STUDENT", { actorRole: "STUDENT" });

      const preCheck = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(preCheck.status).toBe("IN_PROGRESS");

      const deadline = computeNoShowGraceDeadline(booking.startAt);
      const result = await resolveSessionNoShowConvergence(booking.id, { clock: () => deadline });
      expect(result.decision).toBe("NOT_APPLICABLE");
      expect(result.transitioned).toBe(false);
      expect(result.sessionStatus).toBe("IN_PROGRESS");

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("IN_PROGRESS");
    });

    it("7. C) Neither checked in -> NO_SHOW_UNRESOLVED, represented as plain NO_SHOW; getSessionContext reconstructs it from evidence", async () => {
      const { tutor, booking } = await setupConfirmedCapturedBooking();
      const deadline = computeNoShowGraceDeadline(booking.startAt);

      const result = await resolveSessionNoShowConvergence(booking.id, { clock: () => deadline });
      expect(result.decision).toBe("NO_SHOW_UNRESOLVED");
      expect(result.transitioned).toBe(true);
      expect(result.tutorHasCheckedIn).toBe(false);
      expect(result.studentHasCheckedIn).toBe(false);

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("NO_SHOW");

      const context = await getSessionContext(booking.id, tutor.user.id, "TUTOR", { clock: () => deadline });
      expect(context.status).toBe("NO_SHOW");
      expect(context.noShowOutcome).toBe("NO_SHOW_UNRESOLVED");
      expect(context.graceDeadlineAt.getTime()).toBe(deadline.getTime());
    });
  });

  describe("RACES — idempotency and concurrency", () => {
    it("8. Convergence called twice sequentially -> second call is a clean no-op", async () => {
      const { tutor, booking } = await setupConfirmedCapturedBooking();
      await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" });
      const deadline = computeNoShowGraceDeadline(booking.startAt);

      const first = await resolveSessionNoShowConvergence(booking.id, { clock: () => deadline });
      expect(first.transitioned).toBe(true);

      const second = await resolveSessionNoShowConvergence(booking.id, { clock: () => deadline });
      expect(second.decision).toBe("NOT_APPLICABLE");
      expect(second.transitioned).toBe(false);
      expect(second.sessionStatus).toBe("NO_SHOW");
    });

    it("9. Two convergence workers racing concurrently -> exactly one transitions, one authoritative final outcome", async () => {
      const { tutor, booking } = await setupConfirmedCapturedBooking();
      await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" });
      const deadline = computeNoShowGraceDeadline(booking.startAt);

      const [a, b] = await Promise.all([
        resolveSessionNoShowConvergence(booking.id, { clock: () => deadline }),
        resolveSessionNoShowConvergence(booking.id, { clock: () => deadline }),
      ]);

      // Exactly one call's own updateMany performs the transition. The
      // other observes a safe no-op — EITHER because its own updateMany
      // simply matched zero rows within a single attempt (decision still
      // computed as STUDENT_NO_SHOW from evidence read before either
      // committed, transitioned: false — mirrors Phase 2's own dual
      // check-in race), OR because withSerializableRetry retried it after
      // a genuine Postgres serialization conflict and its retry's fresh
      // re-read observed the already-committed NO_SHOW status (decision:
      // NOT_APPLICABLE). Both are correct, non-corrupting outcomes; which
      // one occurs depends on real transaction timing, not on this
      // function's contract.
      const transitioned = [a, b].filter((r) => r.transitioned);
      const notTransitioned = [a, b].filter((r) => !r.transitioned);
      expect(transitioned.length).toBe(1);
      expect(transitioned[0].decision).toBe("STUDENT_NO_SHOW");
      expect(notTransitioned.length).toBe(1);
      expect(["STUDENT_NO_SHOW", "NOT_APPLICABLE"]).toContain(notTransitioned[0].decision);

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("NO_SHOW");
    });

    it("10. Tutor check-in racing T+15 convergence (Student already present, Tutor is the late/racing side) -> convergence wins, Tutor's check-in rejected", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await recordSessionCheckIn(booking.id, student.user.id, "STUDENT", { actorRole: "STUDENT" });
      const deadline = computeNoShowGraceDeadline(booking.startAt);

      const outcomes = await Promise.allSettled([
        recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR", clock: () => deadline }),
        resolveSessionNoShowConvergence(booking.id, { clock: () => deadline }),
      ]);

      expect(outcomes[0].status).toBe("rejected");
      if (outcomes[0].status === "rejected") {
        expect(outcomes[0].reason).toBeInstanceOf(SessionNotCheckInEligibleError);
      }
      expect(outcomes[1].status).toBe("fulfilled");

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("NO_SHOW");
      const events = await db.sessionAttendanceEvent.findMany({ where: { sessionId: session.id } });
      expect(events.length).toBe(1); // only the pre-existing STUDENT evidence; Tutor's rejected check-in inserted nothing
      expect(events[0].participantRole).toBe("STUDENT");
    });

    it("11. Student check-in racing T+15 convergence (Tutor already present, Student is the late/racing side) -> convergence wins, Student's check-in rejected", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" });
      const deadline = computeNoShowGraceDeadline(booking.startAt);

      const outcomes = await Promise.allSettled([
        recordSessionCheckIn(booking.id, student.user.id, "STUDENT", { actorRole: "STUDENT", clock: () => deadline }),
        resolveSessionNoShowConvergence(booking.id, { clock: () => deadline }),
      ]);

      expect(outcomes[0].status).toBe("rejected");
      if (outcomes[0].status === "rejected") {
        expect(outcomes[0].reason).toBeInstanceOf(SessionNotCheckInEligibleError);
      }

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("NO_SHOW");
      const events = await db.sessionAttendanceEvent.findMany({ where: { sessionId: session.id } });
      expect(events.length).toBe(1);
      expect(events[0].participantRole).toBe("TUTOR");
    });

    it("12. Dual presence racing convergence — simultaneous FIRST-time Tutor + Student check-in exactly at T+15 (neither had prior evidence) -> hard deadline wins: NO_SHOW_UNRESOLVED, both check-ins rejected, zero evidence rows (documented race semantics — a literal simultaneous-at-deadline arrival does not retroactively rescue an already-due no-show; only presence established BEFORE the deadline can)", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      const deadline = computeNoShowGraceDeadline(booking.startAt);

      const outcomes = await Promise.allSettled([
        recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR", clock: () => deadline }),
        recordSessionCheckIn(booking.id, student.user.id, "STUDENT", { actorRole: "STUDENT", clock: () => deadline }),
        resolveSessionNoShowConvergence(booking.id, { clock: () => deadline }),
      ]);

      expect(outcomes[0].status).toBe("rejected");
      expect(outcomes[1].status).toBe("rejected");
      expect(outcomes[2].status).toBe("fulfilled");
      if (outcomes[0].status === "rejected") expect(outcomes[0].reason).toBeInstanceOf(SessionNotCheckInEligibleError);
      if (outcomes[1].status === "rejected") expect(outcomes[1].reason).toBeInstanceOf(SessionNotCheckInEligibleError);

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("NO_SHOW");
      const events = await db.sessionAttendanceEvent.findMany({ where: { sessionId: session.id } });
      expect(events.length).toBe(0);
    });

    it("13. Cancelled Booking racing convergence -> mutually exclusive by construction (one shared real clock), never a corrupted combination", async () => {
      // IMPORTANT DESIGN NOTE (documented per the architecture audit's own
      // §8/§17 finding, re-verified here): cancellation's pre-existing H.8
      // boundary (SessionAlreadyStartedError, cancellationPolicy.ts) already
      // rejects ANY cancellation attempt once `now >= booking.startAt`,
      // using the REAL server clock — and no-show convergence is never
      // eligible before `now >= booking.startAt + 15min`, which is always
      // >= startAt. Under a SINGLE authoritative real clock (there is only
      // ever one), these two eligibility windows are DISJOINT: the instant
      // convergence becomes eligible, cancellation is already unconditionally
      // rejected. An earlier draft of this test artificially injected a
      // pre-start clock into the cancellation call and a post-deadline clock
      // into the convergence call to force a contested race — that scenario
      // is NOT reachable in production (both operations observe the SAME
      // real time) and, when exercised, surfaced exactly the corrupted
      // combination this test guards against (Booking CANCELLED with
      // Session_ NO_SHOW) — because cancelBookingWithRefund's own Session_
      // write (cancellationPolicy.ts step 9) is an unguarded/uncounted
      // updateMany, not gated on its own success. That combination cannot
      // occur with a real shared clock, which is what this test now proves
      // directly: a genuinely-real-clock, genuinely-concurrent cancellation
      // attempt made once the grace deadline has passed is deterministically
      // rejected, and convergence proceeds cleanly.
      const pastStartAt = new Date(Date.now() - 20 * 60 * 1000); // real wall-clock: already past both startAt and T+15
      const { student, booking } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });

      const outcomes = await Promise.allSettled([
        cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" }), // real (unmocked) clock
        resolveSessionNoShowConvergence(booking.id), // real (unmocked) clock — same wall clock as above
      ]);

      expect(outcomes[0].status).toBe("rejected");
      if (outcomes[0].status === "rejected") {
        expect(outcomes[0].reason).toBeInstanceOf(SessionAlreadyStartedError);
      }
      expect(outcomes[1].status).toBe("fulfilled");

      const finalBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
      const finalSession = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });

      // Cancellation never touched anything — Booking stays CONFIRMED,
      // convergence alone determines the Session_ outcome.
      expect(finalBooking.status).toBe("CONFIRMED");
      expect(finalSession.status).toBe("NO_SHOW");

      // Booking invariants (§17 of the task): startAt/endAt never mutated.
      expect(finalBooking.startAt.getTime()).toBe(booking.startAt.getTime());
      expect(finalBooking.endAt.getTime()).toBe(booking.endAt.getTime());
    });
  });

  describe("TERMINAL — no-show is terminal, unrelated terminal states stay protected", () => {
    it("14. NO_SHOW rejects a later check-in attempt (real clock, well after convergence) — same error as any other terminal-state check-in", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      const deadline = computeNoShowGraceDeadline(booking.startAt);
      await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" });
      await resolveSessionNoShowConvergence(booking.id, { clock: () => deadline });

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("NO_SHOW");

      await expect(
        recordSessionCheckIn(booking.id, student.user.id, "STUDENT", { actorRole: "STUDENT", clock: () => new Date(deadline.getTime() + 60_000) })
      ).rejects.toBeInstanceOf(SessionNotCheckInEligibleError);

      const events = await db.sessionAttendanceEvent.findMany({ where: { sessionId: session.id, participantRole: "STUDENT" } });
      expect(events.length).toBe(0);
    });

    it("15. Convergence against a Session_ already CANCELLED (pre-start cancellation) -> NOT_APPLICABLE, no mutation", async () => {
      const { student, booking } = await setupConfirmedCapturedBooking();
      await cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" });
      const deadline = computeNoShowGraceDeadline(booking.startAt);

      const result = await resolveSessionNoShowConvergence(booking.id, { clock: () => deadline });
      expect(result.decision).toBe("NOT_APPLICABLE");
      expect(result.transitioned).toBe(false);
      expect(result.sessionStatus).toBe("CANCELLED");
    });

    it("16. Convergence against a Session_ already COMPLETED/INTERRUPTED (manually set — no writer exists yet for either in this codebase) -> NOT_APPLICABLE, no mutation", async () => {
      const { booking } = await setupConfirmedCapturedBooking();
      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      await db.session_.update({ where: { id: session.id }, data: { status: "COMPLETED", completedAt: new Date() } });
      const deadline = computeNoShowGraceDeadline(booking.startAt);

      const result = await resolveSessionNoShowConvergence(booking.id, { clock: () => deadline });
      expect(result.decision).toBe("NOT_APPLICABLE");
      expect(result.transitioned).toBe(false);
      expect(result.sessionStatus).toBe("COMPLETED");

      const finalSession = await db.session_.findUniqueOrThrow({ where: { id: session.id } });
      expect(finalSession.status).toBe("COMPLETED");
    });
  });

  describe("INVARIANTS — financial/Booking surfaces untouched, evidence preserved", () => {
    it("17. No-show convergence never mutates Payment, Refund, or TutorEarning", async () => {
      const { tutor, booking, payment } = await setupConfirmedCapturedBooking();
      await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" });

      const paymentBefore = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
      const earningBefore = await db.tutorEarning.findUniqueOrThrow({ where: { bookingId: booking.id } });

      const deadline = computeNoShowGraceDeadline(booking.startAt);
      const result = await resolveSessionNoShowConvergence(booking.id, { clock: () => deadline });
      expect(result.sessionStatus).toBe("NO_SHOW");

      const paymentAfter = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
      const earningAfter = await db.tutorEarning.findUniqueOrThrow({ where: { bookingId: booking.id } });
      const refunds = await db.refund.findMany({ where: { bookingId: booking.id } });

      expect(paymentAfter.status).toBe(paymentBefore.status);
      expect(paymentAfter.refundedAmountCents).toBe(paymentBefore.refundedAmountCents);
      expect(earningAfter.status).toBe(earningBefore.status);
      expect(earningAfter.amountCents).toBe(earningBefore.amountCents);
      // Phase 5A: eligibleAt is now nullable in the schema, but the writer
      // (payments.ts) is unchanged in this phase and always populates a
      // concrete Date at creation — assert it stays non-null and unchanged.
      expect(earningBefore.eligibleAt).not.toBeNull();
      expect(earningAfter.eligibleAt).not.toBeNull();
      expect(earningAfter.eligibleAt!.getTime()).toBe(earningBefore.eligibleAt!.getTime());
      expect(refunds.length).toBe(0);
    });

    it("18. Booking.startAt/endAt unchanged; Phase 2 attendance evidence for the present party is preserved (not deleted) after convergence", async () => {
      const { tutor, booking } = await setupConfirmedCapturedBooking();
      const checkIn = await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" });
      const deadline = computeNoShowGraceDeadline(booking.startAt);

      await resolveSessionNoShowConvergence(booking.id, { clock: () => deadline });

      const finalBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(finalBooking.startAt.getTime()).toBe(booking.startAt.getTime());
      expect(finalBooking.endAt.getTime()).toBe(booking.endAt.getTime());

      const preservedEvent = await db.sessionAttendanceEvent.findUnique({ where: { id: checkIn.attendanceEventId } });
      expect(preservedEvent).not.toBeNull();
      expect(preservedEvent?.participantRole).toBe("TUTOR");
    });
  });

  describe("SCHEDULER — sweepDueNoShowConvergence (cron liveness backstop)", () => {
    it("19. Sweeps a genuinely-due (real past startAt) SCHEDULED session with one-sided presence to NO_SHOW", async () => {
      const pastStartAt = new Date(Date.now() - 20 * 60 * 1000); // 20 minutes ago: real wall-clock time already past T+15
      const { tutor, booking } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
      await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR", clock: () => new Date(pastStartAt.getTime() + 1000) });

      const result = await sweepDueNoShowConvergence();
      expect(result.transitioned).toBeGreaterThanOrEqual(1);

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("NO_SHOW");
    });
  });

  // ---------------------------------------------------------------------
  // Phase 5A — Financial Schema Foundation. Permanent regression coverage
  // for the two additive schema changes (Session_.noShowConvergedAt,
  // TutorEarningStatus.HELD) and the eligibleAt-nullability decision. No
  // new financial convergence logic is exercised here — only the schema
  // foundation and the single writer change (the SAME guarded updateMany
  // that flips Session_.status -> NO_SHOW now also writes
  // noShowConvergedAt, atomically).
  // ---------------------------------------------------------------------
  describe("PHASE 5A — Session_.noShowConvergedAt", () => {
    it("20. NO_SHOW transition writes noShowConvergedAt, and it is exactly the injected server clock value (not real wall-clock time)", async () => {
      const { tutor, booking } = await setupConfirmedCapturedBooking();
      await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" });
      const deadline = computeNoShowGraceDeadline(booking.startAt);

      const preSession = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(preSession.noShowConvergedAt).toBeNull();

      const result = await resolveSessionNoShowConvergence(booking.id, { clock: () => deadline });
      expect(result.transitioned).toBe(true);

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("NO_SHOW");
      expect(session.noShowConvergedAt).not.toBeNull();
      // Server-generated: equals the injected clock() value used inside the
      // SAME transaction as the status write, never a client-supplied time
      // and never merely "close to now."
      expect(session.noShowConvergedAt!.getTime()).toBe(deadline.getTime());
    });

    it("21. Repeated convergence never overwrites the original noShowConvergedAt (sequential calls, second call uses a DIFFERENT later clock)", async () => {
      const { tutor, booking } = await setupConfirmedCapturedBooking();
      await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" });
      const deadline = computeNoShowGraceDeadline(booking.startAt);
      const muchLater = new Date(deadline.getTime() + 60 * 60 * 1000);

      const first = await resolveSessionNoShowConvergence(booking.id, { clock: () => deadline });
      expect(first.transitioned).toBe(true);
      const afterFirst = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(afterFirst.noShowConvergedAt!.getTime()).toBe(deadline.getTime());

      // Second call is a clean no-op (status already NO_SHOW) even though
      // it uses a materially different clock value — if the write were not
      // guarded by the same `where: { status: "SCHEDULED" }` as the status
      // transition, this would incorrectly bump the timestamp forward.
      const second = await resolveSessionNoShowConvergence(booking.id, { clock: () => muchLater });
      expect(second.transitioned).toBe(false);

      const afterSecond = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(afterSecond.noShowConvergedAt!.getTime()).toBe(deadline.getTime());
      expect(afterSecond.noShowConvergedAt!.getTime()).not.toBe(muchLater.getTime());
    });

    it("22. Racing convergence workers never produce two different noShowConvergedAt values — exactly one write wins", async () => {
      const { tutor, booking } = await setupConfirmedCapturedBooking();
      await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" });
      const deadlineA = computeNoShowGraceDeadline(booking.startAt);
      const deadlineB = new Date(deadlineA.getTime() + 5000);

      await Promise.all([
        resolveSessionNoShowConvergence(booking.id, { clock: () => deadlineA }),
        resolveSessionNoShowConvergence(booking.id, { clock: () => deadlineB }),
      ]);

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("NO_SHOW");
      expect(session.noShowConvergedAt).not.toBeNull();
      // Whichever call's updateMany actually won, the committed timestamp
      // must be exactly one of the two candidate clock values — never a
      // hybrid, never both writes applied.
      expect([deadlineA.getTime(), deadlineB.getTime()]).toContain(session.noShowConvergedAt!.getTime());
    });

    it("23. NOT_YET_DUE convergence never fabricates noShowConvergedAt", async () => {
      const { tutor, booking } = await setupConfirmedCapturedBooking();
      await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" });
      const deadline = computeNoShowGraceDeadline(booking.startAt);
      const oneMsBefore = new Date(deadline.getTime() - 1);

      const result = await resolveSessionNoShowConvergence(booking.id, { clock: () => oneMsBefore });
      expect(result.decision).toBe("NOT_YET_DUE");
      expect(result.transitioned).toBe(false);

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.noShowConvergedAt).toBeNull();
    });

    it("24. NOT_APPLICABLE convergence (dual presence, IN_PROGRESS) never fabricates noShowConvergedAt", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" });
      await recordSessionCheckIn(booking.id, student.user.id, "STUDENT", { actorRole: "STUDENT" });
      const deadline = computeNoShowGraceDeadline(booking.startAt);

      const result = await resolveSessionNoShowConvergence(booking.id, { clock: () => deadline });
      expect(result.decision).toBe("NOT_APPLICABLE");

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("IN_PROGRESS");
      expect(session.noShowConvergedAt).toBeNull();
    });

    it("25. H.8 cancellation's own Session_.status -> CANCELLED write never sets noShowConvergedAt", async () => {
      const { student, booking } = await setupConfirmedCapturedBooking();
      await cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" });

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("CANCELLED");
      expect(session.noShowConvergedAt).toBeNull();
    });
  });

  describe("PHASE 5A — TutorEarningStatus.HELD", () => {
    it("26. Prisma/Postgres accept TutorEarningStatus.HELD as a valid TutorEarning.status value (schema-level acceptance only — no writer sets it in Phase 5A)", async () => {
      const { booking } = await setupConfirmedCapturedBooking();
      const earning = await db.tutorEarning.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(earning.status).toBe("PENDING_ELIGIBLE");

      // No production writer sets HELD in Phase 5A (per the spec's explicit
      // scope limit) — this directly exercises the new enum value the same
      // way the DB itself will store/read it, independent of any future
      // Phase 5B writer.
      const held = await db.tutorEarning.update({ where: { id: earning.id }, data: { status: "HELD" } });
      expect(held.status).toBe("HELD");

      const reread = await db.tutorEarning.findUniqueOrThrow({ where: { id: earning.id } });
      expect(reread.status).toBe("HELD");
    });

    it("27. H.8 cancellation still produces CANCELLED, never HELD — the two statuses remain distinct domains", async () => {
      const { student, booking } = await setupConfirmedCapturedBooking();
      const earningBefore = await db.tutorEarning.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(earningBefore.status).toBe("PENDING_ELIGIBLE");

      await cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" });

      const earningAfter = await db.tutorEarning.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(earningAfter.status).toBe("CANCELLED");
      expect(earningAfter.status).not.toBe("HELD");
      expect(earningAfter.cancelledAt).not.toBeNull();
    });
  });

  describe("PHASE 5A — TutorEarning.eligibleAt nullability", () => {
    it("28. Prisma accepts an explicit null eligibleAt, and markEligibleEarnings() fails closed (never treats a null eligibleAt as due/eligible)", async () => {
      const { booking } = await setupConfirmedCapturedBooking();
      const earning = await db.tutorEarning.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(earning.eligibleAt).not.toBeNull();

      // Directly exercise the new nullable column — no production writer
      // sets eligibleAt to null in Phase 5A (payments.ts is unchanged), so
      // this simulates the Phase 5B shape (creation-time null, pending a
      // later authoritative Session outcome) purely at the schema level.
      const nulled = await db.tutorEarning.update({ where: { id: earning.id }, data: { eligibleAt: null } });
      expect(nulled.eligibleAt).toBeNull();

      const { markEligibleEarnings } = await import("./tutorTransfers");
      await markEligibleEarnings();

      const reread = await db.tutorEarning.findUniqueOrThrow({ where: { id: earning.id } });
      // A null eligibleAt must never satisfy `eligibleAt: { lte: now }` —
      // SQL NULL comparisons are never true, so markEligibleEarnings' own
      // guarded updateMany already fails closed by construction. Assert the
      // actual observed behavior for THIS earning specifically (not a
      // global promoted-count, which could be perturbed by unrelated rows
      // elsewhere in the test database).
      expect(reread.status).toBe("PENDING_ELIGIBLE");
      expect(reread.eligibleAt).toBeNull();
    });
  });
});
