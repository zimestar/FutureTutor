import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";

// Phase H.8 — permanent DB-integration tests for cancellation/refund/
// financial convergence, mirroring learnerPayerWiring.integration.test.ts's
// own style (resolveVerifiedTestDatabase, tracked-id cleanup arrays). This
// file never performs a real Stripe network call: @/lib/stripe is mocked
// module-wide (below), with a small hand-built fake Stripe backend that
// each test configures explicitly. PAYMENT_MODE in .env is "stripe_test",
// so paymentsUseStripe() is true throughout this file's process — every
// Stripe-touching code path in payments.ts is exercised against the mock,
// never a real network call.
//
// IMPORTANT — DB-target redirection: cancellationPolicy.ts/payments.ts/
// tutorTransfers.ts (like every other Phase G/G.1 "Step A/B/C" financial
// function in this codebase — see payments.ts's own domain comment) use
// the AMBIENT `db` singleton from @/lib/db, not an injectable client
// parameter — this is the codebase's own deliberate, established pattern
// for this specific file (unlike H.2/H.7's client-accepting functions).
// @/lib/db's singleton binds to `process.env.DATABASE_URL` at MODULE LOAD
// TIME. To exercise these functions against futuretutor_test ONLY (never
// the dev database), this file: (1) calls resolveVerifiedTestDatabase()
// FIRST, against the untouched real env, to positively verify
// DATABASE_URL_TEST is safe and distinct; (2) only THEN reassigns
// process.env.DATABASE_URL to that verified, safety-checked connection
// string; (3) only AFTER that reassignment dynamically imports every
// module that transitively touches @/lib/db, so @/lib/db's own module-level
// client is constructed against the verified test target, never the real
// dev database. No static top-level import in this file touches @/lib/db.

vi.mock("@/lib/stripe", () => ({ getStripeClient: vi.fn() }));

import { getStripeClient } from "@/lib/stripe";

let createCustomerPriceQuote: typeof import("./customerPricing").createCustomerPriceQuote;
let createTutorPayoutQuote: typeof import("./tutorPayout").createTutorPayoutQuote;
let reserveBookingPendingPayment: typeof import("./bookingCreation").reserveBookingPendingPayment;
let cancelBookingWithRefund: typeof import("./cancellationPolicy").cancelBookingWithRefund;
let BookingNotCancellableError: typeof import("./cancellationPolicy").BookingNotCancellableError;
let NotAuthorizedToCancelError: typeof import("./cancellationPolicy").NotAuthorizedToCancelError;
let SessionAlreadyStartedError: typeof import("./cancellationPolicy").SessionAlreadyStartedError;
let resolveCancellationAuthority: typeof import("./cancellationAuthorization").resolveCancellationAuthority;
let convergeToCaptured: typeof import("./payments").convergeToCaptured;
let cancelAuthorizedPayment: typeof import("./payments").cancelAuthorizedPayment;
let resolveAuthorizationReleaseOutcomeAndConverge: typeof import("./payments").resolveAuthorizationReleaseOutcomeAndConverge;
let getOrCreateRefund: typeof import("./payments").getOrCreateRefund;
let refundIdForBooking: typeof import("./payments").refundIdForBooking;
let resolveRefundOutcomeAndConverge: typeof import("./payments").resolveRefundOutcomeAndConverge;
let recoverFailedRefund: typeof import("./payments").recoverFailedRefund;
let convergeCancelledBookingPayment: typeof import("./payments").convergeCancelledBookingPayment;
let isRefundObligationSatisfied: typeof import("./payments").isRefundObligationSatisfied;
let reconcileStuckPayments: typeof import("./tutorTransfers").reconcileStuckPayments;

interface FakeStripeRefund {
  id: string;
  status: "succeeded" | "pending" | "failed" | "canceled";
  amount: number;
  payment_intent: string;
  metadata: Record<string, string>;
  failure_reason: string | null;
}

/** Small, controllable, in-memory Stripe fake — simulates real Stripe
 * idempotency-key caching (same key -> same object returned, never a
 * duplicate create) and supports scripted create/list/retrieve behavior
 * per test. */
function makeFakeStripeClient(opts: {
  onCreateRefund?: (params: { payment_intent: string; amount: number; metadata?: Record<string, string> }) => FakeStripeRefund | "throw";
  piStatus?: Record<string, string>;
  piCancelThrows?: boolean;
} = {}) {
  const refundsById = new Map<string, FakeStripeRefund>();
  const idempotencyStore = new Map<string, FakeStripeRefund>();
  let nextId = 1;
  const createCalls: Array<{ idempotencyKey: string }> = [];

  const client = {
    refunds: {
      create: vi.fn(async (params: { payment_intent: string; amount: number; metadata?: Record<string, string> }, options: { idempotencyKey: string }) => {
        createCalls.push({ idempotencyKey: options.idempotencyKey });
        if (idempotencyStore.has(options.idempotencyKey)) return idempotencyStore.get(options.idempotencyKey)!;
        if (opts.onCreateRefund) {
          const result = opts.onCreateRefund(params);
          if (result === "throw") throw new Error("simulated Stripe error");
          idempotencyStore.set(options.idempotencyKey, result);
          refundsById.set(result.id, result);
          return result;
        }
        const refund: FakeStripeRefund = {
          id: `re_fake_${nextId++}`,
          status: "succeeded",
          amount: params.amount,
          payment_intent: params.payment_intent,
          metadata: params.metadata ?? {},
          failure_reason: null,
        };
        idempotencyStore.set(options.idempotencyKey, refund);
        refundsById.set(refund.id, refund);
        return refund;
      }),
      retrieve: vi.fn(async (id: string) => {
        const r = refundsById.get(id);
        if (!r) throw new Error("no such fake refund");
        return r;
      }),
      list: vi.fn((params: { payment_intent: string }) => {
        const items = Array.from(refundsById.values()).filter((r) => r.payment_intent === params.payment_intent);
        return { [Symbol.asyncIterator]: async function* () {
          for (const item of items) yield item;
        } };
      }),
    },
    paymentIntents: {
      cancel: vi.fn(async (id: string) => {
        if (opts.piCancelThrows) throw new Error("simulated cancel failure");
        if (opts.piStatus) opts.piStatus[id] = "canceled";
        return { id, status: "canceled" };
      }),
      retrieve: vi.fn(async (id: string) => ({ id, status: opts.piStatus?.[id] ?? "canceled" })),
    },
    _refundsById: refundsById,
    _createCalls: createCalls,
    /** Directly injects a Stripe Refund object as if it already existed at
     * Stripe (simulating "created before a crash, id never persisted"). */
    _seedRefund(refund: FakeStripeRefund) {
      refundsById.set(refund.id, refund);
    },
  };
  return client;
}

let db: PrismaClient;
let subjectId: string;
let academicLevelId: string;

const createdUserIds: string[] = [];
const createdStudentProfileIds: string[] = [];
const createdRelationshipIds: string[] = [];
const createdTutorProfileIds: string[] = [];
const createdCustomerQuoteIds: string[] = [];
const createdTutorPayoutQuoteIds: string[] = [];
const createdPaymentIds: string[] = [];
const createdBookingIds: string[] = [];
const createdTutoringRequestIds: string[] = [];

const FAR_FUTURE_START = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

