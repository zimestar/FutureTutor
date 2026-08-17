import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import Stripe from "stripe";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";

// Phase H.8.1 — dedicated permanent DB-integration test file for the
// refund-settlement-finality hardening patch (plan §26 Q3, resolved by the
// §0 amendment: this file is the authoritative home for cases A-M from the
// original plan PLUS N-R added by the amendment, plus the four §21
// concurrency cases). cancellationRefund.integration.test.ts stays focused
// on H.8's own cancellation/refund workflow regression coverage.
//
// Same conventions as cancellationRefund.integration.test.ts /
// cancellationConcurrency.integration.test.ts: resolveVerifiedTestDatabase()
// FIRST against the untouched env, THEN process.env.DATABASE_URL is
// reassigned to the verified target, THEN every module that transitively
// touches the ambient @/lib/db singleton is dynamically imported. A real
// `SELECT current_database()` through that same ambient singleton is
// asserted in beforeAll before any fixture is created. @/lib/stripe is
// mocked module-wide with a small hand-built fake Stripe backend.
//
// NEW test-harness capability this file needs beyond the existing H.8 fake
// Stripe client (per the H.8.1 plan's own root-cause analysis, §4): the
// fake backend must be able to return a DIFFERENT status for the SAME
// Stripe Refund id across two separate retrieve() calls, simulating
// Stripe's real succeeded->failed regression (Scenario G). See
// `_setRefundStatus` / `_setRetrieveShouldThrow` below.

vi.mock("@/lib/stripe", () => ({ getStripeClient: vi.fn() }));

import { getStripeClient } from "@/lib/stripe";

let createCustomerPriceQuote: typeof import("./customerPricing").createCustomerPriceQuote;
let createTutorPayoutQuote: typeof import("./tutorPayout").createTutorPayoutQuote;
let reserveBookingPendingPayment: typeof import("./bookingCreation").reserveBookingPendingPayment;
let cancelBookingWithRefund: typeof import("./cancellationPolicy").cancelBookingWithRefund;
let convergeToCaptured: typeof import("./payments").convergeToCaptured;
let refundIdForBooking: typeof import("./payments").refundIdForBooking;
let resolveRefundOutcomeAndConverge: typeof import("./payments").resolveRefundOutcomeAndConverge;
let recoverFailedRefund: typeof import("./payments").recoverFailedRefund;
let isRefundObligationSatisfied: typeof import("./payments").isRefundObligationSatisfied;
let runTier7RecentSuccessReverify: typeof import("./tutorTransfers").runTier7RecentSuccessReverify;
let reconcileStuckPayments: typeof import("./tutorTransfers").reconcileStuckPayments;
let processStripeWebhookEvent: typeof import("./stripeWebhooks").processStripeWebhookEvent;

interface FakeStripeRefund {
  id: string;
  status: "succeeded" | "pending" | "failed" | "canceled";
  amount: number;
  payment_intent: string;
  metadata: Record<string, string>;
  failure_reason: string | null;
}

/** Same shape as the H.8 fake Stripe client (cancellationRefund.integration.
 * test.ts), plus H.8.1's new mutation capability: `_setRefundStatus` lets a
 * test flip an already-created fake Refund's status BETWEEN two calls
 * (simulating Stripe's real asynchronous succeeded->failed regression),
 * and `_setRetrieveShouldThrow` lets a test make one specific id's
 * `retrieve()` throw (for Tier-7 per-item failure isolation, case Q). */
function makeFakeStripeClient(
  opts: {
    onCreateRefund?: (params: {
      payment_intent: string;
      amount: number;
      metadata?: Record<string, string>;
    }) => FakeStripeRefund | "throw";
  } = {}
) {
  const refundsById = new Map<string, FakeStripeRefund>();
  const idempotencyStore = new Map<string, FakeStripeRefund>();
  const retrieveShouldThrow = new Set<string>();
  let nextId = 1;
  const createCalls: Array<{ idempotencyKey: string }> = [];
  const retrieveCalls: string[] = [];

  const client = {
    refunds: {
      create: vi.fn(
        async (
          params: { payment_intent: string; amount: number; metadata?: Record<string, string> },
          options: { idempotencyKey: string }
        ) => {
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
        }
      ),
      retrieve: vi.fn(async (id: string) => {
        retrieveCalls.push(id);
        if (retrieveShouldThrow.has(id)) throw new Error(`simulated Stripe retrieve failure for ${id}`);
        const r = refundsById.get(id);
        if (!r) throw new Error("no such fake refund");
        return { ...r };
      }),
      list: vi.fn((params: { payment_intent: string }) => {
        const items = Array.from(refundsById.values()).filter((r) => r.payment_intent === params.payment_intent);
        return {
          [Symbol.asyncIterator]: async function* () {
            for (const item of items) yield { ...item };
          },
        };
      }),
    },
    paymentIntents: {
      cancel: vi.fn(async (id: string) => ({ id, status: "canceled" })),
      retrieve: vi.fn(async (id: string) => ({ id, status: "canceled" })),
    },
    _refundsById: refundsById,
    _createCalls: createCalls,
    _retrieveCalls: retrieveCalls,
    _seedRefund(refund: FakeStripeRefund) {
      refundsById.set(refund.id, refund);
    },
    /** H.8.1 — mutates an already-created fake Refund's status/failure_reason
     * in place, simulating Stripe's real asynchronous status regression
     * (Scenario G: succeeded at creation, failed ~seconds later). */
    _setRefundStatus(id: string, status: FakeStripeRefund["status"], failureReason: string | null = null) {
      const existing = refundsById.get(id);
      if (!existing) throw new Error(`cannot mutate unknown fake refund ${id}`);
      refundsById.set(id, { ...existing, status, failure_reason: failureReason });
    },
    /** H.8.1 (case Q) — makes retrieve() throw for exactly this id, so a
     * Tier-7 batch containing multiple candidates can prove one throwing
     * candidate never aborts the rest. */
    _setRetrieveShouldThrow(id: string, shouldThrow: boolean) {
      if (shouldThrow) retrieveShouldThrow.add(id);
      else retrieveShouldThrow.delete(id);
    },
  };
  return client;
}

let db: PrismaClient;
let subjectId: string;
let academicLevelId: string;

