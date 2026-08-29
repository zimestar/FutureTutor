import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";

// P0 booking hardening — permanent concurrency/regression coverage for the
// Serializable-retry wrapping added around reserveBookingPendingPayment's
// two production call sites (src/lib/actions/bookings.ts's createBookingAction
// and src/lib/actions/tutorInvitations.ts's acceptTutorInvitationAction).
//
// reserveBookingPendingPayment itself (src/services/bookingCreation.ts) is a
// "Step A" function that takes an already-open `tx` and owns no transaction
// of its own — see its own doc comment. The retry hardening therefore lives
// entirely at the two call sites, wrapping their `db.$transaction(...)` in
// `withSerializableRetry(() => db.$transaction(...))`, exactly mirroring the
// established shape already used by cancelBookingWithRefund (H.8.3) and
// convergeTutorEarningFromSession (Phase 5B).
//
// Both call sites are "use server" Server Actions entangled with auth(),
// next-intl translations, and revalidatePath — this suite follows the same
// established convention as cancellationConcurrency.integration.test.ts
// (which tests cancelBookingWithRefund, the SERVICE function containing the
// retry, not cancelBookingAction, the thin Server Action wrapper around it):
// it tests the EXACT retry-wrapping pattern added to each call site,
// reproduced faithfully below as reserveDirectBookingWithRetry (mirrors
// createBookingAction's Step A transaction verbatim) and
// claimInvitationWithRetry (mirrors acceptTutorInvitationAction's Step A
// transaction verbatim, including the atomic MATCHING -> PAYMENT_PENDING
// claim and every write inside that closure). Neither Server Action adds any
// further logic relevant to serialization-conflict retry semantics beyond
// this transaction boundary, so this is the correct, precedent-following
// test layer.
//
// Same DB-target redirection technique as cancellationConcurrency.
// integration.test.ts (see that file's own header comment for the full
// rationale): resolve and verify the test database FIRST, reassign
// process.env.DATABASE_URL to the verified target, THEN dynamically import
// every module that transitively touches @/lib/db's ambient singleton.

let createCustomerPriceQuote: typeof import("./customerPricing").createCustomerPriceQuote;
let createTutorPayoutQuote: typeof import("./tutorPayout").createTutorPayoutQuote;
let acceptTutorPayoutQuote: typeof import("./tutorPayout").acceptTutorPayoutQuote;
let reserveBookingPendingPayment: typeof import("./bookingCreation").reserveBookingPendingPayment;
let SlotTakenError: typeof import("./bookingCreation").SlotTakenError;
let isTutorEligibleForRequest: typeof import("./tutorEligibility").isTutorEligibleForRequest;
let withSerializableRetry: typeof import("@/lib/serializableRetry").withSerializableRetry;
let convergeToCaptured: typeof import("./payments").convergeToCaptured;
let writeAuditLog: typeof import("@/lib/audit").writeAuditLog;
// Module-scope handle to the ambient @/lib/db singleton — the exact
// PrismaClient instance both createBookingAction and
// acceptTutorInvitationAction themselves call .$transaction on. Used so the
// retry-injection tests below (A/B) can monkeypatch the SAME object those
// call sites' `db.$transaction(...)` resolves to, and so the helper
// functions below (which reproduce those call sites' transaction bodies)
// exercise the real, shared connection pool.
let ambientDb: typeof import("@/lib/db").db;

// Local mirrors of acceptTutorInvitationAction's own module-private error
// classes (src/lib/actions/tutorInvitations.ts) — not exported by that
// "use server" file, so redeclared here for the faithful reproduction of its
// transaction body below.
class InvitationNotPendingError extends Error {}
class InvitationExpiredError extends Error {}
class TutorNotEligibleError extends Error {}
class PaymentNotReadyError extends Error {}

let db: PrismaClient;
let subjectId: string;

const createdUserIds: string[] = [];
const createdStudentProfileIds: string[] = [];
const createdTutorProfileIds: string[] = [];
const createdCustomerQuoteIds: string[] = [];
const createdTutorPayoutQuoteIds: string[] = [];
const createdPaymentIds: string[] = [];
const createdBookingIds: string[] = [];
const createdTutorInvitationIds: string[] = [];
const createdTutoringRequestIds: string[] = [];

const FAR_FUTURE_START = new Date(Date.now() + 62 * 24 * 60 * 60 * 1000);