beforeAll(async () => {
  const target = resolveVerifiedTestDatabase();
  // Captured BEFORE process.env.DATABASE_URL is reassigned below — used
  // ONLY for the ambient-singleton safety proof a few lines down (never
  // used to open a connection). This is what lets the proof assert
  // "not the real dev database" using the actual real value, not a guess.
  const devDatabaseUrlForSafetyCheckOnly = process.env.DATABASE_URL;
  const adapter = new PrismaPg({ connectionString: target.connectionString });
  db = new PrismaClient({ adapter });

  // Redirect the AMBIENT db singleton (used internally by cancellationPolicy.ts/
  // payments.ts/tutorTransfers.ts/customerPricing.ts/tutorPayout.ts) to the
  // SAME verified, safety-checked test database — only after
  // resolveVerifiedTestDatabase() has already positively confirmed it is
  // distinct from, and never the, real development database. Every
  // dynamic import below happens strictly after this line.
  process.env.DATABASE_URL = target.connectionString;

  ({ createCustomerPriceQuote } = await import("./customerPricing"));
  ({ createTutorPayoutQuote } = await import("./tutorPayout"));
  ({ reserveBookingPendingPayment } = await import("./bookingCreation"));
  ({ cancelBookingWithRefund, BookingNotCancellableError, NotAuthorizedToCancelError, SessionAlreadyStartedError } =
    await import("./cancellationPolicy"));
  ({ resolveCancellationAuthority } = await import("./cancellationAuthorization"));
  ({
    convergeToCaptured,
    cancelAuthorizedPayment,
    resolveAuthorizationReleaseOutcomeAndConverge,
    getOrCreateRefund,
    refundIdForBooking,
    resolveRefundOutcomeAndConverge,
    recoverFailedRefund,
    convergeCancelledBookingPayment,
    isRefundObligationSatisfied,
  } = await import("./payments"));
  ({ reconcileStuckPayments } = await import("./tutorTransfers"));

  // Pre-sandbox verification, item 3 — PROVE (not merely assume from
  // process.env) that the AMBIENT @/lib/db singleton actually used
  // internally by cancellationPolicy.ts/payments.ts/tutorTransfers.ts is
  // really connected to the verified test database, by querying Postgres
  // itself. Dynamically imported here, strictly AFTER the DATABASE_URL
  // reassignment above and AFTER every other H.8-relevant module has
  // already been dynamically imported (so this resolves to the exact same
  // module-level singleton instance those functions already share — never
  // a second, independently-constructed client). Fails closed: throws
  // (never skips) if this does not hold.
  const { db: ambientDb } = await import("@/lib/db");
  const [{ current_database: ambientDatabaseName }] = await ambientDb.$queryRaw<
    Array<{ current_database: string }>
  >`SELECT current_database()`;
  if (ambientDatabaseName !== target.databaseName) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton reports current_database() = "${ambientDatabaseName}", but the verified test database is "${target.databaseName}". Refusing to run any H.8 integration test.`
    );
  }
  const devDatabaseNameForSafetyCheckOnly = devDatabaseUrlForSafetyCheckOnly
    ? new URL(devDatabaseUrlForSafetyCheckOnly).pathname.replace(/^\//, "")
    : null;
  if (devDatabaseNameForSafetyCheckOnly && ambientDatabaseName === devDatabaseNameForSafetyCheckOnly) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton's current_database() ("${ambientDatabaseName}") equals the real development database name. Refusing to run any H.8 integration test.`
    );
  }

  const subject = await db.subject.create({ data: { slug: `h8-it-subject-${randomUUID()}`, sortOrder: 999 } });
  subjectId = subject.id;
  const level = await db.academicLevel.create({ data: { slug: `h8-it-level-${randomUUID()}`, sortOrder: 999 } });
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
    const refundIds = createdBookingIds.map((id) => refundIdForBooking(id));
    await db.auditLog.deleteMany({ where: { entityId: { in: refundIds } } });
    await db.refund.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
    await db.tutorEarning.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
    await db.session_.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
    await db.bookingStatusHistory.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
    await db.booking.deleteMany({ where: { id: { in: createdBookingIds } } });
    createdBookingIds.length = 0;
  }
  if (createdTutoringRequestIds.length > 0) {
    await db.tutoringRequest.deleteMany({ where: { id: { in: createdTutoringRequestIds } } });
    createdTutoringRequestIds.length = 0;
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
  if (createdUserIds.length > 0) {
    await db.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
});

function uniqueEmail(prefix: string) {
  return `h8-it-${prefix}-${randomUUID()}@futuretutor.test`;
}

async function createParentUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("parent"), role: "PARENT" } });
  createdUserIds.push(user.id);
  const parentProfile = await db.parentProfile.create({ data: { userId: user.id, firstName: "Test", lastName: "Parent" } });
  return { user, parentProfile };
}

async function createTutorUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("tutor"), role: "TUTOR" } });
  createdUserIds.push(user.id);
  const tutorProfile = await db.tutorProfile.create({
    data: { userId: user.id, slug: `h8-it-tutor-${randomUUID()}`, applicationStatus: "APPROVED", payoutTier: "NEW", learningMode: "BOTH" },
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

async function createGuardianManagedChild(parentProfileId: string, status: "ACTIVE" | "REVOKED" = "ACTIVE", firstName = "Kid") {
  const studentProfile = await db.studentProfile.create({
    data: { firstName, lastName: "Test", dateOfBirth: new Date("2015-01-01T00:00:00.000Z"), managementMode: "GUARDIAN_MANAGED", userId: null },
  });
  createdStudentProfileIds.push(studentProfile.id);
  const relationship = await db.parentStudentRelationship.create({
    data: { parentProfileId, studentProfileId: studentProfile.id, status },
  });
  createdRelationshipIds.push(relationship.id);
  return { studentProfile, relationship };
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
  tutoringRequestId?: string | null;
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
        tutoringRequestId: params.tutoringRequestId ?? null,
      }),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
  createdBookingIds.push(booking.id);
  return booking;
}

