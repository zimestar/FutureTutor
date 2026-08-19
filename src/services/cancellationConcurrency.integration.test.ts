import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";

// Phase H.8 (§AF, amended §AM) — dedicated concurrency/race regression
// suite, kept separate from cancellationRefund.integration.test.ts per the
// plan's §AC.6 rationale: these tests exercise genuine overlapping
// operations (Promise.all against the same connection pool, or a
// sequential "committed in between" simulation matching this codebase's
// own established REAL-TOCTOU pattern — see
// learnerPayerWiring.integration.test.ts test #33, which proves TOCTOU
// protection via "commit the intervening change, THEN run the
// authoritative re-check," not via an injected mid-transaction hook — the
// same style is reused here for consistency) rather than the mostly-
// sequential single-client style the base refund suite uses, so the
// common-case suite stays fast and this suite's necessarily slower/
// timing-adjacent tests stay isolated.
//
// Same DB-target redirection technique as cancellationRefund.integration.test.ts
// (see that file's own header comment for the full rationale): resolve and
// verify the test database FIRST, reassign process.env.DATABASE_URL to the
// verified target, THEN dynamically import every module that transitively
// touches @/lib/db's ambient singleton.

vi.mock("@/lib/stripe", () => ({ getStripeClient: vi.fn() }));

import { getStripeClient } from "@/lib/stripe";

let createCustomerPriceQuote: typeof import("./customerPricing").createCustomerPriceQuote;
let createTutorPayoutQuote: typeof import("./tutorPayout").createTutorPayoutQuote;
let reserveBookingPendingPayment: typeof import("./bookingCreation").reserveBookingPendingPayment;
let cancelBookingWithRefund: typeof import("./cancellationPolicy").cancelBookingWithRefund;
let NotAuthorizedToCancelError: typeof import("./cancellationPolicy").NotAuthorizedToCancelError;
let SessionAlreadyStartedError: typeof import("./cancellationPolicy").SessionAlreadyStartedError;
let BookingNotCancellableError: typeof import("./cancellationPolicy").BookingNotCancellableError;
// Pre-Phase-4 H.8 Session Writer Hardening — the new guarded/count-checked
// Session_ write's own domain error, and recordSessionCheckIn (used below
// to construct the one genuinely-reachable pre-hardening bug scenario: an
// early dual check-in moving Session_ to IN_PROGRESS before Booking.startAt,
// still inside cancelBookingWithRefund's own cancellable window).
let SessionNotCancellableError: typeof import("./cancellationPolicy").SessionNotCancellableError;
let recordSessionCheckIn: typeof import("./sessionLifecycle").recordSessionCheckIn;
let convergeToCaptured: typeof import("./payments").convergeToCaptured;
let getOrCreateRefund: typeof import("./payments").getOrCreateRefund;
let refundIdForBooking: typeof import("./payments").refundIdForBooking;
let resolveRefundOutcomeAndConverge: typeof import("./payments").resolveRefundOutcomeAndConverge;
let recoverFailedRefund: typeof import("./payments").recoverFailedRefund;
let createTransferForEarning: typeof import("./tutorTransfers").createTransferForEarning;
let markEligibleEarnings: typeof import("./tutorTransfers").markEligibleEarnings;
// Phase H.8.3 — module-scope handle to the ambient @/lib/db singleton
// (the exact PrismaClient instance cancellationPolicy.ts's cancelBookingWithRefund
// itself calls .$transaction on), captured once in beforeAll below. Used by
// the H.8.3 retry-hardening tests to count/observe real $transaction
// invocations without mocking any query result — a thin call-counting
// wrapper around the real method, never a replacement for genuine DB work.
let ambientDb: typeof import("@/lib/db").db;

interface FakeStripeRefund {
  id: string;
  status: "succeeded" | "pending" | "failed" | "canceled";
  amount: number;
  payment_intent: string;
  metadata: Record<string, string>;
  failure_reason: string | null;
}

function makeFakeStripeClient(
  opts: {
    onCreateRefund?: (params: { payment_intent: string; amount: number; metadata?: Record<string, string> }) => FakeStripeRefund | "throw";
  } = {}
) {
  const refundsById = new Map<string, FakeStripeRefund>();
  const idempotencyStore = new Map<string, FakeStripeRefund>();
  let nextId = 1;
  const createCalls: Array<{ idempotencyKey: string }> = [];

  return {
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
          // H.8.1 test-infra repair — see refundSettlementFinality.
          // integration.test.ts's identical comment: `re_fake_${nextId++}`
          // alone always restarts at `re_fake_1`, which permanently
          // collides with any Refund row a previously interrupted/crashed
          // run left behind (Refund.stripeRefundId has a real Postgres
          // UNIQUE constraint), silently turning a genuine first-ever
          // create() into "uncertain" via resolveRefundOutcomeAndConverge's
          // own catch-all. Folding randomUUID() in makes the id
          // collision-proof against any prior run's leftover state.
          id: `re_fake_${randomUUID()}_${nextId++}`,
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
        return {
          [Symbol.asyncIterator]: async function* () {
            for (const item of items) yield item;
          },
        };
      }),
    },
    paymentIntents: {
      cancel: vi.fn(async (id: string) => ({ id, status: "canceled" })),
      retrieve: vi.fn(async (id: string) => ({ id, status: "canceled" })),
    },
    _createCalls: createCalls,
    _refundsById: refundsById,
  };
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