const RUN_TAG = randomUUID();

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

  process.env.DATABASE_URL = target.connectionString;

  ({ createCustomerPriceQuote } = await import("./customerPricing"));
  ({ createTutorPayoutQuote } = await import("./tutorPayout"));
  ({ reserveBookingPendingPayment } = await import("./bookingCreation"));
  ({ cancelBookingWithRefund } = await import("./cancellationPolicy"));
  ({
    convergeToCaptured,
    refundIdForBooking,
    resolveRefundOutcomeAndConverge,
    recoverFailedRefund,
    isRefundObligationSatisfied,
  } = await import("./payments"));
  ({ runTier7RecentSuccessReverify, reconcileStuckPayments } = await import("./tutorTransfers"));
  ({ processStripeWebhookEvent } = await import("./stripeWebhooks"));

  const { db: ambientDb } = await import("@/lib/db");
  const [{ current_database: ambientDatabaseName }] = await ambientDb.$queryRaw<
    Array<{ current_database: string }>
  >`SELECT current_database()`;
  if (ambientDatabaseName !== target.databaseName) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton reports current_database() = "${ambientDatabaseName}", but the verified test database is "${target.databaseName}". Refusing to run any H.8.1 integration test.`
    );
  }
  const devDatabaseNameForSafetyCheckOnly = devDatabaseUrlForSafetyCheckOnly
    ? new URL(devDatabaseUrlForSafetyCheckOnly).pathname.replace(/^\//, "")
    : null;
  if (devDatabaseNameForSafetyCheckOnly && ambientDatabaseName === devDatabaseNameForSafetyCheckOnly) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton's current_database() ("${ambientDatabaseName}") equals the real development database name. Refusing to run any H.8.1 integration test.`
    );
  }

  const subject = await db.subject.create({ data: { slug: `h81-it-subject-${RUN_TAG}`, sortOrder: 999 } });
  subjectId = subject.id;
  const level = await db.academicLevel.create({ data: { slug: `h81-it-level-${RUN_TAG}`, sortOrder: 999 } });
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
  await db.stripeWebhookEvent.deleteMany({ where: { stripeEventId: { startsWith: `h81-evt-${RUN_TAG}` } } });
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
  return `h81-it-${prefix}-${randomUUID()}@futuretutor.test`;
}