/** Full happy-path setup: a CONFIRMED booking with a CAPTURED payment
 * carrying a fake stripePaymentIntentId (so refund-flow tests reach the
 * mocked Stripe client's discovery/create/retrieve paths), no real Stripe
 * call made anywhere in this helper. */
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
// A. AUTHORIZATION MATRIX (§AE 01-12, 46-47) — mirrors resolveCancellationAuthority
// ===========================================================================
describe("cancellation authorization matrix (integration)", () => {
  it("01. SELF_MANAGED student cancels own booking -> allowed", async () => {
    const { student, payment, booking } = await setupConfirmedCapturedBooking();
    await cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" });
    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updated.status).toBe("CANCELLED");
    void payment;
  });

  it("02. SELF_MANAGED student attempts another student's booking -> denied, unchanged", async () => {
    const { booking } = await setupConfirmedCapturedBooking();
    const other = await createSelfManagedStudent();
    await expect(cancelBookingWithRefund(booking.id, other.user.id, { actorRole: "STUDENT" })).rejects.toThrow(
      NotAuthorizedToCancelError
    );
    const unchanged = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(unchanged.status).toBe("CONFIRMED");
  });

  it("03. ACTIVE parent cancels GUARDIAN_MANAGED child's booking -> allowed", async () => {
    const parent = await createParentUser();
    const child = await createGuardianManagedChild(parent.parentProfile.id, "ACTIVE");
    const tutor = await createTutorUser();
    const quote = await makeQuote(parent.user.id, child.studentProfile.id);
    const payoutQuote = await makePayoutQuote(tutor.tutorProfile.id, quote.id);
    const payment = await makePayment(quote.id, parent.user.id);
    const booking = await reserveBooking({
      actorUserId: parent.user.id,
      studentProfileId: child.studentProfile.id,
      tutorProfileId: tutor.tutorProfile.id,
      customerPriceQuoteId: quote.id,
      tutorPayoutQuoteId: payoutQuote.id,
      paymentId: payment.id,
    });
    await db.payment.update({ where: { id: payment.id }, data: { status: "AUTHORIZED" } });
    await convergeToCaptured(payment.id);
    await cancelBookingWithRefund(booking.id, parent.user.id, { actorRole: "PARENT" });
    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updated.status).toBe("CANCELLED");
  });

  it("04. Parent with no relationship at all -> denied (IDOR)", async () => {
    const { booking } = await setupConfirmedCapturedBooking();
    const unrelatedParent = await createParentUser();
    await expect(cancelBookingWithRefund(booking.id, unrelatedParent.user.id, { actorRole: "PARENT" })).rejects.toThrow(
      NotAuthorizedToCancelError
    );
  });

  it("05-06. Parent with two children: authority over A never leaks to B", async () => {
    const parent = await createParentUser();
    const childA = await createGuardianManagedChild(parent.parentProfile.id, "ACTIVE", "A");
    const childB = await createGuardianManagedChild(parent.parentProfile.id, "REVOKED", "B");
    const tutor = await createTutorUser();

    const authorityA = await resolveCancellationAuthority(db, parent.user.id, "PARENT", {
      studentProfileId: childA.studentProfile.id,
      tutorProfileUserId: tutor.user.id,
    });
    const authorityB = await resolveCancellationAuthority(db, parent.user.id, "PARENT", {
      studentProfileId: childB.studentProfile.id,
      tutorProfileUserId: tutor.user.id,
    });
    expect(authorityA).toBe("GUARDIAN");
    expect(authorityB).toBe("DENIED");
  });

  it("07. REVOKED guardian -> denied", async () => {
    const parent = await createParentUser();
    const child = await createGuardianManagedChild(parent.parentProfile.id, "REVOKED");
    const tutor = await createTutorUser();
    const authority = await resolveCancellationAuthority(db, parent.user.id, "PARENT", {
      studentProfileId: child.studentProfile.id,
      tutorProfileUserId: tutor.user.id,
    });
    expect(authority).toBe("DENIED");
  });

  it("08. GUARDIAN_MANAGED student's own restricted login -> denied (permanent regression guard)", async () => {
    const parent = await createParentUser();
    const child = await createGuardianManagedChild(parent.parentProfile.id, "ACTIVE");
    const childUser = await db.user.create({ data: { email: uniqueEmail("restricted-child"), role: "STUDENT" } });
    createdUserIds.push(childUser.id);
    await db.studentProfile.update({ where: { id: child.studentProfile.id }, data: { userId: childUser.id } });
    const tutor = await createTutorUser();
    const authority = await resolveCancellationAuthority(db, childUser.id, "STUDENT", {
      studentProfileId: child.studentProfile.id,
      tutorProfileUserId: tutor.user.id,
    });
    expect(authority).toBe("DENIED");
  });

  it("09. Tutor cancels own booking -> allowed, 100% refund tier regardless of time-to-session", async () => {
    const soon = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2h out — would be NO_REFUND for a customer
    const { tutor, booking, payment } = await setupConfirmedCapturedBooking({ startAt: soon });
    vi.mocked(getStripeClient).mockReturnValue(makeFakeStripeClient() as never);
    await cancelBookingWithRefund(booking.id, tutor.user.id, { actorRole: "TUTOR" });
    const intent = await db.auditLog.findFirst({ where: { entityType: "Booking", entityId: booking.id, action: "booking.cancelled_by_tutor" } });
    expect((intent?.metadata as Record<string, unknown>)?.tier).toBe("FULL_REFUND");
    const refund = await db.refund.findUnique({ where: { id: refundIdForBooking(booking.id) } });
    expect(refund?.amountCents).toBe(payment.amountCents);
  });

  it("10. Tutor attempts another tutor's booking -> denied", async () => {
    const { booking } = await setupConfirmedCapturedBooking();
    const otherTutor = await createTutorUser();
    await expect(cancelBookingWithRefund(booking.id, otherTutor.user.id, { actorRole: "TUTOR" })).rejects.toThrow(
      NotAuthorizedToCancelError
    );
  });

  it("11. ADMIN cancels an eligible booking -> allowed, distinctly labeled booking.cancelled_by_admin", async () => {
    const { booking } = await setupConfirmedCapturedBooking();
    const admin = await db.user.create({ data: { email: uniqueEmail("admin"), role: "ADMIN" } });
    createdUserIds.push(admin.id);
    vi.mocked(getStripeClient).mockReturnValue(makeFakeStripeClient() as never);
    await cancelBookingWithRefund(booking.id, admin.id, { actorRole: "ADMIN" });
    const auditRow = await db.auditLog.findFirst({ where: { entityType: "Booking", entityId: booking.id, action: "booking.cancelled_by_admin" } });
    expect(auditRow).not.toBeNull();
  });

  it("12. SUPER_ADMIN cancels an eligible booking -> allowed", async () => {
    const { booking } = await setupConfirmedCapturedBooking();
    const superAdmin = await db.user.create({ data: { email: uniqueEmail("superadmin"), role: "SUPER_ADMIN" } });
    createdUserIds.push(superAdmin.id);
    vi.mocked(getStripeClient).mockReturnValue(makeFakeStripeClient() as never);
    await cancelBookingWithRefund(booking.id, superAdmin.id, { actorRole: "SUPER_ADMIN" });
    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updated.status).toBe("CANCELLED");
  });

  it("46. IDOR: unrelated actor, raw bookingId supplied directly -> denied, no info leak", async () => {
    const { booking } = await setupConfirmedCapturedBooking();
    const stranger = await createSelfManagedStudent();
    await expect(cancelBookingWithRefund(booking.id, stranger.user.id, { actorRole: "STUDENT" })).rejects.toThrow(
      NotAuthorizedToCancelError
    );
  });
});

// ===========================================================================
// B. REFUND TIER BOUNDARIES + TIME FLOOR (§AE 13-15, 23, 45)
// ===========================================================================
describe("refund tier boundaries and session-start time floor", () => {
  it("13. exactly 48h before startAt -> 100% refund, exact amountCents", async () => {
    const start = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    const { booking, payment } = await setupConfirmedCapturedBooking({ startAt: start });
    vi.mocked(getStripeClient).mockReturnValue(makeFakeStripeClient() as never);
    // Injected clock, fixed to EXACTLY 48h before startAt — never relies on
    // wall-clock timing surviving the async setup above unchanged (setup
    // itself takes real, variable time).
    const exactBoundary = new Date(start.getTime() - 48 * 60 * 60 * 1000);
    await cancelBookingWithRefund(booking.id, payment.payerUserId, { actorRole: "STUDENT", clock: () => exactBoundary });
    const refund = await db.refund.findUnique({ where: { id: refundIdForBooking(booking.id) } });
    expect(refund?.amountCents).toBe(payment.amountCents);
  });

  it("14. exactly 24h before startAt -> 50% refund, exact amountCents (integration-level, not just pure-function)", async () => {
    // Pre-sandbox verification gap closure: calculateCancellationRefund's
    // pure boundary is already unit-tested (cancellationStateMachine.test.ts
    // #4), but nothing previously exercised the FULL cancelBookingWithRefund
    // workflow at exactly this boundary the way test #13 already does for
    // 48h — added here as the minimum permanent regression guard for the
    // exact-24h row of §H's matrix at the integration level.
    const start = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    const { booking, payment } = await setupConfirmedCapturedBooking({ startAt: start });
    vi.mocked(getStripeClient).mockReturnValue(makeFakeStripeClient() as never);
    const exactBoundary = new Date(start.getTime() - 24 * 60 * 60 * 1000);
    await cancelBookingWithRefund(booking.id, payment.payerUserId, { actorRole: "STUDENT", clock: () => exactBoundary });
    const refund = await db.refund.findUnique({ where: { id: refundIdForBooking(booking.id) } });
    expect(refund?.amountCents).toBe(Math.round(payment.amountCents * 0.5));
    const intent = await db.auditLog.findFirst({ where: { entityType: "Booking", entityId: booking.id, action: "booking.cancelled_by_customer" } });
    expect((intent?.metadata as Record<string, unknown>)?.tier).toBe("PARTIAL_REFUND");
  });

  it("15. <24h before startAt -> NO_REFUND, no Refund row, fully audited", async () => {
    const start = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const { booking, payment } = await setupConfirmedCapturedBooking({ startAt: start });
    await cancelBookingWithRefund(booking.id, payment.payerUserId, { actorRole: "STUDENT" });
    const refund = await db.refund.findUnique({ where: { id: refundIdForBooking(booking.id) } });
    expect(refund).toBeNull();
    const intent = await db.auditLog.findFirst({ where: { entityType: "Booking", entityId: booking.id, action: "booking.cancelled_by_customer" } });
    expect(intent).not.toBeNull();
    const noRefundRow = await db.auditLog.findFirst({ where: { entityType: "Booking", entityId: booking.id, action: "payment.no_refund_recorded" } });
    expect(noRefundRow).not.toBeNull();
  });

  it("23/45. server-side time floor rejects a direct call with startAt already passed, even bypassing UI filtering", async () => {
    const past = new Date(Date.now() - 60 * 1000);
    const { booking, payment } = await setupConfirmedCapturedBooking({ startAt: past });
    await expect(
      cancelBookingWithRefund(booking.id, payment.payerUserId, { actorRole: "STUDENT" })
    ).rejects.toThrow(SessionAlreadyStartedError);
    const unchanged = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(unchanged.status).toBe("CONFIRMED");
  });

  it("time floor: injected clock crossing startAt is honored by the authoritative re-check", async () => {
    const almostNow = new Date(Date.now() + 500);
    const { booking, payment } = await setupConfirmedCapturedBooking({ startAt: almostNow });
    await expect(
      cancelBookingWithRefund(booking.id, payment.payerUserId, { actorRole: "STUDENT", clock: () => new Date(almostNow.getTime() + 1) })
    ).rejects.toThrow(SessionAlreadyStartedError);
  });
});