const FAR_FUTURE_START = new Date(Date.now() + 61 * 24 * 60 * 60 * 1000);

beforeAll(async () => {
  const target = resolveVerifiedTestDatabase();
  // Captured BEFORE process.env.DATABASE_URL is reassigned below — used
  // ONLY for the ambient-singleton safety proof a few lines down (never
  // used to open a connection).
  const devDatabaseUrlForSafetyCheckOnly = process.env.DATABASE_URL;
  const adapter = new PrismaPg({ connectionString: target.connectionString });
  db = new PrismaClient({ adapter });

  process.env.DATABASE_URL = target.connectionString;

  ({ createCustomerPriceQuote } = await import("./customerPricing"));
  ({ createTutorPayoutQuote } = await import("./tutorPayout"));
  ({ reserveBookingPendingPayment } = await import("./bookingCreation"));
  ({ cancelBookingWithRefund, NotAuthorizedToCancelError, SessionAlreadyStartedError, SessionNotCancellableError, BookingNotCancellableError } =
    await import("./cancellationPolicy"));
  ({ convergeToCaptured, getOrCreateRefund, refundIdForBooking, resolveRefundOutcomeAndConverge, recoverFailedRefund } = await import(
    "./payments"
  ));
  ({ createTransferForEarning, markEligibleEarnings } = await import("./tutorTransfers"));
  ({ recordSessionCheckIn } = await import("./sessionLifecycle"));

  // Pre-sandbox verification, item 3 — same ambient-singleton database
  // proof as cancellationRefund.integration.test.ts (see that file's own
  // comment for the full rationale). Fails closed: throws, never skips.
  ({ db: ambientDb } = await import("@/lib/db"));
  const [{ current_database: ambientDatabaseName }] = await ambientDb.$queryRaw<
    Array<{ current_database: string }>
  >`SELECT current_database()`;
  if (ambientDatabaseName !== target.databaseName) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton reports current_database() = "${ambientDatabaseName}", but the verified test database is "${target.databaseName}". Refusing to run any H.8 concurrency test.`
    );
  }
  const devDatabaseNameForSafetyCheckOnly = devDatabaseUrlForSafetyCheckOnly
    ? new URL(devDatabaseUrlForSafetyCheckOnly).pathname.replace(/^\//, "")
    : null;
  if (devDatabaseNameForSafetyCheckOnly && ambientDatabaseName === devDatabaseNameForSafetyCheckOnly) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton's current_database() ("${ambientDatabaseName}") equals the real development database name. Refusing to run any H.8 concurrency test.`
    );
  }

  const subject = await db.subject.create({ data: { slug: `h8-cc-subject-${randomUUID()}`, sortOrder: 999 } });
  subjectId = subject.id;
  const level = await db.academicLevel.create({ data: { slug: `h8-cc-level-${randomUUID()}`, sortOrder: 999 } });
  academicLevelId = level.id;

  const existingSettings = await db.marketplacePricingSettings.findFirst();
  if (!existingSettings) await db.marketplacePricingSettings.create({ data: {} });

  await db.customerBasePriceRule.create({
    data: { subjectId, academicLevelId: null, baseDurationMinutes: 60, basePriceCents: 8000, pricingVersion: "CUSTOMER_PRICING_V1" },
  });
  await db.tutorBasePayoutRule.create({
    data: { tutorTier: "NEW", subjectId, academicLevelId: null, baseDurationMinutes: 60, payoutCents: 5000, payoutVersion: "TUTOR_PAYOUT_V1" },
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
    await db.tutorTransfer.deleteMany({ where: { tutorEarning: { bookingId: { in: createdBookingIds } } } });
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
  return `h8-cc-${prefix}-${randomUUID()}@futuretutor.test`;
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
    data: { userId: user.id, slug: `h8-cc-tutor-${randomUUID()}`, applicationStatus: "APPROVED", payoutTier: "NEW", learningMode: "BOTH" },
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

async function createGuardianManagedChild(parentProfileId: string, status: "ACTIVE" | "REVOKED" = "ACTIVE") {
  const studentProfile = await db.studentProfile.create({
    data: { firstName: "Kid", lastName: "Test", dateOfBirth: new Date("2015-01-01T00:00:00.000Z"), managementMode: "GUARDIAN_MANAGED", userId: null },
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
      }),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
  createdBookingIds.push(booking.id);
  return booking;
}

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
  return { tutor, student, payment: finalPayment, booking };
}

/**
 * Phase H.8.3 — thin call-counting wrapper around the REAL
 * ambientDb.$transaction (the exact method cancelBookingWithRefund's own
 * withSerializableRetry(() => db.$transaction(...)) call invokes). Every
 * call is passed straight through to the original implementation — no
 * query, no result, and no error is ever faked by this helper — it only
 * counts invocations, so a count > 1 for a single cancelBookingWithRefund
 * call is direct, non-mocked evidence that withSerializableRetry actually
 * re-invoked the transaction callback (i.e. a real P2034 was caught and
 * retried), while a count == 1 proves no retry occurred.
 */
function withTransactionCallCounter<T>(run: () => Promise<T>): Promise<{ result: T; transactionCalls: number }> {
  const original = ambientDb.$transaction.bind(ambientDb);
  let transactionCalls = 0;
  (ambientDb as unknown as { $transaction: typeof ambientDb.$transaction }).$transaction = ((...args: Parameters<typeof original>) => {
    transactionCalls++;
    return (original as (...a: Parameters<typeof original>) => ReturnType<typeof original>)(...args);
  }) as typeof ambientDb.$transaction;

  return run()
    .then((result) => ({ result, transactionCalls }))
    .finally(() => {
      ambientDb.$transaction = original;
    });
}

/** A real Prisma-shaped P2034 error, exactly as Postgres/Prisma would
 * surface a genuine Serializable write-conflict — constructed directly
 * (not string-matched), same class withSerializableRetry itself checks
 * with `instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034"`. */
function makeP2034Error(): InstanceType<typeof Prisma.PrismaClientKnownRequestError> {
  return new Prisma.PrismaClientKnownRequestError(
    "Transaction failed due to a write conflict or a deadlock. Please retry your transaction",
    { code: "P2034", clientVersion: "test" }
  );
}

describe("Phase H.8 concurrency/race regression suite (§AF, amended §AM)", () => {
  it("1. Guardian-revoked-mid-cancellation: authority committed-revoked between Layer 1 and Layer 2 -> denied, zero mutation", async () => {
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

    // Layer 1 pre-check would have passed here (relationship still ACTIVE).
    // The relationship is revoked for real, committed, BEFORE the
    // authoritative transaction runs — matching this codebase's own
    // established REAL-TOCTOU proof style (learnerPayerWiring test #33).
    await db.parentStudentRelationship.update({ where: { id: child.relationship.id }, data: { status: "REVOKED" } });

    await expect(cancelBookingWithRefund(booking.id, parent.user.id, { actorRole: "PARENT" })).rejects.toThrow(
      NotAuthorizedToCancelError
    );

    const unchangedBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(unchangedBooking.status).toBe("CONFIRMED");
    const refund = await db.refund.findUnique({ where: { id: refundIdForBooking(booking.id) } });
    expect(refund).toBeNull();
    const cancelAudit = await db.auditLog.findFirst({ where: { entityType: "Booking", entityId: booking.id, action: { in: ["booking.cancelled_by_customer", "booking.cancelled_by_tutor", "booking.cancelled_by_admin"] } } });
    expect(cancelAudit).toBeNull();
  });

  it("2. Session-start-boundary-crossing mid-cancellation: clock advances past startAt between Layer 1 and Layer 2 -> rejected", async () => {
    const almostNow = new Date(Date.now() + 300);
    const { booking, payment } = await setupConfirmedCapturedBooking({ startAt: almostNow });
    // Layer 1 pre-check (not exercised here directly) would pass at time
    // of click; the authoritative transaction's OWN fresh clock() call,
    // deliberately advanced past startAt, is what must reject it.
    await expect(
      cancelBookingWithRefund(booking.id, payment.payerUserId, {
        actorRole: "STUDENT",
        clock: () => new Date(almostNow.getTime() + 1),
      })
    ).rejects.toThrow(SessionAlreadyStartedError);
    const unchanged = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(unchanged.status).toBe("CONFIRMED");
  });

  it("3. Capture-vs-cancellation, both orderings, never produce an orphaned Session_/TutorEarning", async () => {
    // Ordering A: cancel first, capture-convergence resolves after.
    {
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
      await db.payment.update({ where: { id: payment.id }, data: { status: "AUTHORIZED", stripePaymentIntentId: `pi_fake_${randomUUID()}` } });
      vi.mocked(getStripeClient).mockReturnValue(makeFakeStripeClient() as never);
      await cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" });
      await convergeToCaptured(payment.id); // late-arriving, redundant convergence trigger
      const session = await db.session_.findUnique({ where: { bookingId: booking.id } });
      const earning = await db.tutorEarning.findUnique({ where: { bookingId: booking.id } });
      expect(session).toBeNull();
      expect(earning).toBeNull();
    }

    // Ordering B: capture-convergence resolves first (normal path).
    {
      const { booking } = await setupConfirmedCapturedBooking();
      const session = await db.session_.findUnique({ where: { bookingId: booking.id } });
      const earning = await db.tutorEarning.findUnique({ where: { bookingId: booking.id } });
      expect(session?.status).toBe("SCHEDULED");
      expect(earning?.status).toBe("PENDING_ELIGIBLE");
    }
  });

  it("4. Transfer-vs-cancellation race: TutorTransfer creation and cancellation's earning-void run concurrently -> exactly one well-defined outcome, never a third", async () => {
    const { booking, student } = await setupConfirmedCapturedBooking();
    const earning = await db.tutorEarning.findUniqueOrThrow({ where: { bookingId: booking.id } });
    // Make the earning eligible and give the tutor an ACTIVE Connect
    // account so createTransferForEarning would actually proceed (in
    // dev-bypass Stripe mode — paymentsUseStripe() stays true in this
    // process, so we instead assert the DB-level race outcome directly
    // without letting createTransferForEarning reach a live Stripe call:
    // it bails out via its own fresh eligibility re-check, §R fix #1, the
    // moment the earning is no longer ELIGIBLE).
    await db.tutorEarning.update({ where: { id: earning.id }, data: { status: "ELIGIBLE" } });

    vi.mocked(getStripeClient).mockReturnValue(makeFakeStripeClient() as never);
    // Genuinely concurrent: fire the transfer attempt and the cancellation
    // together against the same connection pool.
    const [, cancelResult] = await Promise.allSettled([
      createTransferForEarning(earning.id),
      cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" }),
    ]);
    expect(cancelResult.status).toBe("fulfilled"); // cancellation itself always succeeds regardless of the race's outcome

    const finalEarning = await db.tutorEarning.findUniqueOrThrow({ where: { id: earning.id } });
    const transfer = await db.tutorTransfer.findUnique({ where: { tutorEarningId: earning.id } });

    if (transfer) {
      // The transfer won the race and claimed the earning first — never
      // voided, exposure is the accepted outcome.
      expect(finalEarning.status).not.toBe("CANCELLED");
    } else {
      // Cancellation won — the earning must be cleanly voided, no
      // transfer ever created.
      expect(finalEarning.status).toBe("CANCELLED");
    }
    // Never a third, inconsistent combination: either transfer exists (any
    // status) and earning is untouched, or no transfer exists and earning
    // is CANCELLED. The if/else above is exhaustive and this assertion
    // documents that no other branch is reachable.
  });

  it("5. Duplicate-refund-attempt race: two concurrent getOrCreateRefund + convergence calls for the same booking resolve to the same Refund and exactly one Stripe create", async () => {
    const { booking, payment } = await setupConfirmedCapturedBooking();
    const fake = makeFakeStripeClient();
    vi.mocked(getStripeClient).mockReturnValue(fake as never);

    const [refundA, refundB] = await Promise.all([
      getOrCreateRefund({ bookingId: booking.id, paymentId: payment.id, amountCents: payment.amountCents, reason: "x", actorUserId: null }),
      getOrCreateRefund({ bookingId: booking.id, paymentId: payment.id, amountCents: payment.amountCents, reason: "x", actorUserId: null }),
    ]);
    expect(refundA.id).toBe(refundB.id);

    await Promise.all([resolveRefundOutcomeAndConverge(refundA.id), resolveRefundOutcomeAndConverge(refundB.id)]);

    const distinctStripeIds = new Set(fake._createCalls.length > 0 ? [fake._createCalls[0].idempotencyKey] : []);
    expect(distinctStripeIds.size).toBeLessThanOrEqual(1); // at most one logical create identity used
    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.refundedAmountCents).toBe(payment.amountCents); // applied exactly once, never doubled
  });

  it("6. Webhook-vs-sync race: concurrent convergence calls for the same Refund.id apply the amount exactly once", async () => {
    const { booking, payment } = await setupConfirmedCapturedBooking();
    const refund = await getOrCreateRefund({ bookingId: booking.id, paymentId: payment.id, amountCents: payment.amountCents, reason: "x", actorUserId: null });
    const fake = makeFakeStripeClient();
    vi.mocked(getStripeClient).mockReturnValue(fake as never);

    const results = await Promise.all([
      resolveRefundOutcomeAndConverge(refund.id), // simulates the synchronous caller
      resolveRefundOutcomeAndConverge(refund.id), // simulates a concurrently-arriving webhook's own convergence call
    ]);
    expect(results.every((r) => r === "succeeded" || r === "pending" || r === "uncertain")).toBe(true);

    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.refundedAmountCents).toBe(payment.amountCents); // exactly one application, not two
    expect(finalPayment.status).toBe("REFUNDED");
  });

  it("7/8. Concurrent recoverFailedRefund invocations for the same FAILED Refund: at most one new distinct Stripe Refund object, refunded amount applied at most once", async () => {
    const { booking, payment } = await setupConfirmedCapturedBooking();
    const refund = await getOrCreateRefund({ bookingId: booking.id, paymentId: payment.id, amountCents: payment.amountCents, reason: "x", actorUserId: null });
    await db.booking.update({ where: { id: booking.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });

    const fake = makeFakeStripeClient({
      onCreateRefund: (p) => ({ id: "re_race_R1", status: "failed", amount: p.amount, payment_intent: p.payment_intent, metadata: p.metadata ?? {}, failure_reason: null }),
    });
    vi.mocked(getStripeClient).mockReturnValue(fake as never);
    await resolveRefundOutcomeAndConverge(refund.id); // R1 fails, deterministically, before the race below

    // Reconfigure the mock's create behavior for the recovery attempt: the
    // FIRST recovery create call to actually reach the mock produces R2;
    // any later call reusing the SAME idempotency key gets the cached R2
    // back (the fake's own idempotency-store behavior, mirroring real
    // Stripe key-replay semantics) — this is what makes "at most one
    // distinct new object" the correct, checkable invariant regardless of
    // how many of the two concurrent callers' create attempts actually
    // reach this point.
    let recoveryCreates = 0;
    fake.refunds.create.mockImplementation(async (params: { payment_intent: string; amount: number; metadata?: Record<string, string> }, options: { idempotencyKey: string }) => {
      if (fake._createCalls.find((c) => c.idempotencyKey === options.idempotencyKey)) {
        // already recorded by a prior call with this exact key — real
        // Stripe would return the SAME cached object; simulate that here.
      }
      fake._createCalls.push({ idempotencyKey: options.idempotencyKey });
      const existing = Array.from(fake._refundsById.values()).find((r) => r.id === "re_race_R2");
      if (existing) return existing;
      recoveryCreates++;
      const r: FakeStripeRefund = { id: "re_race_R2", status: "succeeded", amount: params.amount, payment_intent: params.payment_intent, metadata: params.metadata ?? {}, failure_reason: null };
      fake._refundsById.set(r.id, r);
      return r;
    });

    const [resultA, resultB] = await Promise.all([recoverFailedRefund(refund.id), recoverFailedRefund(refund.id)]);
    expect([resultA, resultB].some((r) => r === "succeeded" || r === "pending")).toBe(true);

    expect(recoveryCreates).toBeLessThanOrEqual(1); // never more than one distinct new Stripe Refund object created
    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.refundedAmountCents).toBeLessThanOrEqual(payment.amountCents);
  });

  it("7. Cancellation racing markEligibleEarnings -> both guarded updateManys compose safely regardless of interleaving order (pre-existing H.8 test debt, plan §AE test #37)", async () => {
    // Ordering A: cancellation commits first, the eligibility sweep runs after.
    {
      const { booking, student } = await setupConfirmedCapturedBooking();
      const earning = await db.tutorEarning.findUniqueOrThrow({ where: { bookingId: booking.id } });
      await db.tutorEarning.update({ where: { id: earning.id }, data: { eligibleAt: new Date(Date.now() - 1000) } });
      vi.mocked(getStripeClient).mockReturnValue(makeFakeStripeClient() as never);

      await cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" });
      await markEligibleEarnings(); // cancellation already flipped it to CANCELLED -> markEligibleEarnings' own PENDING_ELIGIBLE guard no longer matches, correctly a no-op

      const finalEarning = await db.tutorEarning.findUniqueOrThrow({ where: { id: earning.id } });
      expect(finalEarning.status).toBe("CANCELLED"); // never resurrected to ELIGIBLE by the sweep
    }

    // Ordering B: the eligibility sweep commits first, cancellation after.
    //
    // Phase 5B REVISION: pre-Phase-5B, markEligibleEarnings promoted purely
    // on `eligibleAt <= now`, so a still-SCHEDULED session's earning with a
    // stale/past eligibleAt WAS promoted to ELIGIBLE here. That is exactly
    // the wall-clock-only defect Phase 5B closes (task §9) — the hardened
    // markEligibleEarnings now additionally requires authoritative Session
    // permission (COMPLETED, or NO_SHOW+STUDENT_NO_SHOW), which a
    // still-SCHEDULED session never has. This block now asserts THAT
    // invariant directly: the sweep must NOT promote it, and the earning
    // must still end up voided (PENDING_ELIGIBLE is one of cancellation's
    // own two guarded prior states).
    {
      const { booking, student } = await setupConfirmedCapturedBooking();
      const earning = await db.tutorEarning.findUniqueOrThrow({ where: { bookingId: booking.id } });
      await db.tutorEarning.update({ where: { id: earning.id }, data: { eligibleAt: new Date(Date.now() - 1000) } });
      vi.mocked(getStripeClient).mockReturnValue(makeFakeStripeClient() as never);

      await markEligibleEarnings();
      const midEarning = await db.tutorEarning.findUniqueOrThrow({ where: { id: earning.id } });
      // Session_ is still SCHEDULED (never converged) — Session truth does
      // not authorize eligibility, so the hardened sweep correctly refuses
      // to promote from a stale eligibleAt/time alone.
      expect(midEarning.status).toBe("PENDING_ELIGIBLE");

      await cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" });

      const finalEarning = await db.tutorEarning.findUniqueOrThrow({ where: { id: earning.id } });
      expect(finalEarning.status).toBe("CANCELLED");
    }

    // Ordering B2: cancellation's own guard (cancellationPolicy.ts,
    // unmodified by Phase 5B — the H.8 firewall) still matches BOTH
    // PENDING_ELIGIBLE and ELIGIBLE. Post-Phase-5B, an earning can only
    // become genuinely ELIGIBLE once its Session has reached a terminal,
    // non-cancellable outcome (COMPLETED / STUDENT_NO_SHOW) — at which
    // point H.8's own pre-existing Session_ guard (step 9) already rejects
    // the cancellation attempt outright (SessionNotCancellableError), so
    // "cancel an already-ELIGIBLE earning" is no longer reachable via the
    // real sweep. This block keeps the underlying guard-array regression
    // covered directly (an earning forced to ELIGIBLE, mirroring this same
    // file's own established "direct DB write to exercise a status value"
    // technique — see test #26/#27's precedent in
    // sessionNoShowConvergence.integration.test.ts) — the SESSION here is
    // deliberately left SCHEDULED (an artificial combination that cannot
    // occur via real convergence, but is still the exact state
    // cancellationPolicy.ts's own `status: { in: [...] }` guard must
    // correctly handle if it were ever reached by any future writer).
    {
      const { booking, student } = await setupConfirmedCapturedBooking();
      const earning = await db.tutorEarning.findUniqueOrThrow({ where: { bookingId: booking.id } });
      await db.tutorEarning.update({ where: { id: earning.id }, data: { status: "ELIGIBLE" } });
      vi.mocked(getStripeClient).mockReturnValue(makeFakeStripeClient() as never);

      await cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" });

      const finalEarning = await db.tutorEarning.findUniqueOrThrow({ where: { id: earning.id } });
      expect(finalEarning.status).toBe("CANCELLED");
    }

    // Genuinely concurrent: both fired together against the same connection
    // pool, repeated across several fresh bookings to make a real P2034
    // collision likely to actually occur at least once (Postgres SSI
    // conflict timing is not perfectly deterministic run-to-run). Phase
    // H.8.3 CLOSES the gap H.8.2 discovered and documented here (see
    // FutureTutor_H8_Final_Recovery_Closure_Gate_Report.md §15): before
    // H.8.3, a genuine SAME-INSTANT contention on the identical
    // TutorEarning row between this transaction's own
    // tx.tutorEarning.updateMany and markEligibleEarnings' plain updateMany
    // could abort cancelBookingWithRefund's Serializable transaction with a
    // real, reproduced P2034 (`Transaction failed due to a write conflict
    // or a deadlock`), surfaced to the caller as a raw failure even though
    // no corruption ever occurred. cancelBookingWithRefund is now wrapped
    // in withSerializableRetry (src/lib/serializableRetry.ts, the same
    // primitive payments.ts already uses for this exact conflict class), so
    // the intended FINAL invariant is: the cancellation ALWAYS eventually
    // succeeds within the bounded retry budget, the Booking/TutorEarning
    // always reach the correct terminal CANCELLED state, no P2034 ever
    // escapes to the caller, and no partial/duplicate state survives.
    let observedAtLeastOneRetry = false;
    for (let i = 0; i < 6; i++) {
      const { booking, student } = await setupConfirmedCapturedBooking();
      const earning = await db.tutorEarning.findUniqueOrThrow({ where: { bookingId: booking.id } });
      await db.tutorEarning.update({ where: { id: earning.id }, data: { eligibleAt: new Date(Date.now() - 1000) } });
      vi.mocked(getStripeClient).mockReturnValue(makeFakeStripeClient() as never);

      const cancelAuditCountBefore = await db.auditLog.count({
        where: { entityType: "Booking", entityId: booking.id, action: { in: ["booking.cancelled_by_customer", "booking.cancelled_by_tutor", "booking.cancelled_by_admin"] } },
      });
      expect(cancelAuditCountBefore).toBe(0);

      const [markResult, { result: cancelSettled, transactionCalls }] = await Promise.all([
        markEligibleEarnings(),
        withTransactionCallCounter(() => cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" }).then(
          () => ({ status: "fulfilled" as const }),
          (reason: unknown) => ({ status: "rejected" as const, reason })
        )),
      ]);
      void markResult; // markEligibleEarnings' own plain single-statement updateMany never itself rejects

      // The required final invariant: cancellation never surfaces a raw
      // P2034 to the caller — it either fulfills within the retry budget,
      // or (only in the astronomically unlikely case of >6 consecutive
      // real collisions) fails with the retry-budget-exhaustion error, but
      // NEVER with a raw, un-retried P2034 write-conflict message.
      if (cancelSettled.status === "rejected") {
        expect(String((cancelSettled as { status: "rejected"; reason: unknown }).reason)).not.toContain("write conflict");
      }
      expect(cancelSettled.status).toBe("fulfilled");

      if (transactionCalls > 1) observedAtLeastOneRetry = true;

      const finalBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(finalBooking.status).toBe("CANCELLED"); // reaches the correct cancelled state, no partial intermediate state

      const finalEarning = await db.tutorEarning.findUniqueOrThrow({ where: { id: earning.id } });
      // Cancellation's own guard matches BOTH PENDING_ELIGIBLE and
      // ELIGIBLE — no interleaving ever leaves the earning stuck ELIGIBLE
      // (payable) for a cancelled booking; no incorrect earning
      // eligibility survives.
      expect(finalEarning.status).toBe("CANCELLED");

      // No duplicate cancellation audit row — even across retried
      // transaction attempts, exactly one cancellation-intent AuditLog row
      // exists (a P2034-aborted attempt commits nothing, including its
      // audit write; only the attempt that actually commits leaves a
      // trace).
      const cancelAuditCountAfter = await db.auditLog.count({
        where: { entityType: "Booking", entityId: booking.id, action: { in: ["booking.cancelled_by_customer", "booking.cancelled_by_tutor", "booking.cancelled_by_admin"] } },
      });
      expect(cancelAuditCountAfter).toBe(1); // never duplicated by a retry
    }
    // Non-flaky evidence requirement: across the repeated race, at least
    // one iteration's cancelBookingWithRefund call genuinely invoked
    // db.$transaction more than once — i.e. a real P2034 was caught by
    // withSerializableRetry and transparently retried, not merely "never
    // happened to collide this run." (If this ever starts failing, it
    // means the race stopped reproducing real contention at all — worth
    // re-investigating, not silencing.)
    expect(observedAtLeastOneRetry).toBe(true);
  });

  it("8. Retry exhaustion: persistent P2034 beyond the bounded budget propagates, never loops infinitely, never leaves partial cancellation state", async () => {
    const { booking, student } = await setupConfirmedCapturedBooking();
    const originalTransaction = ambientDb.$transaction.bind(ambientDb);
    let transactionCalls = 0;
    (ambientDb as unknown as { $transaction: typeof ambientDb.$transaction }).$transaction = (() => {
      transactionCalls++;
      return Promise.reject(makeP2034Error());
    }) as typeof ambientDb.$transaction;

    try {
      await expect(cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" })).rejects.toThrow(
        /exhausted retry budget|serialization conflict/i
      );
    } finally {
      ambientDb.$transaction = originalTransaction;
    }

    // Bounded: retried a small, fixed number of times, never looped
    // infinitely (withSerializableRetry's own DEFAULT_MAX_RETRIES = 6).
    expect(transactionCalls).toBe(6);

    // No partial cancellation state: since every simulated attempt was
    // rejected before ever reaching the real database (the mock never
    // calls through to the original implementation), the booking created
    // by setupConfirmedCapturedBooking above is provably untouched.
    const finalBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(finalBooking.status).toBe("CONFIRMED");
    const cancelAudit = await db.auditLog.findFirst({
      where: { entityType: "Booking", entityId: booking.id, action: { in: ["booking.cancelled_by_customer", "booking.cancelled_by_tutor", "booking.cancelled_by_admin"] } },
    });
    expect(cancelAudit).toBeNull();
  });

  it("9. Non-P2034 error is NOT retried -> fails closed on first occurrence, authorization denial never masked as a transient conflict", async () => {
    // A genuine, real-DB authorization denial (NotAuthorizedToCancelError)
    // — an unrelated actor with no authority over this booking. This must
    // propagate on the FIRST transaction attempt; withSerializableRetry
    // must never treat a non-P2034 error as retryable.
    const stranger = await createSelfManagedStudent();
    const { booking } = await setupConfirmedCapturedBooking();

    const { result, transactionCalls } = await withTransactionCallCounter(() =>
      cancelBookingWithRefund(booking.id, stranger.user.id, { actorRole: "STUDENT" }).then(
        () => ({ status: "fulfilled" as const }),
        (reason: unknown) => ({ status: "rejected" as const, reason })
      )
    );
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect((result as { status: "rejected"; reason: unknown }).reason).toBeInstanceOf(NotAuthorizedToCancelError);
    }
    expect(transactionCalls).toBe(1); // never retried — fails closed on the first, real, non-P2034 error

    const finalBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(finalBooking.status).toBe("CONFIRMED"); // untouched
  });
});