async function createTutorUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("tutor"), role: "TUTOR" } });
  createdUserIds.push(user.id);
  const tutorProfile = await db.tutorProfile.create({
    data: { userId: user.id, slug: `h81-it-tutor-${randomUUID()}`, applicationStatus: "APPROVED", payoutTier: "NEW", learningMode: "BOTH" },
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

/** The primary H.8.1 fixture: a real, full-refund cancellation through the
 * genuine cancelBookingWithRefund path (so the cancellation-intent AuditLog
 * row that owedCents/refund.obligation_reopened reads from actually
 * exists), landing on Refund.status=SUCCEEDED / Payment.status=REFUNDED —
 * i.e. exactly the pre-reversal state Scenario G observed. */
async function setupSucceededFullRefund(overrides: { startAt?: Date } = {}) {
  const { booking, payment, student } = await setupConfirmedCapturedBooking(overrides);
  const fake = makeFakeStripeClient();
  vi.mocked(getStripeClient).mockReturnValue(fake as never);
  await cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" });
  const refund = await db.refund.findUniqueOrThrow({ where: { id: refundIdForBooking(booking.id) } });
  const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
  return { booking, payment: finalPayment, refund, fake, student };
}

/** Same, but the PARTIAL_REFUND tier (exactly 24h before startAt). */
async function setupSucceededPartialRefund() {
  const start = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const { booking, payment, student } = await setupConfirmedCapturedBooking({ startAt: start });
  const fake = makeFakeStripeClient();
  vi.mocked(getStripeClient).mockReturnValue(fake as never);
  const exactBoundary = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  await cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT", clock: () => exactBoundary });
  const refund = await db.refund.findUniqueOrThrow({ where: { id: refundIdForBooking(booking.id) } });
  const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
  return { booking, payment: finalPayment, refund, fake, student };
}

function refundFailedWebhookEvent(stripeRefund: FakeStripeRefund, tag: string) {
  return {
    id: `h81-evt-${RUN_TAG}-${tag}-${randomUUID()}`,
    type: "refund.failed",
    data: { object: stripeRefund },
  } as unknown as import("stripe").default.Event;
}

// ===========================================================================
// A-M — original H.8.1 plan cases (§20)
// ===========================================================================
describe("H.8.1 A-M — SUCCEEDED->FAILED reversal core mechanics", () => {
  it("A. full refund: succeeds then reverses via direct call -> ledger/status/audit/notification all correct", async () => {
    const { payment, refund, fake } = await setupSucceededFullRefund();
    expect(refund.status).toBe("SUCCEEDED");
    expect(payment.status).toBe("REFUNDED");
    expect(payment.refundedAmountCents).toBe(payment.amountCents);
    const initiatedNotification = await db.notification.findFirst({
      where: { userId: payment.payerUserId, type: "payment.refund_initiated" },
    });
    expect(initiatedNotification).not.toBeNull();

    fake._setRefundStatus(refund.stripeRefundId!, "failed", "expired_or_canceled_card");
    const outcome = await resolveRefundOutcomeAndConverge(refund.id, { observedStripeRefundId: refund.stripeRefundId! });
    expect(outcome).toBe("failed");

    const finalRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(finalRefund.status).toBe("FAILED");
    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.refundedAmountCents).toBe(0);
    expect(finalPayment.status).toBe("CAPTURED");
    expect(isRefundObligationSatisfied(payment.amountCents, finalPayment)).toBe(false);

    const succeededThenFailed = await db.auditLog.findFirst({
      where: { entityType: "Refund", entityId: refund.id, action: "refund.succeeded_then_failed" },
    });
    expect(succeededThenFailed).not.toBeNull();
    const meta = succeededThenFailed!.metadata as Record<string, unknown>;
    expect(meta.previousRefundedAmountCents).toBe(payment.amountCents);
    expect(meta.newRefundedAmountCents).toBe(0);

    const obligationReopened = await db.auditLog.findFirst({
      where: { entityType: "Refund", entityId: refund.id, action: "refund.obligation_reopened" },
    });
    expect(obligationReopened).not.toBeNull();

    const problemNotifications = await db.notification.findMany({
      where: { userId: payment.payerUserId, type: "payment.refund_problem" },
    });
    expect(problemNotifications).toHaveLength(1);
  });

  it("B. partial refund: same reversal mechanics, amount/status track the partial tier", async () => {
    const { payment, refund, fake } = await setupSucceededPartialRefund();
    expect(payment.status).toBe("PARTIALLY_REFUNDED");
    const partialAmount = payment.refundedAmountCents;
    expect(partialAmount).toBeGreaterThan(0);
    expect(partialAmount).toBeLessThan(payment.amountCents);

    fake._setRefundStatus(refund.stripeRefundId!, "failed", "expired_or_canceled_card");
    await resolveRefundOutcomeAndConverge(refund.id, { observedStripeRefundId: refund.stripeRefundId! });

    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.refundedAmountCents).toBe(0);
    expect(finalPayment.status).toBe("CAPTURED");
    expect(isRefundObligationSatisfied(partialAmount, finalPayment)).toBe(false);
  });

  it("C. late refund.failed webhook for the CURRENT attempt, delivered via processStripeWebhookEvent end-to-end", async () => {
    const { payment, refund, fake } = await setupSucceededFullRefund();
    fake._setRefundStatus(refund.stripeRefundId!, "failed", "expired_or_canceled_card");
    const stripeRefund = fake._refundsById.get(refund.stripeRefundId!)!;
    // The real webhook handler reads event.data.object.metadata.refundId —
    // stamp it exactly as resolveRefundOutcomeAndConverge's own create()
    // call would have (mirroring the real Stripe metadata shape).
    stripeRefund.metadata = { ...stripeRefund.metadata, refundId: refund.id };

    await processStripeWebhookEvent(refundFailedWebhookEvent(stripeRefund, "C"));

    const finalRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(finalRefund.status).toBe("FAILED");
    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.refundedAmountCents).toBe(0);
    expect(finalPayment.status).toBe("CAPTURED");
  });

  it("D. late refund.failed webhook naming a SUPERSEDED/historical attempt (R1) after R2 succeeded -> fully inert (34M regression guard)", async () => {
    const { payment, refund, fake } = await setupSucceededFullRefund();
    const r1Id = refund.stripeRefundId!;
    // Force R1 to fail synchronously (ordinary PENDING->FAILED path would
    // require a fresh PENDING refund, so instead simulate directly: mark
    // R1 FAILED via the reversal path, then recover to R2.
    fake._setRefundStatus(r1Id, "failed", "generic_decline");
    await resolveRefundOutcomeAndConverge(refund.id, { observedStripeRefundId: r1Id });
    let current = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(current.status).toBe("FAILED");

    // Recovery -> R2 succeeds.
    fake.refunds.create.mockImplementationOnce(async (params: { payment_intent: string; amount: number; metadata?: Record<string, string> }) => {
      const r2 = { id: "re_R2_caseD", status: "succeeded" as const, amount: params.amount, payment_intent: params.payment_intent, metadata: params.metadata ?? {}, failure_reason: null };
      fake._refundsById.set(r2.id, r2);
      return r2;
    });
    await recoverFailedRefund(refund.id);
    current = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(current.status).toBe("SUCCEEDED");
    expect(current.stripeRefundId).toBe("re_R2_caseD");

    // Late refund.failed webhook naming R1 (superseded/historical) arrives.
    const stripeR1 = { id: r1Id, status: "failed" as const, amount: payment.amountCents, payment_intent: payment.stripePaymentIntentId!, metadata: { refundId: refund.id }, failure_reason: "generic_decline" };
    await processStripeWebhookEvent(refundFailedWebhookEvent(stripeR1, "D"));

    const finalRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(finalRefund.status).toBe("SUCCEEDED"); // untouched
    expect(finalRefund.stripeRefundId).toBe("re_R2_caseD"); // untouched
    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.refundedAmountCents).toBe(payment.amountCents); // untouched
  });

  it("E. identical refund.failed event delivered twice (Stripe redelivery) -> decremented/audited/notified exactly once", async () => {
    const { payment, refund, fake } = await setupSucceededFullRefund();
    fake._setRefundStatus(refund.stripeRefundId!, "failed", "expired_or_canceled_card");
    const stripeRefund = fake._refundsById.get(refund.stripeRefundId!)!;
    stripeRefund.metadata = { ...stripeRefund.metadata, refundId: refund.id };
    const event = refundFailedWebhookEvent(stripeRefund, "E");

    await processStripeWebhookEvent(event);
    await processStripeWebhookEvent(event); // exact same event.id -> StripeWebhookEvent idempotency short-circuits before business logic even re-runs

    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.refundedAmountCents).toBe(0);
    const succeededThenFailedRows = await db.auditLog.findMany({
      where: { entityType: "Refund", entityId: refund.id, action: "refund.succeeded_then_failed" },
    });
    expect(succeededThenFailedRows).toHaveLength(1);
    const problemNotifications = await db.notification.findMany({
      where: { userId: payment.payerUserId, type: "payment.refund_problem" },
    });
    expect(problemNotifications).toHaveLength(1);
  });

  it("F. no webhook at all — Tier 7 alone discovers and reverses the failure", async () => {
    const { payment, refund, fake } = await setupSucceededFullRefund();
    fake._setRefundStatus(refund.stripeRefundId!, "failed", "expired_or_canceled_card");

    await runTier7RecentSuccessReverify();

    const finalRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(finalRefund.status).toBe("FAILED");
    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.refundedAmountCents).toBe(0);
    expect(finalPayment.status).toBe("CAPTURED");
  });

  it("G. race: webhook path and a direct Tier-7-style call both discover the same failure concurrently -> exactly one committed reversal", async () => {
    const { payment, refund, fake } = await setupSucceededFullRefund();
    fake._setRefundStatus(refund.stripeRefundId!, "failed", "expired_or_canceled_card");
    const stripeRefund = fake._refundsById.get(refund.stripeRefundId!)!;
    stripeRefund.metadata = { ...stripeRefund.metadata, refundId: refund.id };

    await Promise.all([
      processStripeWebhookEvent(refundFailedWebhookEvent(stripeRefund, "G")),
      resolveRefundOutcomeAndConverge(refund.id, { observedStripeRefundId: refund.stripeRefundId! }),
    ]);

    const finalRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(finalRefund.status).toBe("FAILED");
    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.refundedAmountCents).toBe(0);
    const succeededThenFailedRows = await db.auditLog.findMany({
      where: { entityType: "Refund", entityId: refund.id, action: "refund.succeeded_then_failed" },
    });
    expect(succeededThenFailedRows).toHaveLength(1);
    const problemNotifications = await db.notification.findMany({
      where: { userId: payment.payerUserId, type: "payment.refund_problem" },
    });
    expect(problemNotifications).toHaveLength(1);
  });

  it("H. recoverFailedRefund is unmodified and remains available/functional after a reversal", async () => {
    const { payment, refund, fake } = await setupSucceededFullRefund();
    fake._setRefundStatus(refund.stripeRefundId!, "failed", "expired_or_canceled_card");
    await resolveRefundOutcomeAndConverge(refund.id, { observedStripeRefundId: refund.stripeRefundId! });

    fake.refunds.create.mockImplementationOnce(async (params: { payment_intent: string; amount: number; metadata?: Record<string, string> }) => {
      const r2 = { id: "re_R2_caseH", status: "succeeded" as const, amount: params.amount, payment_intent: params.payment_intent, metadata: params.metadata ?? {}, failure_reason: null };
      fake._refundsById.set(r2.id, r2);
      return r2;
    });
    const outcome = await recoverFailedRefund(refund.id);
    expect(outcome).toBe("succeeded");

    const finalRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(finalRefund.status).toBe("SUCCEEDED");
    expect(finalRefund.stripeRefundId).toBe("re_R2_caseH");
    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.refundedAmountCents).toBe(payment.amountCents); // never more
    expect(finalPayment.status).toBe("REFUNDED");
  });

  it("I. chain R1 succeeds->fails, R2 succeeds->fails, R3 succeeds -> refundedAmountCents exact, never double-counted", async () => {
    const { payment, refund, fake } = await setupSucceededFullRefund();
    const r1Id = refund.stripeRefundId!;
    fake._setRefundStatus(r1Id, "failed", "expired_or_canceled_card");
    await resolveRefundOutcomeAndConverge(refund.id, { observedStripeRefundId: r1Id });

    fake.refunds.create.mockImplementationOnce(async (params: { payment_intent: string; amount: number; metadata?: Record<string, string> }) => {
      const r2 = { id: "re_R2_caseI", status: "succeeded" as const, amount: params.amount, payment_intent: params.payment_intent, metadata: params.metadata ?? {}, failure_reason: null };
      fake._refundsById.set(r2.id, r2);
      return r2;
    });
    await recoverFailedRefund(refund.id);
    fake._setRefundStatus("re_R2_caseI", "failed", "expired_or_canceled_card");
    await resolveRefundOutcomeAndConverge(refund.id, { observedStripeRefundId: "re_R2_caseI" });

    fake.refunds.create.mockImplementationOnce(async (params: { payment_intent: string; amount: number; metadata?: Record<string, string> }) => {
      const r3 = { id: "re_R3_caseI", status: "succeeded" as const, amount: params.amount, payment_intent: params.payment_intent, metadata: params.metadata ?? {}, failure_reason: null };
      fake._refundsById.set(r3.id, r3);
      return r3;
    });
    const finalOutcome = await recoverFailedRefund(refund.id);
    expect(finalOutcome).toBe("succeeded");

    const failedRequiresRecoveryRows = await db.auditLog.findMany({
      where: { entityType: "Refund", entityId: refund.id, action: "refund.failed_requires_recovery" },
    });
    expect(failedRequiresRecoveryRows).toHaveLength(2);
    const failedIds = failedRequiresRecoveryRows.map((r) => (r.metadata as Record<string, unknown>).failedStripeRefundId);
    expect(new Set(failedIds)).toEqual(new Set([r1Id, "re_R2_caseI"]));

    const finalRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(finalRefund.stripeRefundId).toBe("re_R3_caseI");
    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.refundedAmountCents).toBe(payment.amountCents); // exact, never double-counted
    expect(finalPayment.status).toBe("REFUNDED");
  });

  it("J. failureReason propagates identically into BOTH refund.succeeded_then_failed and refund.failed_requires_recovery", async () => {
    const { refund, fake } = await setupSucceededFullRefund();
    fake._setRefundStatus(refund.stripeRefundId!, "failed", "expired_or_canceled_card");
    await resolveRefundOutcomeAndConverge(refund.id, { observedStripeRefundId: refund.stripeRefundId! });

    const succeededThenFailed = await db.auditLog.findFirst({
      where: { entityType: "Refund", entityId: refund.id, action: "refund.succeeded_then_failed" },
    });
    const requiresRecovery = await db.auditLog.findFirst({
      where: { entityType: "Refund", entityId: refund.id, action: "refund.failed_requires_recovery" },
    });
    expect((succeededThenFailed!.metadata as Record<string, unknown>).failureReason).toBe("expired_or_canceled_card");
    expect((requiresRecovery!.metadata as Record<string, unknown>).failureReason).toBe("expired_or_canceled_card");
  });

  it("K. ordinary success path idempotent replay -> exactly one payment.refund_initiated notification", async () => {
    const { payment } = await setupSucceededFullRefund();
    const notifications = await db.notification.findMany({
      where: { userId: payment.payerUserId, type: "payment.refund_initiated" },
    });
    expect(notifications).toHaveLength(1);
  });

  it("L. reversal-triggering path called a second time after the reversal already committed -> no second notification", async () => {
    const { payment, refund, fake } = await setupSucceededFullRefund();
    fake._setRefundStatus(refund.stripeRefundId!, "failed", "expired_or_canceled_card");
    await resolveRefundOutcomeAndConverge(refund.id, { observedStripeRefundId: refund.stripeRefundId! });
    // Second call — refund.stripeRefundId is unchanged (still names the
    // now-FAILED id), Stripe still says failed.
    await resolveRefundOutcomeAndConverge(refund.id); // FAILED short-circuits unconditionally — no Stripe call, no writes

    const problemNotifications = await db.notification.findMany({
      where: { userId: payment.payerUserId, type: "payment.refund_problem" },
    });
    expect(problemNotifications).toHaveLength(1);
  });

  it("M. late refund.failed webhook for a long-historical attempt (R1) after R3 succeeded -> fully inert", async () => {
    const { payment, refund, fake } = await setupSucceededFullRefund();
    const r1Id = refund.stripeRefundId!;
    fake._setRefundStatus(r1Id, "failed", "expired_or_canceled_card");
    await resolveRefundOutcomeAndConverge(refund.id, { observedStripeRefundId: r1Id });

    fake.refunds.create.mockImplementationOnce(async (params: { payment_intent: string; amount: number; metadata?: Record<string, string> }) => {
      const r2 = { id: "re_R2_caseM", status: "succeeded" as const, amount: params.amount, payment_intent: params.payment_intent, metadata: params.metadata ?? {}, failure_reason: null };
      fake._refundsById.set(r2.id, r2);
      return r2;
    });
    await recoverFailedRefund(refund.id);
    fake._setRefundStatus("re_R2_caseM", "failed", "expired_or_canceled_card");
    await resolveRefundOutcomeAndConverge(refund.id, { observedStripeRefundId: "re_R2_caseM" });

    fake.refunds.create.mockImplementationOnce(async (params: { payment_intent: string; amount: number; metadata?: Record<string, string> }) => {
      const r3 = { id: "re_R3_caseM", status: "succeeded" as const, amount: params.amount, payment_intent: params.payment_intent, metadata: params.metadata ?? {}, failure_reason: null };
      fake._refundsById.set(r3.id, r3);
      return r3;
    });
    await recoverFailedRefund(refund.id);

    const stripeR1 = { id: r1Id, status: "failed" as const, amount: payment.amountCents, payment_intent: payment.stripePaymentIntentId!, metadata: { refundId: refund.id }, failure_reason: "expired_or_canceled_card" };
    await processStripeWebhookEvent(refundFailedWebhookEvent(stripeR1, "M"));

    const finalRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(finalRefund.status).toBe("SUCCEEDED");
    expect(finalRefund.stripeRefundId).toBe("re_R3_caseM");
    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.refundedAmountCents).toBe(payment.amountCents);
  });
});