// ===========================================================================
// C. AUTHORIZED-HOLD RELEASE (§AE 24, 24A-24D)
// ===========================================================================
describe("authorized-payment cancellation (§K)", () => {
  async function setupPendingPaymentBooking(paymentStatus: "PENDING" | "AUTHORIZED", withPi: boolean) {
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
    await db.payment.update({
      where: { id: payment.id },
      data: { status: paymentStatus, stripePaymentIntentId: withPi ? `pi_fake_${randomUUID()}` : null },
    });
    return { tutor, student, booking, payment: await db.payment.findUniqueOrThrow({ where: { id: payment.id } }) };
  }

  it("24. AUTHORIZED with stripePaymentIntentId -> PI cancelled, Payment.status CANCELLED, no Refund row", async () => {
    const { booking, payment, student } = await setupPendingPaymentBooking("AUTHORIZED", true);
    vi.mocked(getStripeClient).mockReturnValue(makeFakeStripeClient() as never);
    await cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" });
    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.status).toBe("CANCELLED");
    const refund = await db.refund.findUnique({ where: { id: refundIdForBooking(booking.id) } });
    expect(refund).toBeNull();
  });

  it("24A. ambiguous cancel + retrieve shows still capturable -> never falsely CANCELLED", async () => {
    const { payment } = await setupPendingPaymentBooking("AUTHORIZED", true);
    const fake = makeFakeStripeClient({ piCancelThrows: true, piStatus: { [payment.stripePaymentIntentId!]: "requires_capture" } });
    vi.mocked(getStripeClient).mockReturnValue(fake as never);
    const outcome = await cancelAuthorizedPayment(payment.id);
    expect(outcome).toBe("still_capturable");
    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.status).toBe("AUTHORIZED"); // never falsely CANCELLED
  });

  it("24B. ambiguous cancel + retrieve confirms canceled -> converges to CANCELLED", async () => {
    const { payment } = await setupPendingPaymentBooking("AUTHORIZED", true);
    const fake = makeFakeStripeClient({ piCancelThrows: true, piStatus: { [payment.stripePaymentIntentId!]: "canceled" } });
    vi.mocked(getStripeClient).mockReturnValue(fake as never);
    const outcome = await cancelAuthorizedPayment(payment.id);
    expect(outcome).toBe("cancelled");
    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.status).toBe("CANCELLED");
  });

  it("24C. ambiguous cancel + retrieve reveals a late-won capture -> converges to CAPTURED", async () => {
    const { payment } = await setupPendingPaymentBooking("AUTHORIZED", true);
    const fake = makeFakeStripeClient({ piCancelThrows: true, piStatus: { [payment.stripePaymentIntentId!]: "succeeded" } });
    vi.mocked(getStripeClient).mockReturnValue(fake as never);
    const outcome = await resolveAuthorizationReleaseOutcomeAndConverge(payment.id);
    expect(outcome).toBe("captured");
    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.status).toBe("CAPTURED");
  });

  it("24D. PENDING with no stripePaymentIntentId -> converges locally, zero Stripe calls", async () => {
    const { payment } = await setupPendingPaymentBooking("PENDING", false);
    const fake = makeFakeStripeClient();
    vi.mocked(getStripeClient).mockReturnValue(fake as never);
    const outcome = await cancelAuthorizedPayment(payment.id);
    expect(outcome).toBe("cancelled");
    expect(fake.paymentIntents.cancel).not.toHaveBeenCalled();
    expect(fake.paymentIntents.retrieve).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// D. CAPTURE/CANCELLATION RACE (§AE 25-26, 42-44)
// ===========================================================================
describe("capture/cancellation race (§L)", () => {
  it("25. cancellation wins outright -> convergeToCaptured creates nothing, refund applied at recorded tier", async () => {
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
    // Booking cancelled while still PENDING_PAYMENT / payment still
    // AUTHORIZED — but the capture had ALREADY genuinely succeeded at
    // Stripe by the time cancellation's own authorization-release attempt
    // runs (a real, reachable interleaving): paymentIntents.cancel throws
    // (Stripe refuses to cancel an already-captured PI), and the
    // authoritative retrieve reveals "succeeded."
    const piId = `pi_fake_${randomUUID()}`;
    await db.payment.update({ where: { id: payment.id }, data: { status: "AUTHORIZED", stripePaymentIntentId: piId } });
    const fake = makeFakeStripeClient({ piCancelThrows: true, piStatus: { [piId]: "succeeded" } });
    vi.mocked(getStripeClient).mockReturnValue(fake as never);
    await cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" });

    // A separate, redundant trigger (e.g. a payment_intent.succeeded
    // webhook) also resolves independently — must be a safe, idempotent
    // no-op regardless of ordering.
    await convergeToCaptured(payment.id);

    const session = await db.session_.findUnique({ where: { bookingId: booking.id } });
    const earning = await db.tutorEarning.findUnique({ where: { bookingId: booking.id } });
    expect(session).toBeNull();
    expect(earning).toBeNull();
    const finalBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(finalBooking.status).toBe("CANCELLED");
    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(["CAPTURED", "REFUNDED", "PARTIALLY_REFUNDED"]).toContain(finalPayment.status);
  });

  it("26. capture wins outright -> unchanged normal-path behavior", async () => {
    const { booking } = await setupConfirmedCapturedBooking();
    const session = await db.session_.findUnique({ where: { bookingId: booking.id } });
    const earning = await db.tutorEarning.findUnique({ where: { bookingId: booking.id } });
    expect(session?.status).toBe("SCHEDULED");
    expect(earning?.status).toBe("PENDING_ELIGIBLE");
  });

  it("42-44. a CANCELLED booking can never be resurrected by a late convergeToCaptured call", async () => {
    const { booking, payment, student } = await setupConfirmedCapturedBooking();
    vi.mocked(getStripeClient).mockReturnValue(makeFakeStripeClient() as never);
    await cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" });
    await convergeToCaptured(payment.id); // late, redundant call
    const finalBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(finalBooking.status).toBe("CANCELLED");
    const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
    expect(session.status).toBe("CANCELLED"); // was SCHEDULED, transitioned once by cancellation, never re-created
  });
});

// ===========================================================================
// E. REFUND IDENTITY, DISCOVERY, RECOVERY (§AE 28-34H, amended §AM 34I-34P)
// ===========================================================================
describe("refund stable identity + exhaustive discovery", () => {
  it("stable identity: getOrCreateRefund is idempotent for the same bookingId", async () => {
    const { booking, payment } = await setupConfirmedCapturedBooking();
    const r1 = await getOrCreateRefund({ bookingId: booking.id, paymentId: payment.id, amountCents: 1000, reason: "x", actorUserId: null });
    const r2 = await getOrCreateRefund({ bookingId: booking.id, paymentId: payment.id, amountCents: 9999, reason: "y", actorUserId: null });
    expect(r1.id).toBe(r2.id);
    expect(r2.amountCents).toBe(1000); // second call's amount is ignored — the existing row wins
  });

  it("29D. known stripeRefundId always converges via retrieve, never create", async () => {
    const { booking, payment } = await setupConfirmedCapturedBooking();
    const fake = makeFakeStripeClient();
    fake._seedRefund({ id: "re_known", status: "succeeded", amount: 5000, payment_intent: payment.stripePaymentIntentId!, metadata: {}, failure_reason: null });
    vi.mocked(getStripeClient).mockReturnValue(fake as never);
    const refund = await getOrCreateRefund({ bookingId: booking.id, paymentId: payment.id, amountCents: 5000, reason: "x", actorUserId: null });
    await db.refund.update({ where: { id: refund.id }, data: { stripeRefundId: "re_known" } });
    const outcome = await resolveRefundOutcomeAndConverge(refund.id);
    expect(outcome).toBe("succeeded");
    expect(fake.refunds.create).not.toHaveBeenCalled();
    expect(fake.refunds.retrieve).toHaveBeenCalled();
  });

  it("29B. crash before stripeRefundId persisted -> discovery finds it, never re-creates", async () => {
    const { booking, payment } = await setupConfirmedCapturedBooking();
    const refund = await getOrCreateRefund({ bookingId: booking.id, paymentId: payment.id, amountCents: 6000, reason: "x", actorUserId: null });
    const fake = makeFakeStripeClient();
    fake._seedRefund({ id: "re_precrash", status: "succeeded", amount: 6000, payment_intent: payment.stripePaymentIntentId!, metadata: { refundId: refund.id }, failure_reason: null });
    vi.mocked(getStripeClient).mockReturnValue(fake as never);
    const outcome = await resolveRefundOutcomeAndConverge(refund.id);
    expect(outcome).toBe("succeeded");
    expect(fake.refunds.create).not.toHaveBeenCalled();
    const finalRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(finalRefund.stripeRefundId).toBe("re_precrash");
  });

  it("29C. discovery mismatch (amount disagrees) fails closed", async () => {
    const { booking, payment } = await setupConfirmedCapturedBooking();
    const refund = await getOrCreateRefund({ bookingId: booking.id, paymentId: payment.id, amountCents: 6000, reason: "x", actorUserId: null });
    const fake = makeFakeStripeClient();
    fake._seedRefund({ id: "re_mismatch", status: "succeeded", amount: 999, payment_intent: payment.stripePaymentIntentId!, metadata: { refundId: refund.id }, failure_reason: null });
    vi.mocked(getStripeClient).mockReturnValue(fake as never);
    const outcome = await resolveRefundOutcomeAndConverge(refund.id);
    expect(outcome).toBe("uncertain");
    const anomaly = await db.auditLog.findFirst({ where: { entityType: "Refund", entityId: refund.id, action: "refund.discovery_mismatch" } });
    expect(anomaly).not.toBeNull();
  });

  it("34H. two unaccounted Stripe refunds discovered simultaneously -> fail closed, no create", async () => {
    const { booking, payment } = await setupConfirmedCapturedBooking();
    const refund = await getOrCreateRefund({ bookingId: booking.id, paymentId: payment.id, amountCents: 6000, reason: "x", actorUserId: null });
    const fake = makeFakeStripeClient();
    fake._seedRefund({ id: "re_dup1", status: "succeeded", amount: 6000, payment_intent: payment.stripePaymentIntentId!, metadata: { refundId: refund.id }, failure_reason: null });
    fake._seedRefund({ id: "re_dup2", status: "succeeded", amount: 6000, payment_intent: payment.stripePaymentIntentId!, metadata: { refundId: refund.id }, failure_reason: null });
    vi.mocked(getStripeClient).mockReturnValue(fake as never);
    const outcome = await resolveRefundOutcomeAndConverge(refund.id);
    expect(outcome).toBe("uncertain");
    expect(fake.refunds.create).not.toHaveBeenCalled();
    const anomaly = await db.auditLog.findFirst({ where: { entityType: "Refund", entityId: refund.id, action: "refund.discovery_multiple_candidates" } });
    expect(anomaly).not.toBeNull();
    const finalRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(finalRefund.status).toBe("PENDING");
    expect(finalRefund.stripeRefundId).toBeNull();
  });

  it("first-ever attempt creates with the stable refund:<id> key", async () => {
    const { booking, payment } = await setupConfirmedCapturedBooking();
    // Full remaining amount, so the resulting Payment.status is
    // deterministically REFUNDED (not PARTIALLY_REFUNDED) below.
    const refund = await getOrCreateRefund({ bookingId: booking.id, paymentId: payment.id, amountCents: payment.amountCents, reason: "x", actorUserId: null });
    const fake = makeFakeStripeClient();
    vi.mocked(getStripeClient).mockReturnValue(fake as never);
    const outcome = await resolveRefundOutcomeAndConverge(refund.id);
    expect(outcome).toBe("succeeded");
    expect(fake._createCalls[0]?.idempotencyKey).toBe(`refund:${refund.id}`);
    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.refundedAmountCents).toBe(payment.amountCents);
    expect(finalPayment.status).toBe("REFUNDED");
  });
});

describe("failed-refund recovery lifecycle (§M, crash-safe attempt chain §AM)", () => {
  async function setupRefund(amountCents = 6000) {
    const { booking, payment } = await setupConfirmedCapturedBooking();
    // Tier 6's query (and the general "obligation outstanding" concept)
    // only applies to a CANCELLED booking — set that directly here rather
    // than running the full cancelBookingWithRefund flow, since these
    // tests exercise the refund-attempt-chain machinery in isolation.
    await db.booking.update({ where: { id: booking.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    const refund = await getOrCreateRefund({ bookingId: booking.id, paymentId: payment.id, amountCents, reason: "x", actorUserId: null });
    return { booking, payment, refund };
  }

  it("34A. R1 fails -> Refund FAILED, Payment unchanged, refund.failed_requires_recovery written", async () => {
    const { payment, refund } = await setupRefund();
    const fake = makeFakeStripeClient({ onCreateRefund: (p) => ({ id: "re_R1", status: "failed", amount: p.amount, payment_intent: p.payment_intent, metadata: p.metadata ?? {}, failure_reason: "generic_decline" }) });
    vi.mocked(getStripeClient).mockReturnValue(fake as never);
    const outcome = await resolveRefundOutcomeAndConverge(refund.id);
    expect(outcome).toBe("failed");
    const finalRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(finalRefund.status).toBe("FAILED");
    expect(finalRefund.stripeRefundId).toBe("re_R1");
    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.refundedAmountCents).toBe(0);
    expect(finalPayment.status).toBe("CAPTURED");
    const auditRow = await db.auditLog.findFirst({ where: { entityType: "Refund", entityId: refund.id, action: "refund.failed_requires_recovery" } });
    expect((auditRow?.metadata as Record<string, unknown>)?.failedStripeRefundId).toBe("re_R1");
  });

  it("34B. Tier 6 surfaces the outstanding obligation, never auto-acts", async () => {
    const { refund } = await setupRefund();
    const fake = makeFakeStripeClient({ onCreateRefund: (p) => ({ id: "re_R1b", status: "failed", amount: p.amount, payment_intent: p.payment_intent, metadata: p.metadata ?? {}, failure_reason: null }) });
    vi.mocked(getStripeClient).mockReturnValue(fake as never);
    await resolveRefundOutcomeAndConverge(refund.id);
    fake.refunds.create.mockClear();
    await reconcileStuckPayments();
    const obligationRow = await db.auditLog.findFirst({ where: { entityType: "Refund", entityId: refund.id, action: "refund.obligation_outstanding" } });
    expect(obligationRow).not.toBeNull();
    expect(fake.refunds.create).not.toHaveBeenCalled();
  });

  it("34C. resolveRefundOutcomeAndConverge never auto-retries a FAILED refund", async () => {
    const { refund } = await setupRefund();
    const fake = makeFakeStripeClient({ onCreateRefund: (p) => ({ id: "re_R1c", status: "failed", amount: p.amount, payment_intent: p.payment_intent, metadata: p.metadata ?? {}, failure_reason: null }) });
    vi.mocked(getStripeClient).mockReturnValue(fake as never);
    await resolveRefundOutcomeAndConverge(refund.id);
    fake.refunds.create.mockClear();
    fake.refunds.list.mockClear();
    fake.refunds.retrieve.mockClear();
    for (let i = 0; i < 3; i++) {
      const outcome = await resolveRefundOutcomeAndConverge(refund.id);
      expect(outcome).toBe("failed");
    }
    expect(fake.refunds.create).not.toHaveBeenCalled();
    expect(fake.refunds.list).not.toHaveBeenCalled();
    expect(fake.refunds.retrieve).not.toHaveBeenCalled();
  });

  it("34D-34G. deliberate recovery succeeds, satisfies the obligation exactly once, preserves history", async () => {
    const { payment, refund } = await setupRefund(6000);
    const fake = makeFakeStripeClient({
      onCreateRefund: (p) => {
        if (!fake._refundsById.has("re_R1")) return { id: "re_R1", status: "failed", amount: p.amount, payment_intent: p.payment_intent, metadata: p.metadata ?? {}, failure_reason: null };
        return { id: "re_R2", status: "succeeded", amount: p.amount, payment_intent: p.payment_intent, metadata: p.metadata ?? {}, failure_reason: null };
      },
    });
    vi.mocked(getStripeClient).mockReturnValue(fake as never);
    await resolveRefundOutcomeAndConverge(refund.id); // R1 fails
    const afterFail = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(afterFail.status).toBe("FAILED");

    const recovered = await recoverFailedRefund(refund.id); // R2 succeeds
    expect(recovered).toBe("succeeded");
    const afterRecovery = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(afterRecovery.status).toBe("SUCCEEDED");
    expect(afterRecovery.stripeRefundId).toBe("re_R2");
    expect(afterRecovery.stripeRefundId).not.toBe("re_R1");

    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.refundedAmountCents).toBe(6000); // exactly once, never doubled

    // 34E — history preserved.
    const failedRow = await db.auditLog.findFirst({ where: { entityType: "Refund", entityId: refund.id, action: "refund.failed_requires_recovery" } });
    const recoveryRow = await db.auditLog.findFirst({ where: { entityType: "Refund", entityId: refund.id, action: "refund.recovery_attempt_started" } });
    expect(failedRow).not.toBeNull();
    expect((recoveryRow?.metadata as Record<string, unknown>)?.previousFailedStripeRefundId).toBe("re_R1");

    // 34F — repeated calls after success are no-ops.
    await recoverFailedRefund(refund.id);
    await resolveRefundOutcomeAndConverge(refund.id);
    const stillFinal = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(stillFinal.refundedAmountCents).toBe(6000);

    // 34G — over-refund protection: never exceeds the audited amount.
    expect(isRefundObligationSatisfied(afterFail.amountCents, stillFinal)).toBe(true);
  });

  it("34I. crash-safe resumption: a fresh, independent call after FAILED->PENDING resumes safely, creates exactly one R2", async () => {
    const { refund } = await setupRefund(6000);
    const fake = makeFakeStripeClient({
      onCreateRefund: (p) => {
        if (!fake._refundsById.has("re_crashR1")) return { id: "re_crashR1", status: "failed", amount: p.amount, payment_intent: p.payment_intent, metadata: p.metadata ?? {}, failure_reason: null };
        return { id: "re_crashR2", status: "succeeded", amount: p.amount, payment_intent: p.payment_intent, metadata: p.metadata ?? {}, failure_reason: null };
      },
    });
    vi.mocked(getStripeClient).mockReturnValue(fake as never);
    await resolveRefundOutcomeAndConverge(refund.id); // R1 fails

    // Simulate: recoverFailedRefund commits FAILED->PENDING + audit, but the
    // "process" dies before the Stripe create call. We model this by
    // manually performing exactly that DB transition (mirroring what
    // recoverFailedRefund's own first block does) and then invoking a
    // completely FRESH, independent recoverFailedRefund call — proving
    // resumption relies on durable AuditLog state, not any variable from
    // the first (crashed) invocation.
    const preCrash = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    await db.$transaction(async (tx) => {
      await tx.refund.updateMany({ where: { id: refund.id, status: "FAILED" }, data: { status: "PENDING", stripeRefundId: null } });
      await tx.auditLog.create({
        data: { actorUserId: null, action: "refund.recovery_attempt_started", entityType: "Refund", entityId: refund.id, metadata: { previousFailedStripeRefundId: preCrash.stripeRefundId, bookingId: refund.bookingId } },
      });
    });

    const resumed = await recoverFailedRefund(refund.id); // fresh call, no shared in-memory state with the "crashed" attempt
    expect(resumed).toBe("succeeded");
    const recoveryRows = await db.auditLog.findMany({ where: { entityType: "Refund", entityId: refund.id, action: "refund.recovery_attempt_started" } });
    expect(recoveryRows.length).toBe(1); // not two — recoverFailedRefund did not attempt its own transition since status was already PENDING
    const finalRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(finalRefund.stripeRefundId).toBe("re_crashR2");
  });

  it("34J. R2 created at Stripe before crash, id never persisted -> restart discovers R2, no R3 created", async () => {
    const { payment, refund } = await setupRefund(6000);
    const fake = makeFakeStripeClient({
      onCreateRefund: (p) => ({ id: "re_R1_34J", status: "failed", amount: p.amount, payment_intent: p.payment_intent, metadata: p.metadata ?? {}, failure_reason: null }),
    });
    vi.mocked(getStripeClient).mockReturnValue(fake as never);
    await resolveRefundOutcomeAndConverge(refund.id); // R1 fails

    // Simulate recoverFailedRefund's transition + the Stripe create call
    // having ALREADY happened (R2 exists at "Stripe"), but the crash struck
    // before `stripeRefundId` was persisted locally.
    await db.$transaction(async (tx) => {
      await tx.refund.updateMany({ where: { id: refund.id, status: "FAILED" }, data: { status: "PENDING", stripeRefundId: null } });
      await tx.auditLog.create({
        data: { actorUserId: null, action: "refund.recovery_attempt_started", entityType: "Refund", entityId: refund.id, metadata: { previousFailedStripeRefundId: "re_R1_34J", bookingId: refund.bookingId } },
      });
    });
    fake._seedRefund({ id: "re_R2_34J", status: "succeeded", amount: 6000, payment_intent: payment.stripePaymentIntentId!, metadata: { refundId: refund.id, recoveryOf: "re_R1_34J" }, failure_reason: null });
    fake.refunds.create.mockClear(); // clear the R1-creating call from setup — this test asserts no call happens DURING resumption

    const resumed = await recoverFailedRefund(refund.id);
    expect(resumed).toBe("succeeded");
    expect(fake.refunds.create).not.toHaveBeenCalled(); // adopted R2, never created a third
    const finalRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(finalRefund.stripeRefundId).toBe("re_R2_34J");
  });

  it("34K. R1 failed -> R2 failed -> third recovery: both accounted, R3 created exactly once with the correct derived key", async () => {
    const { refund } = await setupRefund(6000);
    let creates = 0;
    const fake = makeFakeStripeClient({
      onCreateRefund: (p) => {
        creates++;
        if (creates === 1) return { id: "re_G1", status: "failed", amount: p.amount, payment_intent: p.payment_intent, metadata: p.metadata ?? {}, failure_reason: null };
        if (creates === 2) return { id: "re_G2", status: "failed", amount: p.amount, payment_intent: p.payment_intent, metadata: p.metadata ?? {}, failure_reason: null };
        return { id: "re_G3", status: "succeeded", amount: p.amount, payment_intent: p.payment_intent, metadata: p.metadata ?? {}, failure_reason: null };
      },
    });
    vi.mocked(getStripeClient).mockReturnValue(fake as never);
    await resolveRefundOutcomeAndConverge(refund.id); // R1 fails
    await recoverFailedRefund(refund.id); // R2 fails
    const afterR2 = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(afterR2.status).toBe("FAILED");
    expect(afterR2.stripeRefundId).toBe("re_G2");

    const finalOutcome = await recoverFailedRefund(refund.id); // R3 succeeds
    expect(finalOutcome).toBe("succeeded");
    expect(creates).toBe(3);
    expect(fake._createCalls[2]?.idempotencyKey).toBe(`refund:${refund.id}:retry-after:re_G2`);
    expect(fake._createCalls[1]?.idempotencyKey).toBe(`refund:${refund.id}:retry-after:re_G1`);
  });

  it("34L. stale refund.failed webhook for R1 while R2 is PENDING -> logical Refund remains PENDING", async () => {
    const { refund } = await setupRefund(6000);
    const fake = makeFakeStripeClient({
      onCreateRefund: (p) => ({ id: "re_R1_34L", status: "failed", amount: p.amount, payment_intent: p.payment_intent, metadata: p.metadata ?? {}, failure_reason: null }),
    });
    vi.mocked(getStripeClient).mockReturnValue(fake as never);
    await resolveRefundOutcomeAndConverge(refund.id); // R1 fails

    // Start R2's recovery transition (durable) without resolving it yet —
    // R2 is "in flight."
    await db.$transaction(async (tx) => {
      await tx.refund.updateMany({ where: { id: refund.id, status: "FAILED" }, data: { status: "PENDING", stripeRefundId: null } });
      await tx.auditLog.create({
        data: { actorUserId: null, action: "refund.recovery_attempt_started", entityType: "Refund", entityId: refund.id, metadata: { previousFailedStripeRefundId: "re_R1_34L", bookingId: refund.bookingId } },
      });
    });

    // A delayed refund.failed webhook for R1 arrives now.
    const outcome = await resolveRefundOutcomeAndConverge(refund.id, { observedStripeRefundId: "re_R1_34L" });
    expect(outcome).toBe("pending");
    const finalRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(finalRefund.status).toBe("PENDING"); // not rolled back to FAILED
    const staleRow = await db.auditLog.findFirst({ where: { entityType: "Refund", entityId: refund.id, action: "refund.stale_webhook_ignored" } });
    expect(staleRow).not.toBeNull();
  });

  it("34M. stale refund.failed webhook for R1 after R2 SUCCEEDED -> logical Refund remains SUCCEEDED", async () => {
    const { payment, refund } = await setupRefund(6000);
    const fake = makeFakeStripeClient({
      onCreateRefund: (p) => {
        if (!fake._refundsById.has("re_R1_34M")) return { id: "re_R1_34M", status: "failed", amount: p.amount, payment_intent: p.payment_intent, metadata: p.metadata ?? {}, failure_reason: null };
        return { id: "re_R2_34M", status: "succeeded", amount: p.amount, payment_intent: p.payment_intent, metadata: p.metadata ?? {}, failure_reason: null };
      },
    });
    vi.mocked(getStripeClient).mockReturnValue(fake as never);
    await resolveRefundOutcomeAndConverge(refund.id); // R1 fails
    await recoverFailedRefund(refund.id); // R2 succeeds

    const outcome = await resolveRefundOutcomeAndConverge(refund.id, { observedStripeRefundId: "re_R1_34M" });
    expect(outcome).toBe("succeeded"); // short-circuits on already-SUCCEEDED, never re-examines the stale id
    const finalRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(finalRefund.status).toBe("SUCCEEDED");
    expect(finalRefund.stripeRefundId).toBe("re_R2_34M");
    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.refundedAmountCents).toBe(6000);
  });

  it("34N. multiple historical failed attempts plus exactly one unaccounted refund -> that one alone is adopted", async () => {
    const { payment, refund } = await setupRefund(6000);
    // Manually construct a two-generation failure history (R1, R2 both
    // accounted) durably, then leave R3 discoverable-but-unpersisted.
    await db.refund.update({ where: { id: refund.id }, data: { status: "FAILED", stripeRefundId: "re_H1" } });
    await db.auditLog.create({ data: { actorUserId: null, action: "refund.failed_requires_recovery", entityType: "Refund", entityId: refund.id, metadata: { failedStripeRefundId: "re_H1", bookingId: refund.bookingId } } });
    await db.$transaction(async (tx) => {
      await tx.refund.updateMany({ where: { id: refund.id, status: "FAILED" }, data: { status: "PENDING", stripeRefundId: null } });
      await tx.auditLog.create({ data: { actorUserId: null, action: "refund.recovery_attempt_started", entityType: "Refund", entityId: refund.id, metadata: { previousFailedStripeRefundId: "re_H1", bookingId: refund.bookingId } } });
    });
    await db.refund.update({ where: { id: refund.id }, data: { status: "FAILED", stripeRefundId: "re_H2" } });
    await db.auditLog.create({ data: { actorUserId: null, action: "refund.failed_requires_recovery", entityType: "Refund", entityId: refund.id, metadata: { failedStripeRefundId: "re_H2", bookingId: refund.bookingId } } });
    await db.$transaction(async (tx) => {
      await tx.refund.updateMany({ where: { id: refund.id, status: "FAILED" }, data: { status: "PENDING", stripeRefundId: null } });
      await tx.auditLog.create({ data: { actorUserId: null, action: "refund.recovery_attempt_started", entityType: "Refund", entityId: refund.id, metadata: { previousFailedStripeRefundId: "re_H2", bookingId: refund.bookingId } } });
    });

    const fake = makeFakeStripeClient();
    fake._seedRefund({ id: "re_H1", status: "failed", amount: 6000, payment_intent: payment.stripePaymentIntentId!, metadata: { refundId: refund.id }, failure_reason: null });
    fake._seedRefund({ id: "re_H2", status: "failed", amount: 6000, payment_intent: payment.stripePaymentIntentId!, metadata: { refundId: refund.id }, failure_reason: null });
    fake._seedRefund({ id: "re_H3", status: "succeeded", amount: 6000, payment_intent: payment.stripePaymentIntentId!, metadata: { refundId: refund.id }, failure_reason: null });
    vi.mocked(getStripeClient).mockReturnValue(fake as never);

    const outcome = await resolveRefundOutcomeAndConverge(refund.id);
    expect(outcome).toBe("succeeded");
    expect(fake.refunds.create).not.toHaveBeenCalled();
    const finalRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(finalRefund.stripeRefundId).toBe("re_H3");
  });

  it("34O. Tier 4 direct sweep: a genuinely stuck-PENDING Refund past the threshold is discovered and converged by reconcileStuckPayments (pre-existing H.8 test debt, plan §AE test #30)", async () => {
    const { payment, refund } = await setupRefund(6000);
    // A genuinely first-ever attempt: PENDING, no stripeRefundId, and no
    // recovery lineage at all (accountedIds.size === 0) — the ONE PENDING
    // shape that is safe for Tier 4/resolveRefundOutcomeAndConverge to
    // auto-resolve (network ambiguity or a crashed process before Step B
    // ever ran), deliberately contrasted with the H.8.2 recovery-PENDING
    // case (a FAILED->PENDING recovery attempt already in flight), which
    // must NEVER be auto-resolved this way — see
    // refundSettlementFinality.integration.test.ts, "H.8.2 A-H" describe
    // block, case A/C for that distinct, non-auto-retried state.
    await db.refund.update({
      where: { id: refund.id },
      data: { updatedAt: new Date(Date.now() - 45 * 60 * 1000) }, // past STUCK_PAYMENT_THRESHOLD_MS (30 min)
    });
    const preSweep = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(preSweep.status).toBe("PENDING");
    expect(preSweep.stripeRefundId).toBeNull();

    const fake = makeFakeStripeClient();
    vi.mocked(getStripeClient).mockReturnValue(fake as never);

    await reconcileStuckPayments();

    expect(fake.refunds.create).toHaveBeenCalledTimes(1); // Tier 4 itself drove the first-ever create
    const finalRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(finalRefund.status).toBe("SUCCEEDED");
    expect(finalRefund.stripeRefundId).not.toBeNull();
    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.refundedAmountCents).toBe(6000);
  });
});

