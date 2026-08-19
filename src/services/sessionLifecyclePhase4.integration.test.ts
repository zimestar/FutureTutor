import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";

// Session Lifecycle Phase 4 — IN_PROGRESS -> COMPLETED / INTERRUPTED. Mirrors
// sessionNoShowConvergence.integration.test.ts's own DB-target-redirection
// technique exactly (resolveVerifiedTestDatabase, tracked-id cleanup arrays,
// ambient @/lib/db singleton redirected to futuretutor_test BEFORE any
// transitively-DB-touching module is imported). Time-boundary tests use an
// INJECTED clock; genuine concurrency tests use real Promise.all/
// Promise.allSettled against the real database, never mocks.
//
// cancelBookingWithRefund is imported strictly READ-ONLY, as a reference for
// cancellation-interaction tests — cancellationPolicy.ts itself is NOT
// modified anywhere in Phase 4 (H.8 is closed and protected).

vi.mock("@/lib/stripe", () => ({ getStripeClient: vi.fn() }));

import { getStripeClient } from "@/lib/stripe";

let createCustomerPriceQuote: typeof import("./customerPricing").createCustomerPriceQuote;
let createTutorPayoutQuote: typeof import("./tutorPayout").createTutorPayoutQuote;
let reserveBookingPendingPayment: typeof import("./bookingCreation").reserveBookingPendingPayment;
let convergeToCaptured: typeof import("./payments").convergeToCaptured;
let cancelBookingWithRefund: typeof import("./cancellationPolicy").cancelBookingWithRefund;
let SessionAlreadyStartedError: typeof import("./cancellationPolicy").SessionAlreadyStartedError;
let SessionNotCancellableError: typeof import("./cancellationPolicy").SessionNotCancellableError;
let recordSessionCheckIn: typeof import("./sessionLifecycle").recordSessionCheckIn;
let getSessionContext: typeof import("./sessionLifecycle").getSessionContext;
let resolveSessionNoShowConvergence: typeof import("./sessionLifecycle").resolveSessionNoShowConvergence;
let resolveSessionCompletionConvergence: typeof import("./sessionLifecycle").resolveSessionCompletionConvergence;
let sweepDueSessionCompletionConvergence: typeof import("./sessionLifecycle").sweepDueSessionCompletionConvergence;
let requestSessionCompletionConvergence: typeof import("./sessionLifecycle").requestSessionCompletionConvergence;
let requestSessionInterruption: typeof import("./sessionLifecycle").requestSessionInterruption;
let SessionNotCheckInEligibleError: typeof import("./sessionLifecycle").SessionNotCheckInEligibleError;
let SessionInterruptionNotAuthorizedError: typeof import("./sessionLifecycle").SessionInterruptionNotAuthorizedError;
let SessionNotInterruptibleError: typeof import("./sessionLifecycle").SessionNotInterruptibleError;
let SessionViewerNotAuthorizedError: typeof import("./sessionLifecycle").SessionViewerNotAuthorizedError;

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

// 5 minutes out by default — already inside the 15-minute check-in window,
// still before startAt. Booking duration is 60 minutes (endAt = startAt+60min)
// throughout this file, matching every other Session Lifecycle integration
// suite's own default.
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
  ({ cancelBookingWithRefund, SessionAlreadyStartedError, SessionNotCancellableError } = await import("./cancellationPolicy"));
  ({
    recordSessionCheckIn,
    getSessionContext,
    resolveSessionNoShowConvergence,
    resolveSessionCompletionConvergence,
    sweepDueSessionCompletionConvergence,
    requestSessionCompletionConvergence,
    requestSessionInterruption,
    SessionNotCheckInEligibleError,
    SessionInterruptionNotAuthorizedError,
    SessionNotInterruptibleError,
    SessionViewerNotAuthorizedError,
  } = await import("./sessionLifecycle"));

  const { db: ambientDb } = await import("@/lib/db");
  const [{ current_database: ambientDatabaseName }] = await ambientDb.$queryRaw<
    Array<{ current_database: string }>
  >`SELECT current_database()`;
  if (ambientDatabaseName !== target.databaseName) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton reports current_database() = "${ambientDatabaseName}", but the verified test database is "${target.databaseName}". Refusing to run any Session Lifecycle Phase 4 integration test.`
    );
  }
  const devDatabaseNameForSafetyCheckOnly = devDatabaseUrlForSafetyCheckOnly
    ? new URL(devDatabaseUrlForSafetyCheckOnly).pathname.replace(/^\//, "")
    : null;
  if (devDatabaseNameForSafetyCheckOnly && ambientDatabaseName === devDatabaseNameForSafetyCheckOnly) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton's current_database() ("${ambientDatabaseName}") equals the real development database name. Refusing to run any Session Lifecycle Phase 4 integration test.`
    );
  }

  const subject = await db.subject.create({ data: { slug: `sl4-it-subject-${randomUUID()}`, sortOrder: 999 } });
  subjectId = subject.id;
  const level = await db.academicLevel.create({ data: { slug: `sl4-it-level-${randomUUID()}`, sortOrder: 999 } });
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
    const sessionIds = (await db.session_.findMany({ where: { bookingId: { in: createdBookingIds } }, select: { id: true } })).map((s) => s.id);
    if (sessionIds.length > 0) {
      await db.auditLog.deleteMany({ where: { entityId: { in: sessionIds } } });
    }
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
    await db.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
});