// ===========================================================================
// H.8.2 A-H — recovery-create rejection dead-end fix (final recovery gate).
// R1 FAILED -> recoverFailedRefund -> local PENDING -> Stripe rejects the R2
// CREATE itself. Before this fix, ANY create() rejection (definitive or
// ambiguous) left the Refund silently PENDING/stripeRefundId=null forever:
// Tier 4's own resolveRefundOutcomeAndConverge call returns "pending" as a
// true no-op (accountedIds.size > 0 blocks it from ever creating), and
// Tier 6 only ever queries status: "FAILED" — a PENDING row is invisible to
// it. classifyStripeRefundCreateFailure + the corrected catch block in
// recoverFailedRefund reconverge a DEFINITIVE rejection back to FAILED
// (stripeRefundId left null — no object was ever created), which Tier 6's
// EXISTING query then picks up with zero changes to that tier.
// ===========================================================================
describe("H.8.2 A-H — recovery-create rejection (definitive vs ambiguous), dead-end closure", () => {
  /** Drives a fixture to "R1 FAILED, recovery lineage recorded" — the exact
   * precondition recoverFailedRefund needs to reach its own R2 create call. */
  async function setupFailedR1() {
    const { payment, refund, fake, booking } = await setupSucceededFullRefund();
    const r1Id = refund.stripeRefundId!;
    fake._setRefundStatus(r1Id, "failed", "expired_or_canceled_card");
    await resolveRefundOutcomeAndConverge(refund.id, { observedStripeRefundId: r1Id });
    const failedRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(failedRefund.status).toBe("FAILED");
    return { payment, refund, fake, booking, r1Id };
  }

  it("A. R1 FAILED -> recoverFailedRefund -> R2 create DEFINITIVELY rejected -> reconverges to FAILED, never an invisible PENDING dead-end", async () => {
    const { payment, refund, fake, r1Id } = await setupFailedR1();

    fake.refunds.create.mockImplementationOnce(async () => {
      throw new Stripe.errors.StripeInvalidRequestError({
        message: "A previous attempt to refund charge ch_test to card card_test failed",
        type: "invalid_request_error",
        statusCode: 400,
        code: "charge_already_refunded",
        requestId: "req_test_caseA",
      });
    });

    const outcome = await recoverFailedRefund(refund.id);
    expect(outcome).toBe("failed");

    const finalRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(finalRefund.status).toBe("FAILED"); // NOT stranded in PENDING
    expect(finalRefund.stripeRefundId).toBeNull(); // no fabricated Stripe id — no R2 object was ever created

    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.refundedAmountCents).toBe(0); // unchanged
    expect(finalPayment.status).toBe("CAPTURED");
    expect(isRefundObligationSatisfied(payment.amountCents, finalPayment)).toBe(false); // still outstanding

    const rejectedAudit = await db.auditLog.findFirst({
      where: { entityType: "Refund", entityId: refund.id, action: "refund.recovery_create_rejected" },
    });
    expect(rejectedAudit).not.toBeNull();
    const meta = rejectedAudit!.metadata as Record<string, unknown>;
    expect(meta.previousFailedStripeRefundId).toBe(r1Id);
    expect(meta.owedCents).toBe(payment.amountCents);
    expect(meta.refundedAmountCents).toBe(0);
    expect(meta.stripeErrorType).toBe("invalid_request_error");
    expect(meta.stripeErrorCode).toBe("charge_already_refunded");
    expect(meta.stripeRequestId).toBe("req_test_caseA");
    // Never a raw error payload or any card/bank identifier persisted.
    expect(JSON.stringify(meta)).not.toContain("card_test");

    // The original R1 failure audit and the recovery-attempt-started audit
    // both remain — historical lineage is never deleted or overwritten.
    const requiresRecovery = await db.auditLog.findFirst({
      where: { entityType: "Refund", entityId: refund.id, action: "refund.failed_requires_recovery" },
    });
    expect((requiresRecovery!.metadata as Record<string, unknown>).failedStripeRefundId).toBe(r1Id);
  });

  it("B. the reconverged FAILED state is surfaced by Tier 6's EXISTING obligation-outstanding query, unmodified", async () => {
    const { payment, refund, fake } = await setupFailedR1();
    fake.refunds.create.mockImplementationOnce(async () => {
      throw new Stripe.errors.StripeInvalidRequestError({
        message: "A previous attempt to refund charge ch_test to card card_test failed",
        type: "invalid_request_error",
        statusCode: 400,
        code: "charge_already_refunded",
      });
    });
    await recoverFailedRefund(refund.id);

    fake.refunds.create.mockClear();
    await reconcileStuckPayments();

    const obligationRow = await db.auditLog.findFirst({
      where: { entityType: "Refund", entityId: refund.id, action: "refund.obligation_outstanding" },
    });
    expect(obligationRow).not.toBeNull();
    const meta = obligationRow!.metadata as Record<string, unknown>;
    expect(meta.owedCents).toBe(payment.amountCents);
    expect(meta.refundedCents).toBe(0);
    // Tier 6's own doc comment: visibility only, never an automatic retry.
    expect(fake.refunds.create).not.toHaveBeenCalled();
  });

  it("C. definitive rejection does NOT trigger an automatic infinite retry loop against the same card", async () => {
    const { refund, fake } = await setupFailedR1();
    fake.refunds.create.mockImplementationOnce(async () => {
      throw new Stripe.errors.StripeInvalidRequestError({
        message: "A previous attempt to refund charge ch_test to card card_test failed",
        type: "invalid_request_error",
        statusCode: 400,
        code: "charge_already_refunded",
      });
    });
    await recoverFailedRefund(refund.id);

    fake.refunds.create.mockClear();
    // Multiple sweep passes and multiple ordinary-path calls — none of
    // them may automatically re-attempt a Stripe create against a card
    // Stripe has already definitively rejected. Only an EXPLICIT, separate
    // recoverFailedRefund invocation (case G) may start a new attempt.
    await reconcileStuckPayments();
    await reconcileStuckPayments();
    await resolveRefundOutcomeAndConverge(refund.id);
    await resolveRefundOutcomeAndConverge(refund.id);
    expect(fake.refunds.create).not.toHaveBeenCalled();

    const finalRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(finalRefund.status).toBe("FAILED"); // never silently flipped back to PENDING by the sweep
  });

  it("D. AMBIGUOUS R2 create outcome (connection error) -> Refund remains PENDING/recoverable, never assumed empty", async () => {
    const { refund, fake } = await setupFailedR1();

    fake.refunds.create.mockImplementationOnce(async () => {
      throw new Stripe.errors.StripeConnectionError({ message: "connect ETIMEDOUT" });
    });

    const outcome = await recoverFailedRefund(refund.id);
    expect(outcome).toBe("uncertain");

    const midRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(midRefund.status).toBe("PENDING"); // NOT reconverged to FAILED on an ambiguous outcome
    expect(midRefund.stripeRefundId).toBeNull();

    // No refund.recovery_create_rejected written for an ambiguous outcome —
    // that audit action is reserved for a proven-definitive rejection.
    const rejectedAudit = await db.auditLog.findFirst({
      where: { entityType: "Refund", entityId: refund.id, action: "refund.recovery_create_rejected" },
    });
    expect(rejectedAudit).toBeNull();
  });

  it("F. Stripe actually created R2 despite the ambiguous response -> a later call discovers and adopts it, no R3 duplicate create", async () => {
    const { payment, refund, fake } = await setupFailedR1();

    fake.refunds.create.mockImplementationOnce(async () => {
      throw new Stripe.errors.StripeConnectionError({ message: "connect ETIMEDOUT" });
    });
    const ambiguousOutcome = await recoverFailedRefund(refund.id);
    expect(ambiguousOutcome).toBe("uncertain");

    // Simulate Stripe having genuinely created R2 server-side even though
    // the application never received the confirming response.
    fake._seedRefund({
      id: "re_R2_caseF",
      status: "succeeded",
      amount: refund.amountCents,
      payment_intent: payment.stripePaymentIntentId!,
      metadata: { refundId: refund.id },
      failure_reason: null,
    });

    fake.refunds.create.mockClear();
    const outcome = await recoverFailedRefund(refund.id);
    expect(outcome).toBe("succeeded");
    expect(fake.refunds.create).not.toHaveBeenCalled(); // adopted via discovery, never re-created

    const finalRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(finalRefund.stripeRefundId).toBe("re_R2_caseF");
    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.refundedAmountCents).toBe(payment.amountCents);
    expect(finalPayment.status).toBe("REFUNDED");
  });

  it("E. crash/restart between recovery_attempt_started and the Stripe create call -> a resumed recoverFailedRefund call still completes safely", async () => {
    const { payment, refund, fake, r1Id } = await setupFailedR1();

    // Simulate exactly what recoverFailedRefund's own FAILED->PENDING
    // transaction would have committed, then a process crash BEFORE the
    // Stripe create call ever ran — no in-memory state survives.
    await db.refund.update({ where: { id: refund.id }, data: { status: "PENDING", stripeRefundId: null } });
    await db.auditLog.create({
      data: {
        actorUserId: null,
        action: "refund.recovery_attempt_started",
        entityType: "Refund",
        entityId: refund.id,
        metadata: { previousFailedStripeRefundId: r1Id, bookingId: refund.bookingId },
      },
    });

    fake.refunds.create.mockImplementationOnce(
      async (params: { payment_intent: string; amount: number; metadata?: Record<string, string> }) => {
        const r2 = { id: "re_R2_caseE", status: "succeeded" as const, amount: params.amount, payment_intent: params.payment_intent, metadata: params.metadata ?? {}, failure_reason: null };
        fake._refundsById.set(r2.id, r2);
        return r2;
      }
    );

    const outcome = await recoverFailedRefund(refund.id);
    expect(outcome).toBe("succeeded");
    const finalRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(finalRefund.stripeRefundId).toBe("re_R2_caseE");
    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.refundedAmountCents).toBe(payment.amountCents);
  });

  it("G. definitive R2 rejection followed by an explicit later controlled recovery -> new lineage starts safely, R1 history + rejected-R2-create audit both preserved", async () => {
    const { payment, refund, fake, r1Id } = await setupFailedR1();
    fake.refunds.create.mockImplementationOnce(async () => {
      throw new Stripe.errors.StripeInvalidRequestError({
        message: "A previous attempt to refund charge ch_test to card card_test failed",
        type: "invalid_request_error",
        statusCode: 400,
        code: "charge_already_refunded",
      });
    });
    await recoverFailedRefund(refund.id);
    const midRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(midRefund.status).toBe("FAILED");
    expect(midRefund.stripeRefundId).toBeNull();

    // An explicit, separate, human-triggered recovery attempt (e.g. after
    // arranging an alternative refund method) — this time Stripe accepts.
    fake.refunds.create.mockImplementationOnce(
      async (params: { payment_intent: string; amount: number; metadata?: Record<string, string> }) => {
        const r3 = { id: "re_R3_caseG", status: "succeeded" as const, amount: params.amount, payment_intent: params.payment_intent, metadata: params.metadata ?? {}, failure_reason: null };
        fake._refundsById.set(r3.id, r3);
        return r3;
      }
    );
    const outcome = await recoverFailedRefund(refund.id);
    expect(outcome).toBe("succeeded");

    const finalRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(finalRefund.status).toBe("SUCCEEDED");
    expect(finalRefund.stripeRefundId).toBe("re_R3_caseG");
    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.refundedAmountCents).toBe(payment.amountCents);
    expect(finalPayment.status).toBe("REFUNDED");

    // History preserved: R1's original failure, the rejected R2 create,
    // AND two distinct recovery_attempt_started rows (R1->R2, R2->R3 — the
    // second one's previousFailedStripeRefundId still correctly chains
    // back to R1, since R2 itself never had a Stripe id to chain from).
    const requiresRecoveryRows = await db.auditLog.findMany({
      where: { entityType: "Refund", entityId: refund.id, action: "refund.failed_requires_recovery" },
    });
    expect(requiresRecoveryRows).toHaveLength(1);
    expect((requiresRecoveryRows[0].metadata as Record<string, unknown>).failedStripeRefundId).toBe(r1Id);

    const rejectedAudit = await db.auditLog.findFirst({
      where: { entityType: "Refund", entityId: refund.id, action: "refund.recovery_create_rejected" },
    });
    expect(rejectedAudit).not.toBeNull();

    const recoveryStartedRows = await db.auditLog.findMany({
      where: { entityType: "Refund", entityId: refund.id, action: "refund.recovery_attempt_started" },
      orderBy: { createdAt: "asc" },
    });
    expect(recoveryStartedRows).toHaveLength(2);
    for (const row of recoveryStartedRows) {
      expect((row.metadata as Record<string, unknown>).previousFailedStripeRefundId).toBe(r1Id);
    }
  });

  it("H. obligation detection (owedCents > refundedAmountCents) never disappears merely because status is transiently PENDING", async () => {
    const { payment, refund, fake } = await setupFailedR1();

    // Mid-recovery: PENDING, no stripeRefundId, ambiguous outcome pending.
    fake.refunds.create.mockImplementationOnce(async () => {
      throw new Stripe.errors.StripeConnectionError({ message: "connect ETIMEDOUT" });
    });
    await recoverFailedRefund(refund.id);
    const pendingRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(pendingRefund.status).toBe("PENDING");
    let currentPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(isRefundObligationSatisfied(payment.amountCents, currentPayment)).toBe(false);

    // Definitive rejection on the next attempt: FAILED.
    fake.refunds.create.mockImplementationOnce(async () => {
      throw new Stripe.errors.StripeInvalidRequestError({
        message: "A previous attempt to refund charge ch_test to card card_test failed",
        type: "invalid_request_error",
        statusCode: 400,
        code: "charge_already_refunded",
      });
    });
    await recoverFailedRefund(refund.id);
    currentPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(isRefundObligationSatisfied(payment.amountCents, currentPayment)).toBe(false);
    expect(currentPayment.refundedAmountCents).toBe(0);
    expect(currentPayment.status).toBe("CAPTURED"); // never REFUNDED/PARTIALLY_REFUNDED while owed > refunded
  });
});