beforeAll(async () => {
  const target = resolveVerifiedTestDatabase();
  // 30s — matches this workstation's known environmental flakiness under
  // heavy concurrent load (multiple next dev servers + other agent
  // sessions); the default 10s hook timeout has been observed to trip on
  // DB-adapter pool warm-up alone under contention, unrelated to any code
  // defect.
  const devDatabaseUrlForSafetyCheckOnly = process.env.DATABASE_URL;
  const adapter = new PrismaPg({ connectionString: target.connectionString });
  db = new PrismaClient({ adapter });

  process.env.DATABASE_URL = target.connectionString;

  ({ createCustomerPriceQuote } = await import("./customerPricing"));
  ({ createTutorPayoutQuote, acceptTutorPayoutQuote } = await import("./tutorPayout"));
  ({ reserveBookingPendingPayment, SlotTakenError } = await import("./bookingCreation"));
  ({ isTutorEligibleForRequest } = await import("./tutorEligibility"));
  ({ withSerializableRetry } = await import("@/lib/serializableRetry"));
  ({ convergeToCaptured } = await import("./payments"));
  ({ writeAuditLog } = await import("@/lib/audit"));

  ({ db: ambientDb } = await import("@/lib/db"));
  const [{ current_database: ambientDatabaseName }] = await ambientDb.$queryRaw<
    Array<{ current_database: string }>
  >`SELECT current_database()`;
  if (ambientDatabaseName !== target.databaseName) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton reports current_database() = "${ambientDatabaseName}", but the verified test database is "${target.databaseName}". Refusing to run any booking-creation concurrency test.`
    );
  }
  const devDatabaseNameForSafetyCheckOnly = devDatabaseUrlForSafetyCheckOnly
    ? new URL(devDatabaseUrlForSafetyCheckOnly).pathname.replace(/^\//, "")
    : null;
  if (devDatabaseNameForSafetyCheckOnly && ambientDatabaseName === devDatabaseNameForSafetyCheckOnly) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton's current_database() ("${ambientDatabaseName}") equals the real development database name. Refusing to run any booking-creation concurrency test.`
    );
  }

  const subject = await db.subject.create({ data: { slug: `p0-bc-subject-${randomUUID()}`, sortOrder: 999 } });
  subjectId = subject.id;

  const existingSettings = await db.marketplacePricingSettings.findFirst();
  if (!existingSettings) await db.marketplacePricingSettings.create({ data: {} });

  await db.customerBasePriceRule.create({
    data: { subjectId, academicLevelId: null, baseDurationMinutes: 60, basePriceCents: 8000, pricingVersion: "CUSTOMER_PRICING_V1" },
  });
  await db.tutorBasePayoutRule.create({
    data: { tutorTier: "NEW", subjectId, academicLevelId: null, baseDurationMinutes: 60, payoutCents: 5000, payoutVersion: "TUTOR_PAYOUT_V1" },
  });
}, 30000);

afterAll(async () => {
  await db.tutorBasePayoutRule.deleteMany({ where: { subjectId } });
  await db.customerBasePriceRule.deleteMany({ where: { subjectId } });
  await db.subject.delete({ where: { id: subjectId } });
  await db?.$disconnect();
});

afterEach(async () => {
  if (createdTutorInvitationIds.length > 0) {
    await db.auditLog.deleteMany({ where: { entityId: { in: createdTutorInvitationIds } } });
    await db.tutorInvitation.deleteMany({ where: { id: { in: createdTutorInvitationIds } } });
    createdTutorInvitationIds.length = 0;
  }
  if (createdBookingIds.length > 0) {
    await db.auditLog.deleteMany({ where: { entityId: { in: createdBookingIds } } });
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
  return `p0-bc-${prefix}-${randomUUID()}@futuretutor.test`;
}

async function createTutorUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("tutor"), role: "TUTOR" } });
  createdUserIds.push(user.id);
  const tutorProfile = await db.tutorProfile.create({
    data: {
      userId: user.id,
      slug: `p0-bc-tutor-${randomUUID()}`,
      applicationStatus: "APPROVED",
      payoutTier: "NEW",
      learningMode: "BOTH",
      // FG-LEGAL2 — isTutorEligibleForRequest now also requires this.
      tutorAgreementAcceptedAt: new Date(),
      tutorAgreementAcceptedVersion: "2026-08-30",
      tutorAgreementAcceptedLocale: "en",
    },
  });
  createdTutorProfileIds.push(tutorProfile.id);
  // Quick Match eligibility (isTutorEligibleForRequest) requires a
  // TutorSubject row for the request's subject, AND (via isTutorFreeAt,
  // src/lib/availability.ts) at least one matching TutorAvailability window
  // — with none at all, isTutorFreeAt fails closed (returns false)
  // regardless of any actual booking conflict. Both cascade on tutorProfile
  // delete, so no separate tracking/cleanup array needed.
  await db.tutorSubject.create({ data: { tutorProfileId: tutorProfile.id, subjectId } });
  await db.tutorAvailability.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      tutorProfileId: tutorProfile.id,
      dayOfWeek,
      startTime: "00:00",
      endTime: "23:59",
      timezone: "UTC",
      mode: "BOTH" as const,
    })),
  });
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
    { createdByUserId: actorUserId, studentProfileId, subjectId, academicLevelId: null, tutoringMode: "ONLINE", durationMinutes: 60, requestedStartAt },
    db
  );
  createdCustomerQuoteIds.push(quote.id);
  return quote;
}