function uniqueEmail(prefix: string) {
  return `sl4-it-${prefix}-${randomUUID()}@futuretutor.test`;
}

async function createTutorUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("tutor"), role: "TUTOR" } });
  createdUserIds.push(user.id);
  const tutorProfile = await db.tutorProfile.create({
    data: { userId: user.id, slug: `sl4-it-tutor-${randomUUID()}`, applicationStatus: "APPROVED", payoutTier: "NEW", learningMode: "BOTH" },
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

async function setupConfirmedCapturedBooking(overrides: { startAt?: Date; guardian?: boolean } = {}) {
  const startAt = overrides.startAt ?? DEFAULT_TEST_START_AT;
  const tutor = await createTutorUser();

  let student: { user: { id: string } | null; studentProfile: { id: string } };
  let parent: { user: { id: string }; parentProfile: { id: string } } | null = null;

  if (overrides.guardian) {
    parent = await createParentUser();
    const child = await createGuardianManagedChild(parent.parentProfile.id, "ACTIVE");
    student = { user: null, studentProfile: child.studentProfile };
  } else {
    student = await createSelfManagedStudent();
  }

  const payerUserId = overrides.guardian ? parent!.user.id : student.user!.id;
  const quote = await makeQuote(payerUserId, student.studentProfile.id, startAt);
  const payoutQuote = await makePayoutQuote(tutor.tutorProfile.id, quote.id, startAt);
  const payment = await makePayment(quote.id, payerUserId);
  const booking = await reserveBooking({
    actorUserId: payerUserId,
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
  const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
  return { tutor, student, parent, quote, payoutQuote, payment: finalPayment, booking };
}

/** Brings a fresh booking to IN_PROGRESS via a real dual check-in (both
 * sides), using the injected clock so this is deterministic and does not
 * depend on wall-clock timing relative to the check-in window. */
async function bringToInProgress(
  tutor: { user: { id: string } },
  student: { user: { id: string } | null } | undefined,
  parent: { user: { id: string } } | null | undefined,
  booking: { id: string; startAt: Date },
  clock: () => Date = () => booking.startAt
) {
  await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR", clock });
  const studentActorUserId = student?.user?.id ?? parent!.user.id;
  const studentActorRole = student?.user ? "STUDENT" : "PARENT";
  await recordSessionCheckIn(booking.id, studentActorUserId, "STUDENT", { actorRole: studentActorRole, clock });
  const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
  expect(session.status).toBe("IN_PROGRESS");
  return session;
}

describe("Session Lifecycle Phase 4 — completion & interruption", () => {
  describe("COMPLETION — automatic convergence at Booking.endAt", () => {
    it("1-2. IN_PROGRESS session at exactly Booking.endAt converges to COMPLETED via resolveSessionCompletionConvergence", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);

      const result = await resolveSessionCompletionConvergence(booking.id, { clock: () => booking.endAt });
      expect(result.decision).toBe("COMPLETE");
      expect(result.transitioned).toBe(true);
      expect(result.sessionStatus).toBe("COMPLETED");

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("COMPLETED");
    });

    it("3. completedAt is the server-generated convergence instant, not merely copied from Booking.endAt or from startedAt", async () => {
      // Session starts 10 minutes late (still inside grace), converges 45
      // minutes after the contractual end — completedAt must equal the
      // injected convergence clock value exactly, proving it is derived from
      // clock() at write time, never from a scheduled field.
      const lateStart = () => new Date(DEFAULT_TEST_START_AT.getTime() + 10 * 60 * 1000);
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking, lateStart);

      const convergenceInstant = new Date(booking.endAt.getTime() + 45 * 60 * 1000);
      const result = await resolveSessionCompletionConvergence(booking.id, { clock: () => convergenceInstant });
      expect(result.completedAt?.getTime()).toBe(convergenceInstant.getTime());
      expect(result.completedAt?.getTime()).not.toBe(booking.endAt.getTime());

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.completedAt?.getTime()).toBe(convergenceInstant.getTime());
    });

    it("4. Booking.startAt/endAt (contractual schedule) are never mutated by completion convergence", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);
      await resolveSessionCompletionConvergence(booking.id, { clock: () => booking.endAt });

      const finalBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(finalBooking.startAt.getTime()).toBe(booking.startAt.getTime());
      expect(finalBooking.endAt.getTime()).toBe(booking.endAt.getTime());
    });

    it("5. Repeated completion convergence is idempotent — second call is a clean no-op, completedAt unchanged", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);

      const first = await resolveSessionCompletionConvergence(booking.id, { clock: () => booking.endAt });
      expect(first.transitioned).toBe(true);
      const firstCompletedAt = first.completedAt;

      const laterInstant = new Date(booking.endAt.getTime() + 60 * 60 * 1000);
      const second = await resolveSessionCompletionConvergence(booking.id, { clock: () => laterInstant });
      expect(second.decision).toBe("NOT_APPLICABLE");
      expect(second.transitioned).toBe(false);
      expect(second.sessionStatus).toBe("COMPLETED");

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.completedAt?.getTime()).toBe(firstCompletedAt?.getTime());
    });

    it("6. Delayed convergence (cron ran late) still produces the correct COMPLETED state, regardless of how much time has passed", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);

      const daysLate = new Date(booking.endAt.getTime() + 3 * 24 * 60 * 60 * 1000);
      const result = await resolveSessionCompletionConvergence(booking.id, { clock: () => daysLate });
      expect(result.transitioned).toBe(true);
      expect(result.sessionStatus).toBe("COMPLETED");
    });

    it("7. COMPLETED session rejects a later check-in attempt — cannot return to IN_PROGRESS through any existing writer", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);
      await resolveSessionCompletionConvergence(booking.id, { clock: () => booking.endAt });

      await expect(
        recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR", clock: () => new Date(booking.endAt.getTime() + 1000) })
      ).rejects.toBeInstanceOf(SessionNotCheckInEligibleError);

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("COMPLETED");
    });

    it("8. COMPLETED session cannot become NO_SHOW — no-show convergence observes NOT_APPLICABLE, zero mutation", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);
      await resolveSessionCompletionConvergence(booking.id, { clock: () => booking.endAt });

      const result = await resolveSessionNoShowConvergence(booking.id, { clock: () => new Date(booking.endAt.getTime() + 1000) });
      expect(result.decision).toBe("NOT_APPLICABLE");
      expect(result.transitioned).toBe(false);
      expect(result.sessionStatus).toBe("COMPLETED");
    });

    it("9. COMPLETED session cannot be normally cancelled — H.8's existing SCHEDULED-only guard rejects it for free, no cancellationPolicy.ts change needed", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);
      await resolveSessionCompletionConvergence(booking.id, { clock: () => booking.endAt });

      const payerUserId = student.user!.id;
      await expect(cancelBookingWithRefund(booking.id, payerUserId, { actorRole: "STUDENT" })).rejects.toBeInstanceOf(
        SessionNotCancellableError
      );

      const finalBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(finalBooking.status).toBe("CONFIRMED");
    });

    it("10. Completion convergence never mutates Payment, Refund, or TutorEarning (financial firewall)", async () => {
      const { tutor, student, booking, payment } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);

      const paymentBefore = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
      const earningBefore = await db.tutorEarning.findUniqueOrThrow({ where: { bookingId: booking.id } });

      await resolveSessionCompletionConvergence(booking.id, { clock: () => booking.endAt });

      const paymentAfter = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
      const earningAfter = await db.tutorEarning.findUniqueOrThrow({ where: { bookingId: booking.id } });
      const refunds = await db.refund.findMany({ where: { bookingId: booking.id } });

      expect(paymentAfter.status).toBe(paymentBefore.status);
      expect(paymentAfter.refundedAmountCents).toBe(paymentBefore.refundedAmountCents);
      expect(earningAfter.status).toBe(earningBefore.status);
      expect(earningAfter.amountCents).toBe(earningBefore.amountCents);
      // TutorEarning.eligibleAt is driven purely by Booking.endAt + a fixed
      // offset (see the model's own schema comment) — never by
      // Session_.status. Completion must not change it.
      // Phase 5A: eligibleAt is now nullable in the schema, but the writer
      // (payments.ts) is unchanged in this phase and always populates a
      // concrete Date at creation — assert it stays non-null and unchanged.
      expect(earningBefore.eligibleAt).not.toBeNull();
      expect(earningAfter.eligibleAt).not.toBeNull();
      expect(earningAfter.eligibleAt!.getTime()).toBe(earningBefore.eligibleAt!.getTime());
      expect(refunds.length).toBe(0);
    });

    it("Phase 5A — COMPLETED convergence never writes Session_.noShowConvergedAt (distinct field, no-show-only writer)", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);

      const preSession = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(preSession.noShowConvergedAt).toBeNull();

      const result = await resolveSessionCompletionConvergence(booking.id, { clock: () => booking.endAt });
      expect(result.sessionStatus).toBe("COMPLETED");

      const finalSession = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(finalSession.status).toBe("COMPLETED");
      expect(finalSession.completedAt).not.toBeNull();
      expect(finalSession.noShowConvergedAt).toBeNull();
    });

    it("SCHEDULER — sweepDueSessionCompletionConvergence sweeps a genuinely-due (real past endAt) IN_PROGRESS session to COMPLETED", async () => {
      const pastStartAt = new Date(Date.now() - 90 * 60 * 1000); // 90 minutes ago -> endAt 30 minutes ago
      const { tutor, student, booking } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
      await bringToInProgress(tutor, student, null, booking, () => new Date(pastStartAt.getTime() + 1000));

      const result = await sweepDueSessionCompletionConvergence();
      expect(result.transitioned).toBeGreaterThanOrEqual(1);

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("COMPLETED");
    });
  });

  describe("INTERRUPTION — explicit, authorized actor request only", () => {
    it("11a. Owning Tutor may interrupt an IN_PROGRESS session", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);

      const result = await requestSessionInterruption(booking.id, tutor.user.id, { actorRole: "TUTOR", reason: "Internet outage" });
      expect(result.sessionStatus).toBe("INTERRUPTED");
      expect(result.actorRole).toBe("TUTOR_OWNER");
      expect(result.reason).toBe("Internet outage");

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("INTERRUPTED");
    });

    it("11b. SELF_MANAGED Student may interrupt an IN_PROGRESS session", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);

      const result = await requestSessionInterruption(booking.id, student.user!.id, { actorRole: "STUDENT" });
      expect(result.sessionStatus).toBe("INTERRUPTED");
      expect(result.actorRole).toBe("SELF_MANAGED_STUDENT");
      expect(result.reason).toBeNull();
    });

    it("11c. GUARDIAN (ACTIVE relationship) may interrupt an IN_PROGRESS session on behalf of a GUARDIAN_MANAGED learner", async () => {
      const { tutor, student, parent, booking } = await setupConfirmedCapturedBooking({ guardian: true });
      await bringToInProgress(tutor, student, parent, booking);

      const result = await requestSessionInterruption(booking.id, parent!.user.id, { actorRole: "PARENT", reason: "Child unwell" });
      expect(result.sessionStatus).toBe("INTERRUPTED");
      expect(result.actorRole).toBe("GUARDIAN");
    });

    it("11d. ADMIN may interrupt an IN_PROGRESS session", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);
      const admin = await db.user.create({ data: { email: uniqueEmail("admin"), role: "ADMIN" } });
      createdUserIds.push(admin.id);

      const result = await requestSessionInterruption(booking.id, admin.id, { actorRole: "ADMIN", reason: "Support escalation" });
      expect(result.sessionStatus).toBe("INTERRUPTED");
      expect(result.actorRole).toBe("ADMIN");
    });

    it("12. SCHEDULED session cannot be normally interrupted", async () => {
      const { tutor, booking } = await setupConfirmedCapturedBooking();
      await expect(requestSessionInterruption(booking.id, tutor.user.id, { actorRole: "TUTOR" })).rejects.toBeInstanceOf(
        SessionNotInterruptibleError
      );
      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("SCHEDULED");
    });

    it("13. NO_SHOW session cannot be interrupted", async () => {
      const { tutor, booking } = await setupConfirmedCapturedBooking();
      await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" });
      const graceDeadline = new Date(booking.startAt.getTime() + 15 * 60 * 1000);
      await resolveSessionNoShowConvergence(booking.id, { clock: () => graceDeadline });

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("NO_SHOW");

      await expect(requestSessionInterruption(booking.id, tutor.user.id, { actorRole: "TUTOR" })).rejects.toBeInstanceOf(
        SessionNotInterruptibleError
      );
    });

    it("14. COMPLETED session cannot be interrupted", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);
      await resolveSessionCompletionConvergence(booking.id, { clock: () => booking.endAt });

      await expect(
        requestSessionInterruption(booking.id, tutor.user.id, { actorRole: "TUTOR" })
      ).rejects.toBeInstanceOf(SessionNotInterruptibleError);

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("COMPLETED");
    });

    it("14b. CANCELLED session cannot be interrupted", async () => {
      const { student, booking } = await setupConfirmedCapturedBooking();
      await cancelBookingWithRefund(booking.id, student.user!.id, { actorRole: "STUDENT" });

      await expect(
        requestSessionInterruption(booking.id, student.user!.id, { actorRole: "STUDENT" })
      ).rejects.toBeInstanceOf(SessionNotInterruptibleError);
    });

    it("15. Unrelated Tutor/Student are rejected — never authorized to interrupt someone else's session", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);

      const otherTutor = await createTutorUser();
      const otherStudent = await createSelfManagedStudent();

      await expect(
        requestSessionInterruption(booking.id, otherTutor.user.id, { actorRole: "TUTOR" })
      ).rejects.toBeInstanceOf(SessionInterruptionNotAuthorizedError);
      await expect(
        requestSessionInterruption(booking.id, otherStudent.user.id, { actorRole: "STUDENT" })
      ).rejects.toBeInstanceOf(SessionInterruptionNotAuthorizedError);

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("IN_PROGRESS");
    });

    it("16. endedAt is the server-generated interruption instant, never a client-influenced value", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);

      const interruptInstant = new Date(booking.startAt.getTime() + 20 * 60 * 1000);
      const result = await requestSessionInterruption(booking.id, tutor.user.id, { actorRole: "TUTOR", clock: () => interruptInstant });
      expect(result.occurredAt.getTime()).toBe(interruptInstant.getTime());

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.endedAt?.getTime()).toBe(interruptInstant.getTime());
      // completedAt is deliberately NOT set for an interrupted session — the
      // two terminal timestamps are non-overlapping fields (see
      // requestSessionInterruption's own doc comment).
      expect(session.completedAt).toBeNull();
    });

    it("17. Duplicate interruption request is safe — second attempt cleanly rejected, no double AuditLog row, no state change", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);

      const first = await requestSessionInterruption(booking.id, tutor.user.id, { actorRole: "TUTOR", reason: "first" });
      expect(first.sessionStatus).toBe("INTERRUPTED");

      await expect(
        requestSessionInterruption(booking.id, tutor.user.id, { actorRole: "TUTOR", reason: "second" })
      ).rejects.toBeInstanceOf(SessionNotInterruptibleError);

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.endedAt?.getTime()).toBe(first.occurredAt.getTime()); // unchanged by the rejected duplicate

      const auditRows = await db.auditLog.findMany({ where: { entityType: "Session_", entityId: session.id } });
      expect(auditRows.length).toBe(1);
      expect((auditRows[0].metadata as { reason?: string })?.reason).toBe("first");
    });

    it("18. Interruption never mutates Payment, Refund, or TutorEarning (financial firewall)", async () => {
      const { tutor, student, booking, payment } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);

      const paymentBefore = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
      const earningBefore = await db.tutorEarning.findUniqueOrThrow({ where: { bookingId: booking.id } });

      await requestSessionInterruption(booking.id, tutor.user.id, { actorRole: "TUTOR" });

      const paymentAfter = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
      const earningAfter = await db.tutorEarning.findUniqueOrThrow({ where: { bookingId: booking.id } });
      const refunds = await db.refund.findMany({ where: { bookingId: booking.id } });

      expect(paymentAfter.status).toBe(paymentBefore.status);
      expect(earningAfter.status).toBe(earningBefore.status);
      // Phase 5A: eligibleAt is now nullable in the schema, but the writer
      // (payments.ts) is unchanged in this phase and always populates a
      // concrete Date at creation — assert it stays non-null and unchanged.
      expect(earningBefore.eligibleAt).not.toBeNull();
      expect(earningAfter.eligibleAt).not.toBeNull();
      expect(earningAfter.eligibleAt!.getTime()).toBe(earningBefore.eligibleAt!.getTime());
      expect(refunds.length).toBe(0);
    });

    it("Phase 5A — INTERRUPTED never writes Session_.noShowConvergedAt (distinct field, no-show-only writer)", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);

      const preSession = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(preSession.noShowConvergedAt).toBeNull();

      const result = await requestSessionInterruption(booking.id, tutor.user.id, { actorRole: "TUTOR" });
      expect(result.sessionStatus).toBe("INTERRUPTED");

      const finalSession = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(finalSession.status).toBe("INTERRUPTED");
      expect(finalSession.endedAt).not.toBeNull();
      expect(finalSession.noShowConvergedAt).toBeNull();
    });

    it("Reason is capped/trimmed and empty/whitespace-only is normalized to null", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);

      const longReason = "x".repeat(600);
      const result = await requestSessionInterruption(booking.id, tutor.user.id, { actorRole: "TUTOR", reason: longReason });
      expect(result.reason?.length).toBe(500);
    });
  });

  describe("CONCURRENCY — race safety (task §14)", () => {
    it("19. Completion vs completion — two concurrent convergence calls, exactly one transitions, one authoritative final outcome", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);

      const [a, b] = await Promise.all([
        resolveSessionCompletionConvergence(booking.id, { clock: () => booking.endAt }),
        resolveSessionCompletionConvergence(booking.id, { clock: () => booking.endAt }),
      ]);

      const transitioned = [a, b].filter((r) => r.transitioned);
      expect(transitioned.length).toBe(1);
      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("COMPLETED");
    });

    it("20. Interruption vs interruption — two concurrent requests, exactly one succeeds", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);

      const outcomes = await Promise.allSettled([
        requestSessionInterruption(booking.id, tutor.user.id, { actorRole: "TUTOR", reason: "tutor side" }),
        requestSessionInterruption(booking.id, student.user!.id, { actorRole: "STUDENT", reason: "student side" }),
      ]);

      const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
      const rejected = outcomes.filter((o) => o.status === "rejected");
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      if (rejected[0]?.status === "rejected") {
        expect(rejected[0].reason).toBeInstanceOf(SessionNotInterruptibleError);
      }

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("INTERRUPTED");
      const auditRows = await db.auditLog.findMany({ where: { entityType: "Session_", entityId: session.id } });
      expect(auditRows.length).toBe(1); // only the winner wrote an AuditLog row
    });

    it("21. Completion vs interruption — both eligible at the same instant, exactly one terminal outcome ever committed", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);

      const outcomes = await Promise.allSettled([
        resolveSessionCompletionConvergence(booking.id, { clock: () => booking.endAt }),
        requestSessionInterruption(booking.id, tutor.user.id, { actorRole: "TUTOR", clock: () => booking.endAt }),
      ]);

      // Both calls are individually well-behaved (completion is a
      // convergence — it never throws for losing the race, it just reports
      // transitioned:false); interruption either wins (fulfilled) or loses
      // (rejected with SessionNotInterruptibleError once it observes the
      // session already COMPLETED).
      expect(outcomes[0].status).toBe("fulfilled");
      if (outcomes[1].status === "rejected") {
        expect(outcomes[1].reason).toBeInstanceOf(SessionNotInterruptibleError);
      }

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(["COMPLETED", "INTERRUPTED"]).toContain(session.status);

      // Never a mixed/corrupted state: completedAt and endedAt are never
      // BOTH non-null for the same session.
      expect(session.completedAt != null && session.endedAt != null).toBe(false);
    });

    it("22. Cancellation vs an already-IN_PROGRESS session (early dual check-in, H.8's own discovered scenario) — cancellation is rejected by the pre-existing guard, independent of Phase 4", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      // Real clock, both check in immediately — booking.startAt is 5 minutes
      // in the future, so this happens strictly before startAt, exactly like
      // the H.8 Session Writer Hardening report's own scenario.
      await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" });
      await recordSessionCheckIn(booking.id, student.user!.id, "STUDENT", { actorRole: "STUDENT" });
      const preRace = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(preRace.status).toBe("IN_PROGRESS");

      const outcomes = await Promise.allSettled([
        cancelBookingWithRefund(booking.id, student.user!.id, { actorRole: "STUDENT" }), // real clock, still < startAt
        requestSessionInterruption(booking.id, tutor.user.id, { actorRole: "TUTOR" }), // real clock
      ]);

      expect(outcomes[0].status).toBe("rejected");
      if (outcomes[0].status === "rejected") {
        expect(outcomes[0].reason).toBeInstanceOf(SessionNotCancellableError);
      }
      expect(outcomes[1].status).toBe("fulfilled");

      const finalBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
      const finalSession = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(finalBooking.status).toBe("CONFIRMED"); // cancellation never touched it
      expect(finalSession.status).toBe("INTERRUPTED");
    });

    it("23. Cancellation vs completion — structurally disjoint under one shared real clock (Booking.endAt is always > Booking.startAt, so completion eligibility implies cancellation's own SessionAlreadyStartedError boundary has already tripped)", async () => {
      const pastStartAt = new Date(Date.now() - 90 * 60 * 1000); // real wall-clock: well past both startAt and endAt
      const { tutor, student, booking } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
      await bringToInProgress(tutor, student, null, booking, () => new Date(pastStartAt.getTime() + 1000));

      const outcomes = await Promise.allSettled([
        cancelBookingWithRefund(booking.id, student.user!.id, { actorRole: "STUDENT" }), // real (unmocked) clock
        resolveSessionCompletionConvergence(booking.id), // real (unmocked) clock — same wall clock
      ]);

      expect(outcomes[0].status).toBe("rejected");
      if (outcomes[0].status === "rejected") {
        expect(outcomes[0].reason).toBeInstanceOf(SessionAlreadyStartedError);
      }
      expect(outcomes[1].status).toBe("fulfilled");

      const finalBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
      const finalSession = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(finalBooking.status).toBe("CONFIRMED");
      expect(finalSession.status).toBe("COMPLETED");
    });

    it("24. No-show convergence vs a Phase-4 terminal transition — no-show convergence against an IN_PROGRESS session racing completion is a clean no-op, never corrupts the outcome", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);

      const outcomes = await Promise.allSettled([
        resolveSessionNoShowConvergence(booking.id, { clock: () => booking.endAt }),
        resolveSessionCompletionConvergence(booking.id, { clock: () => booking.endAt }),
      ]);

      expect(outcomes[0].status).toBe("fulfilled");
      expect(outcomes[1].status).toBe("fulfilled");
      if (outcomes[0].status === "fulfilled") {
        expect(outcomes[0].value.decision).toBe("NOT_APPLICABLE"); // session was never SCHEDULED at evaluation time
        expect(outcomes[0].value.transitioned).toBe(false);
      }

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("COMPLETED");
    });

    it("25a. Check-in (reconnect) attempt against an already-terminal (INTERRUPTED) session is rejected", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);
      await requestSessionInterruption(booking.id, tutor.user.id, { actorRole: "TUTOR" });

      await expect(
        recordSessionCheckIn(booking.id, student.user!.id, "STUDENT", { actorRole: "STUDENT" })
      ).rejects.toBeInstanceOf(SessionNotCheckInEligibleError);
    });

    it("25b. Reconnect check-in racing an interruption request on the same IN_PROGRESS session never corrupts state — every outcome is individually valid", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);

      const outcomes = await Promise.allSettled([
        recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" }), // reconnect check-in, harmless either order
        requestSessionInterruption(booking.id, student.user!.id, { actorRole: "STUDENT" }),
      ]);

      // Interruption is unaffected by check-in ordering (check-in during
      // IN_PROGRESS never mutates Session_.status itself).
      expect(outcomes[1].status).toBe("fulfilled");
      // Check-in either succeeds (raced before interruption committed) or is
      // cleanly rejected as no-longer-eligible (raced after) — never a
      // corrupting third outcome.
      if (outcomes[0].status === "rejected") {
        expect(outcomes[0].reason).toBeInstanceOf(SessionNotCheckInEligibleError);
      }

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("INTERRUPTED");
    });
  });

  describe("READ MODEL — getSessionContext exposes the Phase 4 contract (task §20)", () => {
    it("exposes endedAt (null while not interrupted, set after interruption) and completedAt independently", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);

      const midFlight = await getSessionContext(booking.id, tutor.user.id, "TUTOR");
      expect(midFlight.status).toBe("IN_PROGRESS");
      expect(midFlight.endedAt).toBeNull();
      expect(midFlight.completedAt).toBeNull();
      expect(midFlight.allowedActions).toContain("REQUEST_INTERRUPTION");
      expect(midFlight.viewerCanRequestInterruption).toBe(true);

      const interruptInstant = new Date(booking.startAt.getTime() + 5 * 60 * 1000);
      await requestSessionInterruption(booking.id, tutor.user.id, { actorRole: "TUTOR", clock: () => interruptInstant });

      const afterInterrupt = await getSessionContext(booking.id, tutor.user.id, "TUTOR");
      expect(afterInterrupt.status).toBe("INTERRUPTED");
      expect(afterInterrupt.endedAt?.getTime()).toBe(interruptInstant.getTime());
      expect(afterInterrupt.completedAt).toBeNull();
      expect(afterInterrupt.viewerCanRequestInterruption).toBe(false);
      expect(afterInterrupt.allowedActions).not.toContain("REQUEST_INTERRUPTION");
    });

    it("REQUEST_INTERRUPTION is never offered for a SCHEDULED session, even to an authorized viewer", async () => {
      const { tutor, booking } = await setupConfirmedCapturedBooking();
      const context = await getSessionContext(booking.id, tutor.user.id, "TUTOR");
      expect(context.status).toBe("SCHEDULED");
      expect(context.viewerCanRequestInterruption).toBe(false);
      expect(context.allowedActions).not.toContain("REQUEST_INTERRUPTION");
    });

    it("exposes completedAt after completion convergence, endedAt stays null", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);
      await resolveSessionCompletionConvergence(booking.id, { clock: () => booking.endAt });

      const context = await getSessionContext(booking.id, tutor.user.id, "TUTOR");
      expect(context.status).toBe("COMPLETED");
      expect(context.completedAt?.getTime()).toBe(booking.endAt.getTime());
      expect(context.endedAt).toBeNull();
      expect(context.scheduledStartAt.getTime()).toBe(booking.startAt.getTime());
      expect(context.scheduledEndAt.getTime()).toBe(booking.endAt.getTime());
    });
  });

  describe("LAZY CONVERGENCE HARDENING — requestSessionCompletionConvergence (post-review hardening task)", () => {
    it("H1. Before Booking.endAt, lazy evaluation does not complete", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);

      const stillBeforeEnd = new Date(booking.endAt.getTime() - 5 * 60 * 1000);
      const result = await requestSessionCompletionConvergence(booking.id, tutor.user.id, "TUTOR", {
        clock: () => stillBeforeEnd,
      });
      expect(result.decision).toBe("NOT_YET_DUE");
      expect(result.transitioned).toBe(false);
      expect(result.sessionStatus).toBe("IN_PROGRESS");

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("IN_PROGRESS");
      expect(session.completedAt).toBeNull();
    });

    it("H2. At/after Booking.endAt, an authorized request converges IN_PROGRESS -> COMPLETED", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);

      const result = await requestSessionCompletionConvergence(booking.id, tutor.user.id, "TUTOR", {
        clock: () => booking.endAt,
      });
      expect(result.decision).toBe("COMPLETE");
      expect(result.transitioned).toBe(true);
      expect(result.sessionStatus).toBe("COMPLETED");

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("COMPLETED");
    });

    it("H3. completedAt is server-generated — equals the convergence clock instant, never Booking.endAt or a client-influenced value", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);

      const convergenceInstant = new Date(booking.endAt.getTime() + 20 * 60 * 1000);
      const result = await requestSessionCompletionConvergence(booking.id, tutor.user.id, "TUTOR", {
        clock: () => convergenceInstant,
      });
      expect(result.completedAt?.getTime()).toBe(convergenceInstant.getTime());
      expect(result.completedAt?.getTime()).not.toBe(booking.endAt.getTime());

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.completedAt?.getTime()).toBe(convergenceInstant.getTime());
    });

    it("H4. Unauthorized users cannot use the authenticated adapter — denied before resolveSessionCompletionConvergence is ever invoked, zero side effect", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);

      const otherTutor = await createTutorUser();
      const otherStudent = await createSelfManagedStudent();

      await expect(
        requestSessionCompletionConvergence(booking.id, otherTutor.user.id, "TUTOR", { clock: () => booking.endAt })
      ).rejects.toBeInstanceOf(SessionViewerNotAuthorizedError);
      await expect(
        requestSessionCompletionConvergence(booking.id, otherStudent.user.id, "STUDENT", { clock: () => booking.endAt })
      ).rejects.toBeInstanceOf(SessionViewerNotAuthorizedError);

      // Booking.endAt has already passed at the injected clock instant used
      // above — if authorization were skipped (or checked after the write),
      // this session would have converged. It must not have.
      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("IN_PROGRESS");
      expect(session.completedAt).toBeNull();
    });

    it("H5. Duplicate lazy requests are idempotent — sequential second call is a clean no-op, completedAt unchanged", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);

      const first = await requestSessionCompletionConvergence(booking.id, tutor.user.id, "TUTOR", {
        clock: () => booking.endAt,
      });
      expect(first.transitioned).toBe(true);

      // A second, later authorized request from a DIFFERENT authorized
      // viewer proves idempotency holds regardless of who asks.
      const laterInstant = new Date(booking.endAt.getTime() + 30 * 60 * 1000);
      const second = await requestSessionCompletionConvergence(booking.id, student.user!.id, "STUDENT", {
        clock: () => laterInstant,
      });
      expect(second.decision).toBe("NOT_APPLICABLE");
      expect(second.transitioned).toBe(false);
      expect(second.sessionStatus).toBe("COMPLETED");

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.completedAt?.getTime()).toBe(first.completedAt?.getTime());
    });

    it("H6. Concurrent duplicate lazy requests (genuine race) — exactly one transitions, one authoritative completedAt", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);

      const [a, b] = await Promise.all([
        requestSessionCompletionConvergence(booking.id, tutor.user.id, "TUTOR", { clock: () => booking.endAt }),
        requestSessionCompletionConvergence(booking.id, student.user!.id, "STUDENT", { clock: () => booking.endAt }),
      ]);

      // Exactly one of the two racing calls performs the actual write; the
      // loser retries under Serializable isolation, re-reads the
      // already-COMPLETED session, and reports transitioned: false with
      // decision NOT_APPLICABLE (completedAt: null on its own result,
      // mirroring test #19's identical completion-vs-completion race above
      // — the loser's own return value never re-observes the winner's
      // committed completedAt; only a fresh read does).
      const transitioned = [a, b].filter((r) => r.transitioned);
      expect(transitioned.length).toBe(1);
      const winner = transitioned[0];

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("COMPLETED");
      expect(session.completedAt?.getTime()).toBe(winner.completedAt?.getTime());
    });

    it("H7. Lazy request vs cron sweep (genuine race, real clock, real DB) remains safe — both converge to the same COMPLETED state", async () => {
      const pastStartAt = new Date(Date.now() - 90 * 60 * 1000); // real wall-clock: 90 min ago -> endAt 30 min ago
      const { tutor, student, booking } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
      await bringToInProgress(tutor, student, null, booking, () => new Date(pastStartAt.getTime() + 1000));

      const [lazyResult, sweepResult] = await Promise.all([
        requestSessionCompletionConvergence(booking.id, tutor.user.id, "TUTOR"), // real (unmocked) clock
        sweepDueSessionCompletionConvergence(), // real (unmocked) clock — same wall clock
      ]);

      expect(lazyResult.sessionStatus).toBe("COMPLETED");
      expect(sweepResult.evaluated).toBeGreaterThanOrEqual(1);

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(session.status).toBe("COMPLETED");
      expect(session.completedAt).not.toBeNull();
    });

    it("H8. Lazy completion vs interruption (genuine race) preserves exactly one terminal outcome, never a mixed/corrupted state", async () => {
      const { tutor, student, booking } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);

      const outcomes = await Promise.allSettled([
        requestSessionCompletionConvergence(booking.id, tutor.user.id, "TUTOR", { clock: () => booking.endAt }),
        requestSessionInterruption(booking.id, student.user!.id, { actorRole: "STUDENT", clock: () => booking.endAt }),
      ]);

      // The lazy completion call is individually well-behaved (a
      // convergence — it never throws for losing the race, it just reports
      // transitioned: false); interruption either wins (fulfilled) or loses
      // (rejected with SessionNotInterruptibleError once it observes the
      // session already COMPLETED).
      expect(outcomes[0].status).toBe("fulfilled");
      if (outcomes[1].status === "rejected") {
        expect(outcomes[1].reason).toBeInstanceOf(SessionNotInterruptibleError);
      }

      const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
      expect(["COMPLETED", "INTERRUPTED"]).toContain(session.status);
      // Never a mixed/corrupted state: completedAt and endedAt are never
      // BOTH non-null for the same session.
      expect(session.completedAt != null && session.endedAt != null).toBe(false);
    });

    it("H9. Lazy completion convergence never mutates Payment, Refund, or TutorEarning (financial firewall)", async () => {
      const { tutor, student, booking, payment } = await setupConfirmedCapturedBooking();
      await bringToInProgress(tutor, student, null, booking);

      const paymentBefore = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
      const earningBefore = await db.tutorEarning.findUniqueOrThrow({ where: { bookingId: booking.id } });

      await requestSessionCompletionConvergence(booking.id, tutor.user.id, "TUTOR", { clock: () => booking.endAt });

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
  });
});
