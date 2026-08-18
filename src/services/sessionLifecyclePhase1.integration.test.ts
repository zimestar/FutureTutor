import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";

// Session Lifecycle Phase 1 — permanent DB-integration tests for the
// additive schema foundation only (SessionStatus.INTERRUPTED,
// Session_.completedAt). Mirrors cancellationRefund.integration.test.ts's
// own style and DB-target-redirection technique exactly (resolveVerifiedTestDatabase,
// tracked-id cleanup arrays, ambient @/lib/db singleton redirected to
// futuretutor_test BEFORE any transitively-DB-touching module is imported).
// This file deliberately does NOT implement or exercise any Session
// Lifecycle business logic — it only proves: (1) the new enum value and
// column are accepted and persist correctly; (2) nothing about existing
// payment-capture / H.8 cancellation behavior changed.

vi.mock("@/lib/stripe", () => ({ getStripeClient: vi.fn() }));

import { getStripeClient } from "@/lib/stripe";

let createCustomerPriceQuote: typeof import("./customerPricing").createCustomerPriceQuote;
let createTutorPayoutQuote: typeof import("./tutorPayout").createTutorPayoutQuote;
let reserveBookingPendingPayment: typeof import("./bookingCreation").reserveBookingPendingPayment;
let convergeToCaptured: typeof import("./payments").convergeToCaptured;
let cancelBookingWithRefund: typeof import("./cancellationPolicy").cancelBookingWithRefund;

let db: PrismaClient;
let subjectId: string;
let academicLevelId: string;

const createdUserIds: string[] = [];
const createdStudentProfileIds: string[] = [];
const createdTutorProfileIds: string[] = [];
const createdCustomerQuoteIds: string[] = [];
const createdTutorPayoutQuoteIds: string[] = [];
const createdPaymentIds: string[] = [];
const createdBookingIds: string[] = [];

const FAR_FUTURE_START = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

beforeAll(async () => {
  const target = resolveVerifiedTestDatabase();
  const devDatabaseUrlForSafetyCheckOnly = process.env.DATABASE_URL;
  const adapter = new PrismaPg({ connectionString: target.connectionString });
  db = new PrismaClient({ adapter });

  // Redirect the ambient db singleton used internally by payments.ts /
  // cancellationPolicy.ts to the SAME verified test database, only after
  // resolveVerifiedTestDatabase() has already positively confirmed it is
  // distinct from the real development database. Every dynamic import
  // below happens strictly after this line.
  process.env.DATABASE_URL = target.connectionString;

  ({ createCustomerPriceQuote } = await import("./customerPricing"));
  ({ createTutorPayoutQuote } = await import("./tutorPayout"));
  ({ reserveBookingPendingPayment } = await import("./bookingCreation"));
  ({ convergeToCaptured } = await import("./payments"));
  ({ cancelBookingWithRefund } = await import("./cancellationPolicy"));

  const { db: ambientDb } = await import("@/lib/db");
  const [{ current_database: ambientDatabaseName }] = await ambientDb.$queryRaw<
    Array<{ current_database: string }>
  >`SELECT current_database()`;
  if (ambientDatabaseName !== target.databaseName) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton reports current_database() = "${ambientDatabaseName}", but the verified test database is "${target.databaseName}". Refusing to run any Session Lifecycle Phase 1 integration test.`
    );
  }
  const devDatabaseNameForSafetyCheckOnly = devDatabaseUrlForSafetyCheckOnly
    ? new URL(devDatabaseUrlForSafetyCheckOnly).pathname.replace(/^\//, "")
    : null;
  if (devDatabaseNameForSafetyCheckOnly && ambientDatabaseName === devDatabaseNameForSafetyCheckOnly) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton's current_database() ("${ambientDatabaseName}") equals the real development database name. Refusing to run any Session Lifecycle Phase 1 integration test.`
    );
  }

  const subject = await db.subject.create({ data: { slug: `slp1-it-subject-${randomUUID()}`, sortOrder: 999 } });
  subjectId = subject.id;
  const level = await db.academicLevel.create({ data: { slug: `slp1-it-level-${randomUUID()}`, sortOrder: 999 } });
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
  if (createdStudentProfileIds.length > 0) {
    await db.studentProfile.deleteMany({ where: { id: { in: createdStudentProfileIds } } });
    createdStudentProfileIds.length = 0;
  }
  if (createdUserIds.length > 0) {
    await db.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
});

function uniqueEmail(prefix: string) {
  return `slp1-it-${prefix}-${randomUUID()}@futuretutor.test`;
}