async function makePayoutQuote(tutorProfileId: string, customerQuoteId: string, requestedStartAt: Date = FAR_FUTURE_START) {
  const payoutQuote = await createTutorPayoutQuote(
    { tutorProfileId, subjectId, academicLevelId: null, tutoringMode: "ONLINE", durationMinutes: 60, requestedStartAt },
    customerQuoteId,
    db
  );
  createdTutorPayoutQuoteIds.push(payoutQuote.id);
  return payoutQuote;
}

/**
 * BETA-1 / P1-02 — creates the Payment already AUTHORIZED, matching real
 * production sequencing: src/services/payments.ts's
 * verifyAndAuthorizePaymentIntent always transitions PENDING -> AUTHORIZED
 * BEFORE createBookingAction/acceptTutorInvitationAction ever call
 * reserveBookingPendingPayment. reserveBookingPendingPayment now
 * authoritatively validates the Payment's own state (status must be
 * AUTHORIZED or CAPTURED) before consuming either quote, so a fixture
 * payment must reflect that real precondition, not the earlier PENDING
 * state that only ever existed momentarily in production before capture
 * readiness.
 */
async function makePayment(quoteId: string, payerUserId: string) {
  const quote = await db.customerPriceQuote.findUniqueOrThrow({ where: { id: quoteId } });
  const payment = await db.payment.create({
    data: {
      id: randomUUID(),
      customerPriceQuoteId: quoteId,
      payerUserId,
      amountCents: quote.totalCents,
      currency: quote.currency,
      status: "AUTHORIZED",
      authorizedAt: new Date(),
      stripePaymentIntentId: `pi_test_${randomUUID()}`,
    },
  });
  createdPaymentIds.push(payment.id);
  return payment;
}

/**
 * Faithful reproduction of createBookingAction's Step A
 * (src/lib/actions/bookings.ts) — identical shape, using the SAME ambient
 * @/lib/db singleton those call sites use, so the retry-injection tests
 * below can monkeypatch ambientDb.$transaction and observe the effect here.
 */