// ===========================================================================
// N-R — added by the H.8.1 §0 amendment (Tier-7 pagination/window/isolation)
// ===========================================================================
describe("H.8.1 N-R — Tier-7 pagination, starvation, no-op-write, isolation, window", () => {
  async function setupNSucceededFullRefunds(n: number) {
    const fixtures: Array<{ payment: { id: string; payerUserId: string; amountCents: number }; refund: { id: string; stripeRefundId: string | null } }> = [];
    const fake = makeFakeStripeClient();
    vi.mocked(getStripeClient).mockReturnValue(fake as never);
    for (let i = 0; i < n; i++) {
      const { booking, payment, student } = await setupConfirmedCapturedBooking();
      await cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" });
      const refund = await db.refund.findUniqueOrThrow({ where: { id: refundIdForBooking(booking.id) } });
      const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
      fixtures.push({ payment: finalPayment, refund });
    }
    return { fixtures, fake };
  }

  it("N. exhaustive pagination: 5 eligible refunds, batchSize=2 (3 pages) -> ALL 5 reversed, not just the first 2", async () => {
    const { fixtures, fake } = await setupNSucceededFullRefunds(5);
    for (const { refund } of fixtures) {
      fake._setRefundStatus(refund.stripeRefundId!, "failed", "expired_or_canceled_card");
    }

    await runTier7RecentSuccessReverify(2);

    for (const { refund, payment } of fixtures) {
      const finalRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
      expect(finalRefund.status).toBe("FAILED");
      const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(finalPayment.refundedAmountCents).toBe(0);
    }
  });

  it("O. non-starvation: 5 eligible refunds all still SUCCEEDED (no-op verification), run twice -> updatedAt never changes, both runs traverse all 5", async () => {
    const { fixtures } = await setupNSucceededFullRefunds(5);
    const before = await db.refund.findMany({
      where: { id: { in: fixtures.map((f) => f.refund.id) } },
      select: { id: true, updatedAt: true },
    });

    await runTier7RecentSuccessReverify(2);
    await runTier7RecentSuccessReverify(2);

    const after = await db.refund.findMany({
      where: { id: { in: fixtures.map((f) => f.refund.id) } },
      select: { id: true, updatedAt: true, status: true },
    });
    const beforeById = new Map(before.map((r) => [r.id, r.updatedAt.getTime()]));
    for (const row of after) {
      expect(row.status).toBe("SUCCEEDED"); // never touched
      expect(row.updatedAt.getTime()).toBe(beforeById.get(row.id)); // byte/ms-exact no-op
    }
  });

  it("P. isolated no-artificial-updatedAt-write regression guard (single refund, still succeeded)", async () => {
    const { refund } = await setupSucceededFullRefund();
    const before = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });

    await runTier7RecentSuccessReverify();

    const after = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(after.status).toBe("SUCCEEDED");
  });

  it("Q. per-item failure isolation: one throwing candidate never aborts the rest of the batch, and is audited", async () => {
    const { fixtures, fake } = await setupNSucceededFullRefunds(3);
    const [a, b, c] = fixtures;
    fake._setRefundStatus(a.refund.stripeRefundId!, "failed", "expired_or_canceled_card");
    fake._setRetrieveShouldThrow(b.refund.stripeRefundId!, true);
    fake._setRefundStatus(c.refund.stripeRefundId!, "failed", "expired_or_canceled_card");

    await expect(runTier7RecentSuccessReverify(10)).resolves.toBeUndefined(); // never throws out of the sweep itself

    const finalA = await db.refund.findUniqueOrThrow({ where: { id: a.refund.id } });
    const finalB = await db.refund.findUniqueOrThrow({ where: { id: b.refund.id } });
    const finalC = await db.refund.findUniqueOrThrow({ where: { id: c.refund.id } });
    expect(finalA.status).toBe("FAILED");
    expect(finalB.status).toBe("SUCCEEDED"); // its own retrieve threw -> uncertain -> left untouched
    expect(finalC.status).toBe("FAILED");

    const errorRow = await db.auditLog.findFirst({
      where: { entityType: "Refund", entityId: b.refund.id, action: "refund.tier7_reverify_error" },
    });
    expect(errorRow).not.toBeNull();
    // resolveRefundOutcomeAndConverge fails SOFT on a Stripe retrieve error
    // (returns "uncertain" rather than throwing) — Tier 7 detects this via
    // the return value and records `reason`, not `error` (that key is
    // reserved for the separate thrown-exception failure class).
    expect(typeof (errorRow!.metadata as Record<string, unknown>).reason).toBe("string");
  });

  it("R(i). a refund 40 days stale (outside the 35-day window) is excluded from Tier 7 entirely", async () => {
    const { refund, fake } = await setupSucceededFullRefund();
    await db.refund.update({
      where: { id: refund.id },
      data: { updatedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) },
    });
    fake._setRefundStatus(refund.stripeRefundId!, "failed", "expired_or_canceled_card");

    await runTier7RecentSuccessReverify();

    expect(fake._retrieveCalls).not.toContain(refund.stripeRefundId);
    const unchanged = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(unchanged.status).toBe("SUCCEEDED");
  });

  it("R(ii). the SAME 40-days-stale refund still correctly reverses via a real refund.failed webhook — the window never gates webhooks", async () => {
    const { payment, refund, fake } = await setupSucceededFullRefund();
    await db.refund.update({
      where: { id: refund.id },
      data: { updatedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) },
    });
    fake._setRefundStatus(refund.stripeRefundId!, "failed", "expired_or_canceled_card");
    const stripeRefund = fake._refundsById.get(refund.stripeRefundId!)!;
    stripeRefund.metadata = { ...stripeRefund.metadata, refundId: refund.id };

    await processStripeWebhookEvent(refundFailedWebhookEvent(stripeRefund, "Rii"));

    const finalRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(finalRefund.status).toBe("FAILED");
    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.refundedAmountCents).toBe(0);
    expect(finalPayment.status).toBe("CAPTURED");
    expect(isRefundObligationSatisfied(payment.amountCents, finalPayment)).toBe(false);
    const obligationReopened = await db.auditLog.findFirst({
      where: { entityType: "Refund", entityId: refund.id, action: "refund.obligation_reopened" },
    });
    expect(obligationReopened).not.toBeNull();
  });
});