// ===========================================================================
// F. TUTOREARNING / TUTORTRANSFER RACE (§AE 35-39)
// ===========================================================================
describe("TutorEarning/TutorTransfer cancellation interaction (§R)", () => {
  it("35-36. PENDING_ELIGIBLE / ELIGIBLE earning, no transfer yet -> voided on cancellation", async () => {
    const { booking, payment, student } = await setupConfirmedCapturedBooking();
    vi.mocked(getStripeClient).mockReturnValue(makeFakeStripeClient() as never);
    await cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" });
    const earning = await db.tutorEarning.findUniqueOrThrow({ where: { bookingId: booking.id } });
    expect(earning.status).toBe("CANCELLED");
    void payment;
  });

  it("38-39. earning already claimed by a TutorTransfer -> never voided, exposure audited", async () => {
    const { booking, student } = await setupConfirmedCapturedBooking();
    const earning = await db.tutorEarning.findUniqueOrThrow({ where: { bookingId: booking.id } });
    const transfer = await db.tutorTransfer.create({
      data: { id: randomUUID(), tutorEarningId: earning.id, tutorProfileId: earning.tutorProfileId, amountCents: earning.amountCents, status: "PENDING" },
    });
    vi.mocked(getStripeClient).mockReturnValue(makeFakeStripeClient() as never);
    await cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" });
    const finalEarning = await db.tutorEarning.findUniqueOrThrow({ where: { id: earning.id } });
    expect(finalEarning.status).toBe("PENDING_ELIGIBLE"); // untouched
    const exposureRow = await db.auditLog.findFirst({ where: { entityType: "TutorEarning", entityId: earning.id, action: "tutor_earning.transferred_exposure_at_cancellation" } });
    expect(exposureRow).not.toBeNull();
    await db.tutorTransfer.delete({ where: { id: transfer.id } });
  });
});