async function createTutorUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("tutor"), role: "TUTOR" } });
  createdUserIds.push(user.id);
  const tutorProfile = await db.tutorProfile.create({
    data: { userId: user.id, slug: `slp1-it-tutor-${randomUUID()}`, applicationStatus: "APPROVED", payoutTier: "NEW", learningMode: "BOTH" },
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

async function makeQuote(actorUserId: string, studentProfileId: string, requestedStartAt: Date = FAR_FUTURE_START) {
  const quote = await createCustomerPriceQuote(
    { createdByUserId: actorUserId, studentProfileId, subjectId, academicLevelId, tutoringMode: "ONLINE", durationMinutes: 60, requestedStartAt },
    db
  );
  createdCustomerQuoteIds.push(quote.id);
  return quote;
}

async function makePayoutQuote(tutorProfileId: string, customerQuoteId: string, requestedStartAt: Date = FAR_FUTURE_START) {
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
  const startAt = params.startAt ?? FAR_FUTURE_START;
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

/** Full happy-path setup: a CONFIRMED booking with a CAPTURED payment,
 * exactly mirroring cancellationRefund.integration.test.ts's own helper —
 * this is the exact code path Phase 1 must leave unchanged. */
async function setupConfirmedCapturedBooking(overrides: { startAt?: Date } = {}) {
  const tutor = await createTutorUser();
  const student = await createSelfManagedStudent();
  const quote = await makeQuote(student.user.id, student.studentProfile.id, overrides.startAt);
  const payoutQuote = await makePayoutQuote(tutor.tutorProfile.id, quote.id, overrides.startAt);
  const payment = await makePayment(quote.id, student.user.id);
  const booking = await reserveBooking({
    actorUserId: student.user.id,
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
  return { tutor, student, quote, payoutQuote, payment: finalPayment, booking };
}

// ===========================================================================
// 1-2. SessionStatus.INTERRUPTED is accepted and persists independently of
// Booking.status.
// ===========================================================================
describe("Session Lifecycle Phase 1 — SessionStatus.INTERRUPTED (integration)", () => {
  it("Prisma accepts Session_.status = INTERRUPTED and persists it without altering Booking.status", async () => {
    const { booking } = await setupConfirmedCapturedBooking();

    const updated = await db.session_.update({
      where: { bookingId: booking.id },
      data: { status: "INTERRUPTED" },
    });
    expect(updated.status).toBe("INTERRUPTED");

    const unchangedBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(unchangedBooking.status).toBe("CONFIRMED");
  });
});

// ===========================================================================
// 3-4. Session_.completedAt: nullable across non-completion statuses, and
// persistable as a real timestamp for COMPLETED.
// ===========================================================================
describe("Session Lifecycle Phase 1 — Session_.completedAt (integration)", () => {
  it("completedAt remains null for SCHEDULED/IN_PROGRESS/NO_SHOW/CANCELLED — no invented constraint", async () => {
    const { booking } = await setupConfirmedCapturedBooking();

    const scheduled = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
    expect(scheduled.status).toBe("SCHEDULED");
    expect(scheduled.completedAt).toBeNull();

    for (const status of ["IN_PROGRESS", "NO_SHOW", "CANCELLED"] as const) {
      const updated = await db.session_.update({ where: { bookingId: booking.id }, data: { status } });
      expect(updated.status).toBe(status);
      expect(updated.completedAt).toBeNull();
    }
  });

  it("a COMPLETED session can persist a completedAt timestamp", async () => {
    const { booking } = await setupConfirmedCapturedBooking();
    const completionTime = new Date();

    const updated = await db.session_.update({
      where: { bookingId: booking.id },
      data: { status: "COMPLETED", completedAt: completionTime },
    });

    expect(updated.status).toBe("COMPLETED");
    expect(updated.completedAt?.getTime()).toBe(completionTime.getTime());
  });
});

// ===========================================================================
// 5. Payment-capture regression: convergeToCaptured must still create
// Session_.status = SCHEDULED and must NEVER fabricate completedAt.
// ===========================================================================
describe("Session Lifecycle Phase 1 — payment-capture compatibility (integration)", () => {
  it("convergeToCaptured still creates Session_ with status SCHEDULED and completedAt null", async () => {
    const { booking } = await setupConfirmedCapturedBooking();

    const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
    expect(session.status).toBe("SCHEDULED");
    expect(session.completedAt).toBeNull();
    expect(session.startedAt).toBeNull();
    expect(session.endedAt).toBeNull();

    const finalBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(finalBooking.status).toBe("CONFIRMED");
  });
});

// ===========================================================================
// 6. H.8 cancellation regression: SCHEDULED -> CANCELLED must still work,
// unaffected by the new enum value / column.
// ===========================================================================
describe("Session Lifecycle Phase 1 — H.8 cancellation compatibility (integration)", () => {
  it("cancelBookingWithRefund still transitions Session_ SCHEDULED -> CANCELLED", async () => {
    const { student, booking } = await setupConfirmedCapturedBooking();

    const before = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
    expect(before.status).toBe("SCHEDULED");

    await cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" });

    const finalBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(finalBooking.status).toBe("CANCELLED");

    const finalSession = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
    expect(finalSession.status).toBe("CANCELLED");
    expect(finalSession.completedAt).toBeNull();
  });
});