// ===========================================================================
// Concurrency cases (§21, four cases; case 1 = §20's G above)
// ===========================================================================
describe("H.8.1 concurrency (§21)", () => {
  it("2. triple race: webhook + Tier-7-style direct call + a second redelivered webhook, all concurrent -> still exactly one committed transition", async () => {
    const { payment, refund, fake } = await setupSucceededFullRefund();
    fake._setRefundStatus(refund.stripeRefundId!, "failed", "expired_or_canceled_card");
    const stripeRefund = fake._refundsById.get(refund.stripeRefundId!)!;
    stripeRefund.metadata = { ...stripeRefund.metadata, refundId: refund.id };
    const event = refundFailedWebhookEvent(stripeRefund, "triple");

    await Promise.all([
      processStripeWebhookEvent(event),
      resolveRefundOutcomeAndConverge(refund.id, { observedStripeRefundId: refund.stripeRefundId! }),
      processStripeWebhookEvent(event), // same event.id — redelivery
    ]);

    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.refundedAmountCents).toBe(0);
    const succeededThenFailedRows = await db.auditLog.findMany({
      where: { entityType: "Refund", entityId: refund.id, action: "refund.succeeded_then_failed" },
    });
    expect(succeededThenFailedRows).toHaveLength(1);
    const problemNotifications = await db.notification.findMany({
      where: { userId: payment.payerUserId, type: "payment.refund_problem" },
    });
    expect(problemNotifications).toHaveLength(1);
  });

  it("3. reversal racing a concurrent recoverFailedRefund call -> Serializable isolation prevents a contradictory final state", async () => {
    const { payment, refund, fake } = await setupSucceededFullRefund();
    fake._setRefundStatus(refund.stripeRefundId!, "failed", "expired_or_canceled_card");
    fake.refunds.create.mockImplementation(async (params: { payment_intent: string; amount: number; metadata?: Record<string, string> }) => {
      const r2 = { id: `re_R2_case3_${randomUUID()}`, status: "succeeded" as const, amount: params.amount, payment_intent: params.payment_intent, metadata: params.metadata ?? {}, failure_reason: null };
      fake._refundsById.set(r2.id, r2);
      return r2;
    });

    await Promise.allSettled([
      resolveRefundOutcomeAndConverge(refund.id, { observedStripeRefundId: refund.stripeRefundId! }),
      recoverFailedRefund(refund.id),
    ]);

    const finalRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    // Never a contradictory combination: SUCCEEDED must correspond to a
    // refundedAmountCents that equals the payment amount; FAILED/PENDING
    // must correspond to 0. Never negative, never over-cap.
    expect(finalPayment.refundedAmountCents).toBeGreaterThanOrEqual(0);
    expect(finalPayment.refundedAmountCents).toBeLessThanOrEqual(payment.amountCents);
    if (finalRefund.status === "SUCCEEDED") {
      expect(finalPayment.refundedAmountCents).toBe(payment.amountCents);
      expect(finalPayment.status).toBe("REFUNDED");
    } else {
      expect(finalPayment.refundedAmountCents).toBe(0);
      expect(finalPayment.status).toBe("CAPTURED");
    }
  });

  it("4. Tier 7 running twice concurrently over a multi-page eligible set -> idempotent, no duplicate side effects", async () => {
    const fixtures: Array<{ payment: { id: string; payerUserId: string; amountCents: number }; refund: { id: string; stripeRefundId: string | null } }> = [];
    const fake = makeFakeStripeClient();
    vi.mocked(getStripeClient).mockReturnValue(fake as never);
    for (let i = 0; i < 5; i++) {
      const { booking, payment, student } = await setupConfirmedCapturedBooking();
      await cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" });
      const refund = await db.refund.findUniqueOrThrow({ where: { id: refundIdForBooking(booking.id) } });
      const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
      fixtures.push({ payment: finalPayment, refund });
    }
    for (const { refund } of fixtures) {
      fake._setRefundStatus(refund.stripeRefundId!, "failed", "expired_or_canceled_card");
    }

    await Promise.all([runTier7RecentSuccessReverify(2), runTier7RecentSuccessReverify(2)]);

    for (const { refund, payment } of fixtures) {
      const finalRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
      expect(finalRefund.status).toBe("FAILED");
      const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(finalPayment.refundedAmountCents).toBe(0);
      const succeededThenFailedRows = await db.auditLog.findMany({
        where: { entityType: "Refund", entityId: refund.id, action: "refund.succeeded_then_failed" },
      });
      expect(succeededThenFailedRows).toHaveLength(1); // no duplicate despite two overlapping sweeps
      const problemNotifications = await db.notification.findMany({
        where: { userId: payment.payerUserId, type: "payment.refund_problem" },
      });
      expect(problemNotifications).toHaveLength(1);
    }
  });
});