// ===========================================================================
// G. QUICK MATCH + SESSION_ CONSISTENCY (§AE 40-41)
// ===========================================================================
describe("Quick Match terminal consistency + Session_ consistency (§U, §T)", () => {
  it("40. cancelled Quick-Match-originated booking makes TutoringRequest terminal, no rematch", async () => {
    const tutor = await createTutorUser();
    const student = await createSelfManagedStudent();
    const request = await db.tutoringRequest.create({
      data: { createdByUserId: student.user.id, studentProfileId: student.studentProfile.id, subjectId, tutoringMode: "ONLINE", durationMinutes: 60, requestedStartAt: FAR_FUTURE_START, status: "BOOKED" },
    });
    createdTutoringRequestIds.push(request.id);
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
      tutoringRequestId: request.id,
    });
    await db.payment.update({ where: { id: payment.id }, data: { status: "AUTHORIZED" } });
    await convergeToCaptured(payment.id);
    vi.mocked(getStripeClient).mockReturnValue(makeFakeStripeClient() as never);
    await cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" });
    const finalRequest = await db.tutoringRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(finalRequest.status).toBe("CANCELLED");
    const invitationCount = await db.tutorInvitation.count({ where: { tutoringRequestId: request.id } });
    expect(invitationCount).toBe(0);
  });
});