function reserveDirectBookingWithRetry(input: Parameters<typeof reserveBookingPendingPayment>[1]) {
  return withSerializableRetry(() =>
    ambientDb.$transaction(
      async (tx) => {
        return reserveBookingPendingPayment(tx, input);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  );
}

async function createTutoringRequestAndInvitation(params: {
  createdByUserId: string;
  studentProfileId: string;
  tutorProfileId: string;
  customerPriceQuoteId: string;
  tutorPayoutQuoteId: string;
  requestedStartAt?: Date;
}) {
  const requestedStartAt = params.requestedStartAt ?? FAR_FUTURE_START;
  const request = await db.tutoringRequest.create({
    data: {
      createdByUserId: params.createdByUserId,
      studentProfileId: params.studentProfileId,
      subjectId,
      academicLevelId: null,
      tutoringMode: "ONLINE",
      durationMinutes: 60,
      requestedStartAt,
      currency: "CAD",
      customerPriceQuoteId: params.customerPriceQuoteId,
      status: "MATCHING",
    },
  });
  createdTutoringRequestIds.push(request.id);
  const invitation = await db.tutorInvitation.create({
    data: {
      tutoringRequestId: request.id,
      tutorProfileId: params.tutorProfileId,
      tutorPayoutQuoteId: params.tutorPayoutQuoteId,
      dispatchRound: 1,
      status: "PENDING",
      rankScore: 1,
      rankBreakdown: {},
      rankingVersion: "P0_BC_TEST_V1",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  createdTutorInvitationIds.push(invitation.id);
  return { request, invitation };
}

/**
 * Faithful reproduction of acceptTutorInvitationAction's Step A
 * (src/lib/actions/tutorInvitations.ts) — the atomic MATCHING ->
 * PAYMENT_PENDING claim, acceptTutorPayoutQuote, reserveBookingPendingPayment,
 * and the invitation ACCEPTED write, all inside the SAME transaction, wrapped
 * in withSerializableRetry exactly as the real call site now is. The
 * "otherPending"-supersession branch is intentionally omitted here — no
 * fixture in this suite ever creates a second PENDING invitation for the
 * same request, so that branch is dead code for every test below and its
 * omission does not change what is being proven (the claim + reservation +
 * retry boundary is reproduced in full).
 */
function claimInvitationWithRetry(params: { tutorInvitationId: string; tutorProfileId: string; auditActorUserId: string }) {
  return withSerializableRetry(() =>
    ambientDb.$transaction(
      async (tx) => {
        const invitation = await tx.tutorInvitation.findUnique({ where: { id: params.tutorInvitationId } });
        if (!invitation || invitation.tutorProfileId !== params.tutorProfileId || invitation.status !== "PENDING") {
          throw new InvitationNotPendingError();
        }
        if (invitation.expiresAt < new Date()) throw new InvitationExpiredError();
        if (!invitation.tutorPayoutQuoteId) throw new InvitationNotPendingError();

        const request = await tx.tutoringRequest.findUnique({ where: { id: invitation.tutoringRequestId } });
        if (!request || request.status !== "MATCHING" || !request.customerPriceQuoteId) {
          throw new InvitationNotPendingError();
        }

        const stillEligible = await isTutorEligibleForRequest(tx, params.tutorProfileId, {
          subjectId: request.subjectId,
          academicLevelId: request.academicLevelId,
          tutoringMode: request.tutoringMode,
          requestedStartAt: request.requestedStartAt,
          durationMinutes: request.durationMinutes,
          city: request.city,
        });
        if (!stillEligible) throw new TutorNotEligibleError();

        const payment = await tx.payment.findUnique({ where: { customerPriceQuoteId: request.customerPriceQuoteId } });
        if (!payment) throw new PaymentNotReadyError();

        const claimResult = await tx.tutoringRequest.updateMany({
          where: { id: request.id, status: "MATCHING" },
          data: { status: "PAYMENT_PENDING" },
        });
        if (claimResult.count === 0) throw new InvitationNotPendingError();

        await acceptTutorPayoutQuote(tx, invitation.tutorPayoutQuoteId, params.tutorProfileId);

        const endAt = new Date(request.requestedStartAt.getTime() + request.durationMinutes * 60 * 1000);

        const booking = await reserveBookingPendingPayment(tx, {
          actorUserId: request.createdByUserId,
          studentProfileId: request.studentProfileId,
          tutorProfileId: params.tutorProfileId,
          subjectId: request.subjectId,
          academicLevelId: request.academicLevelId,
          startAt: request.requestedStartAt,
          endAt,
          timezone: "UTC",
          mode: request.tutoringMode,
          paymentId: payment.id,
          customerPriceQuoteId: request.customerPriceQuoteId,
          tutorPayoutQuoteId: invitation.tutorPayoutQuoteId,
          tutoringRequestId: request.id,
          location: null,
        });

        await tx.tutorInvitation.update({
          where: { id: invitation.id },
          data: { status: "ACCEPTED", respondedAt: new Date(), bookingId: booking.id },
        });

        await writeAuditLog(
          {
            actorUserId: params.auditActorUserId,
            action: "quickmatch.invitation.accepted",
            entityType: "TutorInvitation",
            entityId: invitation.id,
            metadata: { tutoringRequestId: request.id, bookingId: booking.id },
          },
          tx
        );

        return { bookingId: booking.id, paymentId: payment.id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  );
}

/**
 * Thin call-counting wrapper around the REAL ambientDb.$transaction — see
 * cancellationConcurrency.integration.test.ts's identical helper for the
 * full rationale. Every call passes straight through to the original
 * implementation unless a test has itself swapped ambientDb.$transaction out
 * for a rejecting stub (tests A/B below); this wrapper only counts
 * invocations, proving whether withSerializableRetry actually re-invoked the
 * transaction callback.
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
 * surface a genuine Serializable write-conflict. */
function makeP2034Error(): InstanceType<typeof Prisma.PrismaClientKnownRequestError> {
  return new Prisma.PrismaClientKnownRequestError(
    "Transaction failed due to a write conflict or a deadlock. Please retry your transaction",
    { code: "P2034", clientVersion: "test" }
  );
}

/** The OTHER retryable error shape withSerializableRetry recognizes — a raw
 * DriverAdapterError whose cause.kind is "TransactionWriteConflict" (see
 * src/lib/serializableRetry.ts's own doc comment). Duck-typed, matching how
 * isRetryableSerializationConflict itself checks it. */
function makeDriverAdapterConflictError(): Error {
  const error = new Error("TransactionWriteConflict") as Error & { cause?: unknown };
  Object.defineProperty(error, "name", { value: "DriverAdapterError" });
  error.cause = { kind: "TransactionWriteConflict" };
  return error;
}

async function buildDirectBookingFixture(overrides: { startAt?: Date } = {}) {
  const tutor = await createTutorUser();
  const student = await createSelfManagedStudent();
  const quote = await makeQuote(student.user.id, student.studentProfile.id, overrides.startAt);
  const payoutQuote = await makePayoutQuote(tutor.tutorProfile.id, quote.id, overrides.startAt);
  const payment = await makePayment(quote.id, student.user.id);
  const startAt = overrides.startAt ?? FAR_FUTURE_START;
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
  return {
    tutor,
    student,
    quote,
    payoutQuote,
    payment,
    input: {
      actorUserId: student.user.id,
      studentProfileId: student.studentProfile.id,
      tutorProfileId: tutor.tutorProfile.id,
      subjectId,
      academicLevelId: null,
      startAt,
      endAt,
      timezone: "America/Toronto",
      mode: "ONLINE" as const,
      paymentId: payment.id,
      customerPriceQuoteId: quote.id,
      tutorPayoutQuoteId: payoutQuote.id,
    },
  };
}

describe("P0 booking hardening — Serializable retry around reserveBookingPendingPayment's call sites", () => {
  it("A. Retryable Serializable conflict (P2034) -> retries -> succeeds once, exactly one Booking created", async () => {
    const fixture = await buildDirectBookingFixture();
    const original = ambientDb.$transaction.bind(ambientDb);
    let transactionCalls = 0;
    (ambientDb as unknown as { $transaction: typeof ambientDb.$transaction }).$transaction = ((...args: Parameters<typeof original>) => {
      transactionCalls++;
      if (transactionCalls <= 2) return Promise.reject(transactionCalls === 1 ? makeP2034Error() : makeDriverAdapterConflictError());
      return (original as (...a: Parameters<typeof original>) => ReturnType<typeof original>)(...args);
    }) as typeof ambientDb.$transaction;

    try {
      const booking = await reserveDirectBookingWithRetry(fixture.input);
      createdBookingIds.push(booking.id);
      expect(booking.status).toBe("PENDING_PAYMENT");
    } finally {
      ambientDb.$transaction = original;
    }

    // Both known-retryable shapes (P2034-coded and DriverAdapterError) were
    // absorbed internally — three total attempts (two rejected, one real).
    expect(transactionCalls).toBe(3);
    const bookingCount = await db.booking.count({ where: { tutorProfileId: fixture.tutor.tutorProfile.id } });
    expect(bookingCount).toBe(1); // never duplicated by the retried attempts
  });

  it("B. Repeated conflict beyond the bounded retry budget -> fails closed, never loops infinitely, zero Booking created", async () => {
    const fixture = await buildDirectBookingFixture();
    const original = ambientDb.$transaction.bind(ambientDb);
    let transactionCalls = 0;
    (ambientDb as unknown as { $transaction: typeof ambientDb.$transaction }).$transaction = (() => {
      transactionCalls++;
      return Promise.reject(makeP2034Error());
    }) as typeof ambientDb.$transaction;

    try {
      await expect(reserveDirectBookingWithRetry(fixture.input)).rejects.toThrow(/exhausted retry budget|serialization conflict/i);
    } finally {
      ambientDb.$transaction = original;
    }

    expect(transactionCalls).toBe(6); // withSerializableRetry's own DEFAULT_MAX_RETRIES, never exceeded
    const bookingCount = await db.booking.count({ where: { tutorProfileId: fixture.tutor.tutorProfile.id } });
    expect(bookingCount).toBe(0); // every simulated attempt was rejected before ever reaching the real database
  });

  it("C. Non-retryable domain error (SlotTakenError, a real overlap conflict) -> fails closed on first occurrence, never retried", async () => {
    const first = await buildDirectBookingFixture();
    const firstBooking = await reserveDirectBookingWithRetry(first.input);
    createdBookingIds.push(firstBooking.id);

    // A second, genuinely distinct reservation attempt for the SAME
    // tutor/slot (different student/quote/payment) — a real,
    // non-serialization-conflict domain rejection, produced sequentially so
    // it is deterministic rather than timing-dependent.
    const secondStudent = await createSelfManagedStudent();
    const secondQuote = await makeQuote(secondStudent.user.id, secondStudent.studentProfile.id, first.input.startAt);
    const secondPayoutQuote = await makePayoutQuote(first.tutor.tutorProfile.id, secondQuote.id, first.input.startAt);
    const secondPayment = await makePayment(secondQuote.id, secondStudent.user.id);

    const { result, transactionCalls } = await withTransactionCallCounter(() =>
      reserveDirectBookingWithRetry({
        ...first.input,
        actorUserId: secondStudent.user.id,
        studentProfileId: secondStudent.studentProfile.id,
        paymentId: secondPayment.id,
        customerPriceQuoteId: secondQuote.id,
        tutorPayoutQuoteId: secondPayoutQuote.id,
      }).then(
        (booking) => ({ status: "fulfilled" as const, booking }),
        (reason: unknown) => ({ status: "rejected" as const, reason })
      )
    );
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect((result as { status: "rejected"; reason: unknown }).reason).toBeInstanceOf(SlotTakenError);
    }
    expect(transactionCalls).toBe(1); // never retried — SlotTakenError is not a serialization conflict

    const bookingCount = await db.booking.count({ where: { tutorProfileId: first.tutor.tutorProfile.id } });
    expect(bookingCount).toBe(1); // still only the first booking
  });

  it("D. Concurrent reservation attempts for the same tutor/slot (distinct quotes) -> exactly one Booking survives, never a duplicate", async () => {
    let observedAtLeastOneRetry = false;
    for (let i = 0; i < 5; i++) {
      const startAt = new Date(FAR_FUTURE_START.getTime() + i * 3 * 24 * 60 * 60 * 1000);
      const tutor = await createTutorUser();
      const studentA = await createSelfManagedStudent();
      const studentB = await createSelfManagedStudent();
      const quoteA = await makeQuote(studentA.user.id, studentA.studentProfile.id, startAt);
      const quoteB = await makeQuote(studentB.user.id, studentB.studentProfile.id, startAt);
      const payoutQuoteA = await makePayoutQuote(tutor.tutorProfile.id, quoteA.id, startAt);
      const payoutQuoteB = await makePayoutQuote(tutor.tutorProfile.id, quoteB.id, startAt);
      const paymentA = await makePayment(quoteA.id, studentA.user.id);
      const paymentB = await makePayment(quoteB.id, studentB.user.id);
      const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

      const inputA = {
        actorUserId: studentA.user.id,
        studentProfileId: studentA.studentProfile.id,
        tutorProfileId: tutor.tutorProfile.id,
        subjectId,
        academicLevelId: null,
        startAt,
        endAt,
        timezone: "America/Toronto",
        mode: "ONLINE" as const,
        paymentId: paymentA.id,
        customerPriceQuoteId: quoteA.id,
        tutorPayoutQuoteId: payoutQuoteA.id,
      };
      const inputB = { ...inputA, actorUserId: studentB.user.id, studentProfileId: studentB.studentProfile.id, paymentId: paymentB.id, customerPriceQuoteId: quoteB.id, tutorPayoutQuoteId: payoutQuoteB.id };

      const [{ result: resultA, transactionCalls: callsA }, { result: resultB, transactionCalls: callsB }] = await Promise.all([
        withTransactionCallCounter(() => reserveDirectBookingWithRetry(inputA).then((b) => ({ status: "fulfilled" as const, booking: b }), (r: unknown) => ({ status: "rejected" as const, reason: r }))),
        withTransactionCallCounter(() => reserveDirectBookingWithRetry(inputB).then((b) => ({ status: "fulfilled" as const, booking: b }), (r: unknown) => ({ status: "rejected" as const, reason: r }))),
      ]);
      // withTransactionCallCounter mutates/restores the SAME shared
      // ambientDb.$transaction; running two concurrently still correctly
      // counts every invocation from either closure since both wrap-and-
      // restore around the identical original method reference.
      if (callsA > 1 || callsB > 1) observedAtLeastOneRetry = true;

      const outcomes = [resultA, resultB];
      const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
      const rejected = outcomes.filter((o) => o.status === "rejected");
      expect(fulfilled.length).toBe(1); // exactly one attempt wins
      expect(rejected.length).toBe(1);
      if (rejected[0].status === "rejected") {
        expect((rejected[0] as { status: "rejected"; reason: unknown }).reason).toBeInstanceOf(SlotTakenError);
      }
      if (fulfilled[0].status === "fulfilled") {
        createdBookingIds.push((fulfilled[0] as { status: "fulfilled"; booking: { id: string } }).booking.id);
      }

      const bookingCount = await db.booking.count({ where: { tutorProfileId: tutor.tutorProfile.id } });
      expect(bookingCount).toBe(1); // never a duplicate Booking for this tutor/slot
    }
    // Non-flaky evidence requirement (matches cancellationConcurrency.
    // integration.test.ts's own established convention): across the
    // repeated race, at least one iteration's retry-wrapped call genuinely
    // invoked $transaction more than once — i.e. a real Serializable
    // write-conflict was caught by withSerializableRetry and transparently
    // retried, not merely "never happened to collide this run."
    expect(observedAtLeastOneRetry).toBe(true);
  });

  it("E. Same quote/payment reused across two concurrent identical reservation attempts (client double-submit / internal retry replay) -> the quote and payment are consumed at most once", async () => {
    const fixture = await buildDirectBookingFixture();

    const [resultA, resultB] = await Promise.allSettled([
      reserveDirectBookingWithRetry(fixture.input),
      reserveDirectBookingWithRetry(fixture.input),
    ]);
    const outcomes = [resultA, resultB];
    const fulfilled = outcomes.filter((o): o is PromiseFulfilledResult<Awaited<ReturnType<typeof reserveBookingPendingPayment>>> => o.status === "fulfilled");
    const rejected = outcomes.filter((o) => o.status === "rejected");
    expect(fulfilled.length).toBe(1); // exactly one of the two identical attempts wins
    expect(rejected.length).toBe(1);
    if (rejected[0].status === "rejected") {
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(SlotTakenError);
    }
    const winningBooking = fulfilled[0].value;
    createdBookingIds.push(winningBooking.id);

    // Exactly one Booking references this customerPriceQuoteId — the quote
    // was never consumed (or even reserved-against) twice.
    const bookingsForQuote = await db.booking.findMany({ where: { customerPriceQuoteId: fixture.quote.id } });
    expect(bookingsForQuote.length).toBe(1);
    expect(bookingsForQuote[0].id).toBe(winningBooking.id);

    // The payment's guarded updateMany (bookingId: null guard) linked it to
    // exactly the one winning booking, never re-pointed or left dangling.
    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: fixture.payment.id } });
    expect(finalPayment.bookingId).toBe(winningBooking.id);
  });

  it("F. Session created exactly once downstream of a retried/contended reservation", async () => {
    const fixture = await buildDirectBookingFixture();
    const original = ambientDb.$transaction.bind(ambientDb);
    let transactionCalls = 0;
    (ambientDb as unknown as { $transaction: typeof ambientDb.$transaction }).$transaction = ((...args: Parameters<typeof original>) => {
      transactionCalls++;
      if (transactionCalls === 1) return Promise.reject(makeP2034Error());
      return (original as (...a: Parameters<typeof original>) => ReturnType<typeof original>)(...args);
    }) as typeof ambientDb.$transaction;

    let booking: Awaited<ReturnType<typeof reserveBookingPendingPayment>>;
    try {
      booking = await reserveDirectBookingWithRetry(fixture.input);
    } finally {
      ambientDb.$transaction = original;
    }
    createdBookingIds.push(booking.id);
    expect(transactionCalls).toBe(2); // one retry occurred

    await db.payment.update({ where: { id: fixture.payment.id }, data: { status: "AUTHORIZED", stripePaymentIntentId: `pi_fake_${randomUUID()}` } });
    await convergeToCaptured(fixture.payment.id);

    const finalBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(finalBooking.status).toBe("CONFIRMED");
    const sessionCount = await db.session_.count({ where: { bookingId: booking.id } });
    expect(sessionCount).toBe(1); // exactly once, never duplicated by the earlier retried reservation attempt
  });

  it("G. Direct-booking behavior unchanged on the uncontended path (no retry, correct field snapshot)", async () => {
    const fixture = await buildDirectBookingFixture();
    const { result: booking, transactionCalls } = await withTransactionCallCounter(() => reserveDirectBookingWithRetry(fixture.input));
    createdBookingIds.push(booking.id);

    expect(transactionCalls).toBe(1); // no retry on the uncontended path
    expect(booking.status).toBe("PENDING_PAYMENT");
    expect(booking.studentProfileId).toBe(fixture.student.studentProfile.id);
    expect(booking.tutorProfileId).toBe(fixture.tutor.tutorProfile.id);
    expect(booking.customerPriceQuoteId).toBe(fixture.quote.id);
    expect(booking.tutorPayoutQuoteId).toBe(fixture.payoutQuote.id);
    expect(booking.totalCents).toBe(fixture.quote.totalCents);

    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: fixture.payment.id } });
    expect(finalPayment.bookingId).toBe(booking.id);
  });

  it("H. Quick Match invitation-acceptance behavior unchanged on the uncontended path", async () => {
    const requester = await createSelfManagedStudent();
    const tutor = await createTutorUser();
    const quote = await makeQuote(requester.user.id, requester.studentProfile.id);
    const payoutQuote = await makePayoutQuote(tutor.tutorProfile.id, quote.id);
    await makePayment(quote.id, requester.user.id);
    const { request, invitation } = await createTutoringRequestAndInvitation({
      createdByUserId: requester.user.id,
      studentProfileId: requester.studentProfile.id,
      tutorProfileId: tutor.tutorProfile.id,
      customerPriceQuoteId: quote.id,
      tutorPayoutQuoteId: payoutQuote.id,
    });

    const { result: claimed, transactionCalls } = await withTransactionCallCounter(() =>
      claimInvitationWithRetry({ tutorInvitationId: invitation.id, tutorProfileId: tutor.tutorProfile.id, auditActorUserId: tutor.user.id })
    );
    createdBookingIds.push(claimed.bookingId);

    expect(transactionCalls).toBe(1); // no retry on the uncontended path

    const finalRequest = await db.tutoringRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(finalRequest.status).toBe("PAYMENT_PENDING");

    const finalInvitation = await db.tutorInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(finalInvitation.status).toBe("ACCEPTED");
    expect(finalInvitation.bookingId).toBe(claimed.bookingId);

    const booking = await db.booking.findUniqueOrThrow({ where: { id: claimed.bookingId } });
    expect(booking.status).toBe("PENDING_PAYMENT");
    expect(booking.tutoringRequestId).toBe(request.id);
    expect(booking.studentProfileId).toBe(requester.studentProfile.id);
    expect(booking.tutorProfileId).toBe(tutor.tutorProfile.id);

    // BETA-1 / P1-02 — reserveBookingPendingPayment now authoritatively
    // consumes both quotes itself (see that function's own doc comment),
    // rather than leaving consumption for post-capture convergence. By the
    // time claimInvitationWithRetry (which calls it) returns, the payout
    // quote has already advanced past ACCEPTED to CONSUMED, and the
    // customer quote has already left ACTIVE for CONSUMED too — this is the
    // whole point of the fix (full context validated and locked in before
    // any Stripe capture is ever reachable), not a side effect to work
    // around.
    const finalPayoutQuote = await db.tutorPayoutQuote.findUniqueOrThrow({ where: { id: payoutQuote.id } });
    expect(finalPayoutQuote.status).toBe("CONSUMED");

    const finalQuote = await db.customerPriceQuote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(finalQuote.status).toBe("CONSUMED");
  });

  it("Quick Match: retryable conflict on the claim transaction -> retries -> succeeds once, request claimed exactly once", async () => {
    const requester = await createSelfManagedStudent();
    const tutor = await createTutorUser();
    const quote = await makeQuote(requester.user.id, requester.studentProfile.id);
    const payoutQuote = await makePayoutQuote(tutor.tutorProfile.id, quote.id);
    await makePayment(quote.id, requester.user.id);
    const { request, invitation } = await createTutoringRequestAndInvitation({
      createdByUserId: requester.user.id,
      studentProfileId: requester.studentProfile.id,
      tutorProfileId: tutor.tutorProfile.id,
      customerPriceQuoteId: quote.id,
      tutorPayoutQuoteId: payoutQuote.id,
    });

    const original = ambientDb.$transaction.bind(ambientDb);
    let transactionCalls = 0;
    (ambientDb as unknown as { $transaction: typeof ambientDb.$transaction }).$transaction = ((...args: Parameters<typeof original>) => {
      transactionCalls++;
      if (transactionCalls === 1) return Promise.reject(makeP2034Error());
      return (original as (...a: Parameters<typeof original>) => ReturnType<typeof original>)(...args);
    }) as typeof ambientDb.$transaction;

    let claimed: { bookingId: string; paymentId: string };
    try {
      claimed = await claimInvitationWithRetry({ tutorInvitationId: invitation.id, tutorProfileId: tutor.tutorProfile.id, auditActorUserId: tutor.user.id });
    } finally {
      ambientDb.$transaction = original;
    }
    createdBookingIds.push(claimed.bookingId);

    expect(transactionCalls).toBe(2); // one retry occurred
    const finalRequest = await db.tutoringRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(finalRequest.status).toBe("PAYMENT_PENDING"); // claimed exactly once, not left MATCHING or double-claimed
    const bookingCount = await db.booking.count({ where: { tutoringRequestId: request.id } });
    expect(bookingCount).toBe(1); // no duplicate booking from the retried attempt
  });
});