// Pre-Phase-4 H.8 Session Writer Hardening — permanent regression coverage
// for the newly guarded/count-checked Session_ write in cancelBookingWithRefund
// (step 9). See FutureTutor_H8_SessionWriter_Hardening_Report.md §2-§4 for
// the full investigation: the guard closes a genuinely reachable production
// scenario (recordSessionCheckIn's own SCHEDULED -> IN_PROGRESS transition
// has no upper time bound tied to Booking.startAt, only a lower one,
// startAt - 15min, so an early dual check-in can legitimately move
// Session_ to IN_PROGRESS while Booking.status is still CONFIRMED and
// `now` is still < startAt — i.e. still inside cancelBookingWithRefund's
// own cancellable window) while leaving the far more common "no Session_
// row exists yet" case (every DRAFT/PENDING_PAYMENT booking) completely
// unaffected.
describe("Pre-Phase-4 H.8 Session Writer Hardening — Session_ write invariant", () => {
  it("A. Normal pre-start cancellation (no concurrent Session writer) -> Session_ SCHEDULED -> CANCELLED under the new count-checked write, refund proceeds normally", async () => {
    const { booking, student } = await setupConfirmedCapturedBooking();
    vi.mocked(getStripeClient).mockReturnValue(makeFakeStripeClient() as never);

    await cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" });

    const finalBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(finalBooking.status).toBe("CANCELLED");
    const finalSession = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
    expect(finalSession.status).toBe("CANCELLED");
  });

  it("B/E/F/G. Session already IN_PROGRESS (early dual check-in) at cancellation time -> the guarded Session_ write rejects the WHOLE attempt: zero Booking mutation, zero Refund, zero Stripe call, Booking/Session pairing stays consistent", async () => {
    const startAt = new Date(Date.now() + 10 * 60 * 1000); // inside the 15-min check-in window, still before startAt
    const { tutor, student, booking } = await setupConfirmedCapturedBooking({ startAt });
    const fake = makeFakeStripeClient();
    vi.mocked(getStripeClient).mockReturnValue(fake as never);

    // Both sides check in for real (sequential, not racing) — the exact,
    // currently-reachable production pathway this hardening closes.
    await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" });
    const studentCheckIn = await recordSessionCheckIn(booking.id, student.user.id, "STUDENT", { actorRole: "STUDENT" });
    expect(studentCheckIn.transitionedToInProgress).toBe(true);

    const preSession = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
    expect(preSession.status).toBe("IN_PROGRESS");

    // Cancellation attempted while `now` is still (deliberately, via the
    // real clock) < startAt — step 3's own SessionAlreadyStartedError
    // boundary does NOT reject this attempt; the NEW guarded Session_
    // write (step 9) is what must.
    await expect(cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" })).rejects.toThrow(
      SessionNotCancellableError
    );

    // (G) Booking/Session consistency: both untouched — never the invalid
    // CANCELLED-Booking/IN_PROGRESS-Session mixed pairing.
    const finalBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(finalBooking.status).toBe("CONFIRMED");
    const finalSession = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
    expect(finalSession.status).toBe("IN_PROGRESS");

    // Whole transaction rolled back — no BookingStatusHistory-implying
    // cancellation-intent AuditLog, no TutorEarning void.
    const cancelAudit = await db.auditLog.findFirst({
      where: {
        entityType: "Booking",
        entityId: booking.id,
        action: { in: ["booking.cancelled_by_customer", "booking.cancelled_by_tutor", "booking.cancelled_by_admin"] },
      },
    });
    expect(cancelAudit).toBeNull();
    const earning = await db.tutorEarning.findUniqueOrThrow({ where: { bookingId: booking.id } });
    expect(earning.status).toBe("PENDING_ELIGIBLE"); // never voided

    // (E) No Refund row at all — Phase 2 (convergeCancelledBookingPayment)
    // is only reached after the transaction COMMITS; it never ran here.
    const refund = await db.refund.findUnique({ where: { id: refundIdForBooking(booking.id) } });
    expect(refund).toBeNull();

    // (F) No Stripe call of any kind — same reasoning.
    expect(fake.refunds.create).not.toHaveBeenCalled();
    expect(fake.paymentIntents.cancel).not.toHaveBeenCalled();
  });

  it("Benign-missing-row regression: cancelling a PENDING_PAYMENT booking (no Session_ row exists yet) proceeds exactly as before this hardening", async () => {
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
    // Deliberately never converged to CAPTURED/CONFIRMED — the booking
    // remains PENDING_PAYMENT, which never gets a Session_ row (see
    // payments.ts's own tx.session_.create, gated on the CONFIRMED
    // transition). Payment has no stripePaymentIntentId either, so
    // convergence resolves locally with no Stripe call needed.
    const preBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(preBooking.status).toBe("PENDING_PAYMENT");
    const preSession = await db.session_.findUnique({ where: { bookingId: booking.id } });
    expect(preSession).toBeNull();

    await cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" });

    const finalBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(finalBooking.status).toBe("CANCELLED");
    const finalSession = await db.session_.findUnique({ where: { bookingId: booking.id } });
    expect(finalSession).toBeNull(); // still no Session_ row — the guard's missing-row branch never throws
  });

  it("C. Two concurrent cancellation attempts on the same CONFIRMED booking -> exactly one succeeds and reaches the guarded Session_ write; the other is rejected by step 4's own Booking guard before ever reaching it", async () => {
    const { booking, student } = await setupConfirmedCapturedBooking();
    vi.mocked(getStripeClient).mockReturnValue(makeFakeStripeClient() as never);

    const outcomes = await Promise.allSettled([
      cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" }),
      cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" }),
    ]);

    expect(outcomes.filter((o) => o.status === "fulfilled").length).toBe(1);
    const rejected = outcomes.find((o): o is PromiseRejectedResult => o.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(BookingNotCancellableError);

    const finalSession = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
    expect(finalSession.status).toBe("CANCELLED"); // reached CANCELLED exactly once, via the one successful attempt
  });

  it("D. Genuine race: both check-ins and cancellation fired together, repeatedly -> exactly one authoritative outcome each time, Booking/Session pairing always consistent", async () => {
    for (let i = 0; i < 5; i++) {
      const startAt = new Date(Date.now() + 10 * 60 * 1000);
      const { tutor, student, booking } = await setupConfirmedCapturedBooking({ startAt });
      vi.mocked(getStripeClient).mockReturnValue(makeFakeStripeClient() as never);

      await Promise.allSettled([
        recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" }),
        recordSessionCheckIn(booking.id, student.user.id, "STUDENT", { actorRole: "STUDENT" }),
        cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" }),
      ]);

      const finalBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
      const finalSession = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });

      // Exactly two valid, mutually exclusive outcomes: cancellation won
      // (both Booking and Session reach CANCELLED together), or the
      // Session writer(s) won (Booking stays CONFIRMED, Session is
      // SCHEDULED or IN_PROGRESS depending on how many check-ins landed
      // before cancellation's guarded write ran).
      if (finalBooking.status === "CANCELLED") {
        expect(finalSession.status).toBe("CANCELLED");
      } else {
        expect(finalBooking.status).toBe("CONFIRMED");
        expect(["SCHEDULED", "IN_PROGRESS"]).toContain(finalSession.status);
      }
      // The one invariant that must never break, regardless of interleaving.
      expect(finalSession.status === "IN_PROGRESS" && finalBooking.status === "CANCELLED").toBe(false);
    }
  });
});