// ===========================================================================
// H. NOTIFICATIONS + AUDIT (§AE 17-18, 48-50)
// ===========================================================================
describe("payer-aware notifications and audit model", () => {
  it("17-18. guardian-paid booking notification goes to the PAYER (parent), never the learner", async () => {
    const parent = await createParentUser();
    const child = await createGuardianManagedChild(parent.parentProfile.id, "ACTIVE");
    const tutor = await createTutorUser();
    const quote = await makeQuote(parent.user.id, child.studentProfile.id);
    const payoutQuote = await makePayoutQuote(tutor.tutorProfile.id, quote.id);
    const payment = await makePayment(quote.id, parent.user.id);
    const booking = await reserveBooking({
      actorUserId: parent.user.id,
      studentProfileId: child.studentProfile.id,
      tutorProfileId: tutor.tutorProfile.id,
      customerPriceQuoteId: quote.id,
      tutorPayoutQuoteId: payoutQuote.id,
      paymentId: payment.id,
    });
    await db.payment.update({ where: { id: payment.id }, data: { status: "AUTHORIZED", stripePaymentIntentId: `pi_fake_${randomUUID()}` } });
    await convergeToCaptured(payment.id);
    vi.mocked(getStripeClient).mockReturnValue(makeFakeStripeClient() as never);
    await cancelBookingWithRefund(booking.id, parent.user.id, { actorRole: "PARENT" });
    // Phase H.8.1 — notification type renamed payment.refunded -> payment.refund_initiated
    // (the AuditLog action "payment.refunded" is unchanged; only the Notification.type string moved).
    const notification = await db.notification.findFirst({ where: { userId: parent.user.id, type: "payment.refund_initiated" } });
    expect(notification).not.toBeNull(); // login-less child.studentProfile.userId is null — never a valid notification target
  });

  it("tutor cancellation notification: a distinct tutor notice fires when a non-tutor actor cancels (§X)", async () => {
    // Pre-sandbox verification gap closure: cancellationPolicy.ts writes a
    // distinct `booking.cancelled_notify_tutor` notification to the tutor
    // (unless the tutor is the one cancelling) — this was implemented but
    // had no permanent regression test before this pass.
    const { tutor, student, booking } = await setupConfirmedCapturedBooking();
    vi.mocked(getStripeClient).mockReturnValue(makeFakeStripeClient() as never);
    await cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" });
    const tutorNotification = await db.notification.findFirst({
      where: { userId: tutor.user.id, type: "booking.cancelled_notify_tutor" },
    });
    expect(tutorNotification).not.toBeNull();
    expect((tutorNotification?.metadata as Record<string, unknown>)?.bookingId).toBe(booking.id);
  });

  it("tutor cancellation notification: NOT sent to the tutor when the tutor is the one who cancelled", async () => {
    const { tutor, booking } = await setupConfirmedCapturedBooking();
    vi.mocked(getStripeClient).mockReturnValue(makeFakeStripeClient() as never);
    await cancelBookingWithRefund(booking.id, tutor.user.id, { actorRole: "TUTOR" });
    const tutorNotification = await db.notification.findFirst({
      where: { userId: tutor.user.id, type: "booking.cancelled_notify_tutor" },
    });
    expect(tutorNotification).toBeNull(); // the tutor already knows — they cancelled it themselves
  });

  it("48-50. cancellation audit row carries actor/learner/payer as three independently-verifiable identities", async () => {
    const parent = await createParentUser();
    const child = await createGuardianManagedChild(parent.parentProfile.id, "ACTIVE");
    const tutor = await createTutorUser();
    const quote = await makeQuote(parent.user.id, child.studentProfile.id);
    const payoutQuote = await makePayoutQuote(tutor.tutorProfile.id, quote.id);
    const payment = await makePayment(quote.id, parent.user.id);
    const booking = await reserveBooking({
      actorUserId: parent.user.id,
      studentProfileId: child.studentProfile.id,
      tutorProfileId: tutor.tutorProfile.id,
      customerPriceQuoteId: quote.id,
      tutorPayoutQuoteId: payoutQuote.id,
      paymentId: payment.id,
    });
    await db.payment.update({ where: { id: payment.id }, data: { status: "AUTHORIZED" } });
    await convergeToCaptured(payment.id);
    vi.mocked(getStripeClient).mockReturnValue(makeFakeStripeClient() as never);
    await cancelBookingWithRefund(booking.id, parent.user.id, { actorRole: "PARENT" });
    const auditRow = await db.auditLog.findFirstOrThrow({ where: { entityType: "Booking", entityId: booking.id, action: "booking.cancelled_by_customer" } });
    const metadata = auditRow.metadata as Record<string, unknown>;
    expect(auditRow.actorUserId).toBe(parent.user.id);
    expect(metadata.learnerStudentProfileId).toBe(child.studentProfile.id);
    expect(metadata.payerUserId).toBe(parent.user.id);
    expect(metadata.learnerStudentProfileId).not.toBe(metadata.payerUserId);
  });
});

// ===========================================================================
// I. DOUBLE-CANCEL / IDEMPOTENT RE-CONVERGENCE (§AE 19-20)
// ===========================================================================
describe("double-click cancellation and idempotent re-convergence", () => {
  it("19-20. double-click cancellation produces exactly one status transition, one Refund row", async () => {
    const { booking, payment } = await setupConfirmedCapturedBooking();
    vi.mocked(getStripeClient).mockReturnValue(makeFakeStripeClient() as never);
    await cancelBookingWithRefund(booking.id, payment.payerUserId, { actorRole: "STUDENT" });
    // A second, near-simultaneous Server Action invocation against the
    // same already-CANCELLED booking must be rejected cleanly, never
    // produce a second Refund or a second Stripe call.
    await expect(cancelBookingWithRefund(booking.id, payment.payerUserId, { actorRole: "STUDENT" })).rejects.toThrow(
      BookingNotCancellableError
    );
    const refunds = await db.refund.findMany({ where: { bookingId: booking.id } });
    expect(refunds.length).toBe(1);
  });

  it("convergeCancelledBookingPayment is safe to call directly, repeatedly, and idempotently after a normal cancellation", async () => {
    const { booking } = await setupConfirmedCapturedBooking();
    vi.mocked(getStripeClient).mockReturnValue(makeFakeStripeClient() as never);
    await cancelBookingWithRefund(booking.id, (await db.booking.findUniqueOrThrow({ where: { id: booking.id }, include: { payment: true } })).payment!.payerUserId, { actorRole: "STUDENT" });
    const afterFirst = await db.payment.findFirstOrThrow({ where: { booking: { id: booking.id } } });
    // Re-invoke the Phase 2 convergence function directly, several times —
    // mirrors what the reconciliation sweep does; must never re-apply the
    // refund or throw.
    await convergeCancelledBookingPayment(booking.id);
    await convergeCancelledBookingPayment(booking.id);
    await convergeCancelledBookingPayment(booking.id);
    const afterRepeats = await db.payment.findFirstOrThrow({ where: { booking: { id: booking.id } } });
    expect(afterRepeats.refundedAmountCents).toBe(afterFirst.refundedAmountCents);
    expect(afterRepeats.status).toBe(afterFirst.status);
  });

  it("convergeCancelledBookingPayment is a safe no-op for a booking with no Payment at all", async () => {
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
    // Unlink the payment entirely (a defensive, DRAFT-like edge case) and
    // mark the booking CANCELLED directly.
    await db.payment.update({ where: { id: payment.id }, data: { bookingId: null } });
    await db.booking.update({ where: { id: booking.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await expect(convergeCancelledBookingPayment(booking.id)).resolves.toBeUndefined();
  });
});
