import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";

// Golden Path P0 — Quick Match active-request backend invariant.
//
// Permanent concurrency/regression coverage for the transaction-bound
// duplicate-active-request guard added to
// src/services/tutoringRequestCreation.ts's createTutoringRequestForLearner
// (hasActiveTutoringRequest, called fresh inside the SAME transaction,
// immediately before the create), and for the withSerializableRetry wrapping
// added around createTutoringRequestForLearnerInOwnTransaction — the exact
// call createTutoringRequestAction (src/lib/actions/tutoringRequests.ts)
// makes.
//
// Same DB-target redirection technique already established by
// bookingCreationConcurrency.integration.test.ts and
// cancellationConcurrency.integration.test.ts (see either file's own header
// comment for the full rationale): resolve and verify the test database
// FIRST, reassign process.env.DATABASE_URL to the verified target, THEN
// dynamically import every module that transitively touches @/lib/db's
// ambient singleton.

let createCustomerPriceQuote: typeof import("./customerPricing").createCustomerPriceQuote;
let createTutorPayoutQuote: typeof import("./tutorPayout").createTutorPayoutQuote;
let createTutoringRequestForLearner: typeof import("./tutoringRequestCreation").createTutoringRequestForLearner;
let createTutoringRequestForLearnerInOwnTransaction: typeof import("./tutoringRequestCreation").createTutoringRequestForLearnerInOwnTransaction;
let hasActiveTutoringRequest: typeof import("./tutoringRequestCreation").hasActiveTutoringRequest;
let ActiveTutoringRequestExistsError: typeof import("./tutoringRequestCreation").ActiveTutoringRequestExistsError;
let NotAuthorizedForLearnerError: typeof import("./tutoringRequestCreation").NotAuthorizedForLearnerError;
let ACTIVE_TUTORING_REQUEST_STATUSES: typeof import("./tutoringRequestCreation").ACTIVE_TUTORING_REQUEST_STATUSES;
// Module-scope handle to the ambient @/lib/db singleton — the exact
// PrismaClient instance createTutoringRequestForLearnerInOwnTransaction
// itself calls .$transaction on. Used so the retry-injection tests below can
// monkeypatch the SAME object that call resolves to.
let ambientDb: typeof import("@/lib/db").db;

let db: PrismaClient;
let subjectId: string;

const createdUserIds: string[] = [];
const createdParentUserIds: string[] = [];
const createdStudentProfileIds: string[] = [];
const createdTutorProfileIds: string[] = [];
const createdCustomerQuoteIds: string[] = [];
const createdTutorPayoutQuoteIds: string[] = [];
const createdPaymentIds: string[] = [];
const createdBookingIds: string[] = [];
const createdTutorInvitationIds: string[] = [];
const createdTutoringRequestIds: string[] = [];
const createdRelationshipIds: string[] = [];

const FAR_FUTURE_START = new Date(Date.now() + 70 * 24 * 60 * 60 * 1000);

beforeAll(async () => {
  const target = resolveVerifiedTestDatabase();
  const devDatabaseUrlForSafetyCheckOnly = process.env.DATABASE_URL;
  const adapter = new PrismaPg({ connectionString: target.connectionString });
  db = new PrismaClient({ adapter });

  process.env.DATABASE_URL = target.connectionString;

  ({ createCustomerPriceQuote } = await import("./customerPricing"));
  ({ createTutorPayoutQuote } = await import("./tutorPayout"));
  ({
    createTutoringRequestForLearner,
    createTutoringRequestForLearnerInOwnTransaction,
    hasActiveTutoringRequest,
    ActiveTutoringRequestExistsError,
    NotAuthorizedForLearnerError,
    ACTIVE_TUTORING_REQUEST_STATUSES,
    hasActiveTutoringRequest,
  } = await import("./tutoringRequestCreation"));

  ({ db: ambientDb } = await import("@/lib/db"));
  const [{ current_database: ambientDatabaseName }] = await ambientDb.$queryRaw<
    Array<{ current_database: string }>
  >`SELECT current_database()`;
  if (ambientDatabaseName !== target.databaseName) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton reports current_database() = "${ambientDatabaseName}", but the verified test database is "${target.databaseName}". Refusing to run any tutoring-request-creation concurrency test.`
    );
  }
  const devDatabaseNameForSafetyCheckOnly = devDatabaseUrlForSafetyCheckOnly
    ? new URL(devDatabaseUrlForSafetyCheckOnly).pathname.replace(/^\//, "")
    : null;
  if (devDatabaseNameForSafetyCheckOnly && ambientDatabaseName === devDatabaseNameForSafetyCheckOnly) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton's current_database() ("${ambientDatabaseName}") equals the real development database name. Refusing to run any tutoring-request-creation concurrency test.`
    );
  }

  const subject = await db.subject.create({ data: { slug: `p0-trc-subject-${randomUUID()}`, sortOrder: 999 } });
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
  if (createdRelationshipIds.length > 0) {
    await db.parentStudentRelationship.deleteMany({ where: { id: { in: createdRelationshipIds } } });
    createdRelationshipIds.length = 0;
  }
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
    await db.auditLog.deleteMany({ where: { entityId: { in: createdTutoringRequestIds } } });
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
  if (createdParentUserIds.length > 0) {
    await db.parentProfile.deleteMany({ where: { userId: { in: createdParentUserIds } } });
  }
  if (createdUserIds.length > 0 || createdParentUserIds.length > 0) {
    const allUserIds = [...createdUserIds, ...createdParentUserIds];
    await db.notification.deleteMany({ where: { userId: { in: allUserIds } } });
    await db.user.deleteMany({ where: { id: { in: allUserIds } } });
    createdUserIds.length = 0;
    createdParentUserIds.length = 0;
  }
});

function uniqueEmail(prefix: string) {
  return `p0-trc-${prefix}-${randomUUID()}@futuretutor.test`;
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

/** A second, independent SELF_MANAGED student user — used to prove the
 * guard's studentProfileId scoping does not leak across unrelated
 * learners. */
async function createTutorUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("tutor"), role: "TUTOR" } });
  createdUserIds.push(user.id);
  const tutorProfile = await db.tutorProfile.create({
    data: { userId: user.id, slug: `p0-trc-tutor-${randomUUID()}`, applicationStatus: "APPROVED", payoutTier: "NEW", learningMode: "BOTH" },
  });
  createdTutorProfileIds.push(tutorProfile.id);
  return { user, tutorProfile };
}

async function makeQuote(actorUserId: string, studentProfileId: string, requestedStartAt: Date = FAR_FUTURE_START) {
  const quote = await createCustomerPriceQuote(
    { createdByUserId: actorUserId, studentProfileId, subjectId, academicLevelId: null, tutoringMode: "ONLINE", durationMinutes: 60, requestedStartAt },
    db
  );
  createdCustomerQuoteIds.push(quote.id);
  return quote;
}

/**
 * Faithful reproduction of createTutoringRequestAction's authoritative
 * creation call (src/lib/actions/tutoringRequests.ts) — identical shape,
 * using the SAME ambient @/lib/db singleton that call site uses, so the
 * retry-injection test below can monkeypatch ambientDb.$transaction and
 * observe the effect here.
 */
function createRequestWithRetry(input: Parameters<typeof createTutoringRequestForLearnerInOwnTransaction>[1]) {
  return createTutoringRequestForLearnerInOwnTransaction(ambientDb, input);
}

function baseInput(actorUserId: string, studentProfileId: string, quoteId: string, requestedStartAt: Date = FAR_FUTURE_START) {
  return {
    actorUserId,
    studentProfileId,
    subjectId,
    academicLevelId: null,
    tutoringMode: "ONLINE" as const,
    durationMinutes: 60,
    requestedStartAt,
    currency: "CAD",
    customerPriceQuoteId: quoteId,
  };
}

/** Directly persists a historical TutoringRequest row at a given terminal
 * (or, for a couple of tests, active) status — bypassing the guarded
 * creation path on purpose, exactly the way a real historical row would
 * exist by the time a NEW Quick Match is attempted. */
async function createHistoricalRequest(studentProfileId: string, createdByUserId: string, status: string, requestedStartAt: Date = FAR_FUTURE_START) {
  const quote = await makeQuote(createdByUserId, studentProfileId, requestedStartAt);
  const request = await db.tutoringRequest.create({
    data: {
      createdByUserId,
      studentProfileId,
      subjectId,
      academicLevelId: null,
      tutoringMode: "ONLINE",
      durationMinutes: 60,
      requestedStartAt,
      currency: "CAD",
      customerPriceQuoteId: quote.id,
      status: status as never,
    },
  });
  createdTutoringRequestIds.push(request.id);
  return { request, quote };
}

/** A full historical BOOKED TutoringRequest with a real linked CONFIRMED
 * Booking — proving the guard's terminal classification is exercised
 * against a genuinely booked, not merely relabeled, row. */
async function createHistoricalBookedFixture(studentProfileId: string, createdByUserId: string, requestedStartAt: Date = FAR_FUTURE_START) {
  const tutor = await createTutorUser();
  const { request, quote } = await createHistoricalRequest(studentProfileId, createdByUserId, "BOOKED", requestedStartAt);
  const payoutQuote = await createTutorPayoutQuote(
    { tutorProfileId: tutor.tutorProfile.id, subjectId, academicLevelId: null, tutoringMode: "ONLINE", durationMinutes: 60, requestedStartAt },
    quote.id,
    db
  );
  createdTutorPayoutQuoteIds.push(payoutQuote.id);
  const endAt = new Date(requestedStartAt.getTime() + 60 * 60 * 1000);
  const booking = await db.booking.create({
    data: {
      studentProfileId,
      tutorProfileId: tutor.tutorProfile.id,
      subjectId,
      startAt: requestedStartAt,
      endAt,
      timezone: "UTC",
      mode: "ONLINE",
      platformFeeCentsSnapshot: 0,
      totalCents: quote.totalCents,
      status: "CONFIRMED",
      customerPriceQuoteId: quote.id,
      tutorPayoutQuoteId: payoutQuote.id,
      customerBasePriceCents: quote.basePriceCents,
      customerAdjustmentCents: quote.adjustmentsTotalCents,
      customerSubtotalCents: quote.subtotalCents,
      taxCents: quote.taxCents,
      tutorPayoutBaseCents: payoutQuote.basePayoutCents,
      tutorPayoutAdjustmentCents: payoutQuote.adjustmentsTotalCents,
      tutorPayoutCents: payoutQuote.totalPayoutCents,
      grossSpreadCents: quote.subtotalCents - payoutQuote.totalPayoutCents,
      customerPricingVersion: quote.pricingVersion,
      tutorPayoutVersion: payoutQuote.payoutVersion,
      tutoringRequestId: request.id,
    },
  });
  createdBookingIds.push(booking.id);
  return { request, booking, tutor };
}

async function createGuardianManagedStudent() {
  const studentProfile = await db.studentProfile.create({
    data: { userId: null, firstName: "Child", lastName: `${randomUUID()}`, managementMode: "GUARDIAN_MANAGED" },
  });
  createdStudentProfileIds.push(studentProfile.id);
  return { studentProfile };
}

async function createParentUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("parent"), role: "PARENT" } });
  createdParentUserIds.push(user.id);
  const parentProfile = await db.parentProfile.create({ data: { userId: user.id, firstName: "Test", lastName: "Parent" } });
  return { user, parentProfile };
}

async function linkGuardian(parentProfileId: string, studentProfileId: string, status: "ACTIVE" | "REVOKED" = "ACTIVE") {
  const relationship = await db.parentStudentRelationship.create({ data: { parentProfileId, studentProfileId, status } });
  createdRelationshipIds.push(relationship.id);
  return relationship;
}

function makeP2034Error(): InstanceType<typeof Prisma.PrismaClientKnownRequestError> {
  return new Prisma.PrismaClientKnownRequestError(
    "Transaction failed due to a write conflict or a deadlock. Please retry your transaction",
    { code: "P2034", clientVersion: "test" }
  );
}

describe("Golden Path P0 — Quick Match active-request backend invariant", () => {
  it("audits every TutoringRequestStatus enum value exactly once (no gaps, no duplicates)", () => {
    const allStatuses = [
      "DRAFT",
      "PRICED",
      "CONFIRMED",
      "MATCHING",
      "PAYMENT_PENDING",
      "BOOKED",
      "CANCELLED",
      "EXPIRED",
      "NO_TUTOR_FOUND",
      "FAILED",
      "PAYMENT_FAILED",
    ];
    expect(new Set(ACTIVE_TUTORING_REQUEST_STATUSES).size).toBe(ACTIVE_TUTORING_REQUEST_STATUSES.length);
    for (const status of ACTIVE_TUTORING_REQUEST_STATUSES) {
      expect(allStatuses).toContain(status);
    }
    // The authoritative active set independently concluded by this audit —
    // deliberately ONE WIDER than Codex's inferred {PRICED, CONFIRMED,
    // MATCHING, PAYMENT_PENDING} (see tutoringRequestCreation.ts's own doc
    // comment for the full discrepancy explanation: DRAFT is included here).
    expect([...ACTIVE_TUTORING_REQUEST_STATUSES].sort()).toEqual(
      ["DRAFT", "PRICED", "CONFIRMED", "MATCHING", "PAYMENT_PENDING"].sort()
    );
    const terminalStatuses = allStatuses.filter((s) => !(ACTIVE_TUTORING_REQUEST_STATUSES as readonly string[]).includes(s));
    expect(terminalStatuses.sort()).toEqual(["BOOKED", "CANCELLED", "EXPIRED", "NO_TUTOR_FOUND", "FAILED", "PAYMENT_FAILED"].sort());
  });

  it("hasActiveTutoringRequest (the pure existence-check primitive) returns false with no rows and true once an active row exists", async () => {
    const student = await createSelfManagedStudent();
    await expect(db.$transaction((tx) => hasActiveTutoringRequest(tx, student.studentProfile.id))).resolves.toBe(false);

    await createHistoricalRequest(student.studentProfile.id, student.user.id, "MATCHING");
    await expect(db.$transaction((tx) => hasActiveTutoringRequest(tx, student.studentProfile.id))).resolves.toBe(true);
  });

  it("A. No prior request -> new Quick Match creation succeeds", async () => {
    const student = await createSelfManagedStudent();
    const quote = await makeQuote(student.user.id, student.studentProfile.id);
    const request = await createRequestWithRetry(baseInput(student.user.id, student.studentProfile.id, quote.id));
    createdTutoringRequestIds.push(request.id);
    expect(request.status).toBe("PRICED");
  });

  it("B/C/D. Historical BOOKED request -> new creation succeeds, and the historical TutoringRequest + Booking remain byte-for-byte unchanged", async () => {
    const student = await createSelfManagedStudent();
    const historical = await createHistoricalBookedFixture(student.studentProfile.id, student.user.id);
    const beforeRequest = await db.tutoringRequest.findUniqueOrThrow({ where: { id: historical.request.id } });
    const beforeBooking = await db.booking.findUniqueOrThrow({ where: { id: historical.booking.id } });

    const newQuote = await makeQuote(student.user.id, student.studentProfile.id);
    const newRequest = await createRequestWithRetry(baseInput(student.user.id, student.studentProfile.id, newQuote.id));
    createdTutoringRequestIds.push(newRequest.id);
    expect(newRequest.status).toBe("PRICED");
    expect(newRequest.id).not.toBe(historical.request.id);

    const afterRequest = await db.tutoringRequest.findUniqueOrThrow({ where: { id: historical.request.id } });
    expect(afterRequest).toEqual(beforeRequest); // C — historical request byte-for-byte unchanged
    expect(afterRequest.status).toBe("BOOKED");

    const afterBooking = await db.booking.findUniqueOrThrow({ where: { id: historical.booking.id } });
    expect(afterBooking).toEqual(beforeBooking); // D — historical booking byte-for-byte unchanged
    expect(afterBooking.status).toBe("CONFIRMED");

    // Both requests remain independently queryable — nothing was deleted.
    const allForStudent = await db.tutoringRequest.findMany({ where: { studentProfileId: student.studentProfile.id } });
    expect(allForStudent.map((r) => r.id).sort()).toEqual([historical.request.id, newRequest.id].sort());
  });

  it("E. Historical PAYMENT_FAILED request -> terminal, does not block a new Quick Match", async () => {
    const student = await createSelfManagedStudent();
    const { request: historical } = await createHistoricalRequest(student.studentProfile.id, student.user.id, "PAYMENT_FAILED");

    const newQuote = await makeQuote(student.user.id, student.studentProfile.id);
    const newRequest = await createRequestWithRetry(baseInput(student.user.id, student.studentProfile.id, newQuote.id));
    createdTutoringRequestIds.push(newRequest.id);
    expect(newRequest.status).toBe("PRICED");

    const afterHistorical = await db.tutoringRequest.findUniqueOrThrow({ where: { id: historical.id } });
    expect(afterHistorical.status).toBe("PAYMENT_FAILED"); // untouched, never mutated back to active
  });

  it.each(["NO_TUTOR_FOUND", "FAILED", "EXPIRED", "CANCELLED"])(
    "K. Historical %s request -> terminal, does not block a new Quick Match",
    async (status) => {
      const student = await createSelfManagedStudent();
      await createHistoricalRequest(student.studentProfile.id, student.user.id, status);

      const newQuote = await makeQuote(student.user.id, student.studentProfile.id);
      const newRequest = await createRequestWithRetry(baseInput(student.user.id, student.studentProfile.id, newQuote.id));
      createdTutoringRequestIds.push(newRequest.id);
      expect(newRequest.status).toBe("PRICED");
    }
  );

  it("F/G/L. One active (PRICED) request -> a second creation attempt is rejected, sequentially, and the first request is left untouched", async () => {
    const student = await createSelfManagedStudent();
    const firstQuote = await makeQuote(student.user.id, student.studentProfile.id);
    const first = await createRequestWithRetry(baseInput(student.user.id, student.studentProfile.id, firstQuote.id));
    createdTutoringRequestIds.push(first.id);
    const beforeFirst = await db.tutoringRequest.findUniqueOrThrow({ where: { id: first.id } });

    const secondQuote = await makeQuote(student.user.id, student.studentProfile.id);
    await expect(
      createRequestWithRetry(baseInput(student.user.id, student.studentProfile.id, secondQuote.id))
    ).rejects.toBeInstanceOf(ActiveTutoringRequestExistsError);

    const afterFirst = await db.tutoringRequest.findUniqueOrThrow({ where: { id: first.id } });
    expect(afterFirst).toEqual(beforeFirst); // L — untouched by the rejected duplicate attempt

    const activeCount = await db.tutoringRequest.count({
      where: { studentProfileId: student.studentProfile.id, status: { in: [...ACTIVE_TUTORING_REQUEST_STATUSES] } },
    });
    expect(activeCount).toBe(1); // G — still exactly one active request, never two
  });

  it("each individual active status (DRAFT, PRICED, CONFIRMED, MATCHING, PAYMENT_PENDING) independently blocks a new creation", async () => {
    for (const status of ACTIVE_TUTORING_REQUEST_STATUSES) {
      const student = await createSelfManagedStudent();
      await createHistoricalRequest(student.studentProfile.id, student.user.id, status);
      const quote = await makeQuote(student.user.id, student.studentProfile.id);
      await expect(
        createRequestWithRetry(baseInput(student.user.id, student.studentProfile.id, quote.id))
      ).rejects.toBeInstanceOf(ActiveTutoringRequestExistsError);
    }
  });

  it("hasActiveTutoringRequest is scoped by studentProfileId, not createdByUserId — a different learner is never blocked", async () => {
    const studentA = await createSelfManagedStudent();
    const studentB = await createSelfManagedStudent();
    await createHistoricalRequest(studentA.studentProfile.id, studentA.user.id, "PRICED");

    const quoteB = await makeQuote(studentB.user.id, studentB.studentProfile.id);
    const requestB = await createRequestWithRetry(baseInput(studentB.user.id, studentB.studentProfile.id, quoteB.id));
    createdTutoringRequestIds.push(requestB.id);
    expect(requestB.status).toBe("PRICED"); // student B's own independent active request succeeds
  });

  it("Section 9 scope proof: the guard is keyed on studentProfileId (the learner), not createdByUserId (the actor) — TWO DIFFERENT active guardians for the SAME child are still limited to one active request", async () => {
    const { studentProfile: child } = await createGuardianManagedStudent();
    const parentA = await createParentUser();
    const parentB = await createParentUser();
    await linkGuardian(parentA.parentProfile.id, child.id, "ACTIVE");
    await linkGuardian(parentB.parentProfile.id, child.id, "ACTIVE");

    const quoteA = await makeQuote(parentA.user.id, child.id);
    const requestA = await createRequestWithRetry(baseInput(parentA.user.id, child.id, quoteA.id));
    createdTutoringRequestIds.push(requestA.id);
    expect(requestA.status).toBe("PRICED");

    // Parent B, a DIFFERENT actor with equally valid ACTIVE guardian
    // authority over the SAME child, must still be blocked — the invariant
    // is "one active Quick Match per learner," not "one per initiating
    // account."
    const quoteB = await makeQuote(parentB.user.id, child.id);
    await expect(createRequestWithRetry(baseInput(parentB.user.id, child.id, quoteB.id))).rejects.toBeInstanceOf(
      ActiveTutoringRequestExistsError
    );

    const activeCount = await db.tutoringRequest.count({
      where: { studentProfileId: child.id, status: { in: [...ACTIVE_TUTORING_REQUEST_STATUSES] } },
    });
    expect(activeCount).toBe(1);
  });

  it("H/I/J. Concurrent duplicate creation attempts for the same learner -> exactly one active request created, no duplicate Booking, and the losing attempt's quote is left unconsumed", async () => {
    let observedAtLeastOneRetryOrRejection = false;
    for (let i = 0; i < 5; i++) {
      const requestedStartAt = new Date(FAR_FUTURE_START.getTime() + i * 5 * 24 * 60 * 60 * 1000);
      const student = await createSelfManagedStudent();
      const quoteA = await makeQuote(student.user.id, student.studentProfile.id, requestedStartAt);
      const quoteB = await makeQuote(student.user.id, student.studentProfile.id, requestedStartAt);

      const [resultA, resultB] = await Promise.allSettled([
        createRequestWithRetry(baseInput(student.user.id, student.studentProfile.id, quoteA.id, requestedStartAt)),
        createRequestWithRetry(baseInput(student.user.id, student.studentProfile.id, quoteB.id, requestedStartAt)),
      ]);

      const outcomes = [resultA, resultB];
      const fulfilled = outcomes.filter((o): o is PromiseFulfilledResult<Awaited<ReturnType<typeof createTutoringRequestForLearnerInOwnTransaction>>> => o.status === "fulfilled");
      const rejected = outcomes.filter((o) => o.status === "rejected");

      expect(fulfilled.length).toBe(1); // H — exactly one of the two concurrent attempts wins
      expect(rejected.length).toBe(1);
      if (rejected[0].status === "rejected") {
        expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ActiveTutoringRequestExistsError);
        observedAtLeastOneRetryOrRejection = true;
      }
      const winner = fulfilled[0].value;
      createdTutoringRequestIds.push(winner.id);

      // H — max active requests created under concurrency is exactly 1.
      const activeCount = await db.tutoringRequest.count({
        where: { studentProfileId: student.studentProfile.id, status: { in: [...ACTIVE_TUTORING_REQUEST_STATUSES] } },
      });
      expect(activeCount).toBe(1);
      const totalCount = await db.tutoringRequest.count({ where: { studentProfileId: student.studentProfile.id } });
      expect(totalCount).toBe(1); // no orphaned second TutoringRequest row either

      // I — no Booking exists at all for this student (TutoringRequest
      // creation never itself produces a Booking — that only happens much
      // later, at tutor-invitation-acceptance time) — the guard cannot have
      // caused one.
      const bookingCount = await db.booking.count({ where: { studentProfileId: student.studentProfile.id } });
      expect(bookingCount).toBe(0);

      // J — exactly one of the two quotes is referenced by the persisted
      // TutoringRequest; the losing attempt's quote was never consumed by a
      // second row (left ACTIVE/orphaned — the same documented, accepted
      // minor gap as the existing NotAuthorizedForLearnerError orphaned-quote
      // case in createTutoringRequestAction).
      expect([quoteA.id, quoteB.id]).toContain(winner.customerPriceQuoteId);
      const requestsReferencingEitherQuote = await db.tutoringRequest.count({
        where: { customerPriceQuoteId: { in: [quoteA.id, quoteB.id] } },
      });
      expect(requestsReferencingEitherQuote).toBe(1);
    }
    expect(observedAtLeastOneRetryOrRejection).toBe(true);
  });

  it("Retryable Serializable conflict (P2034) on the create transaction -> retries -> succeeds once, exactly one active request created", async () => {
    const student = await createSelfManagedStudent();
    const quote = await makeQuote(student.user.id, student.studentProfile.id);

    const original = ambientDb.$transaction.bind(ambientDb);
    let transactionCalls = 0;
    (ambientDb as unknown as { $transaction: typeof ambientDb.$transaction }).$transaction = ((...args: Parameters<typeof original>) => {
      transactionCalls++;
      if (transactionCalls === 1) return Promise.reject(makeP2034Error());
      return (original as (...a: Parameters<typeof original>) => ReturnType<typeof original>)(...args);
    }) as typeof ambientDb.$transaction;

    let request: Awaited<ReturnType<typeof createTutoringRequestForLearnerInOwnTransaction>>;
    try {
      request = await createRequestWithRetry(baseInput(student.user.id, student.studentProfile.id, quote.id));
    } finally {
      ambientDb.$transaction = original;
    }
    createdTutoringRequestIds.push(request.id);

    expect(transactionCalls).toBe(2); // one retry occurred
    const count = await db.tutoringRequest.count({ where: { studentProfileId: student.studentProfile.id } });
    expect(count).toBe(1); // never duplicated by the retried attempt
  });

  it("Repeated conflict beyond the bounded retry budget -> fails closed, never loops infinitely, zero request created", async () => {
    const student = await createSelfManagedStudent();
    const quote = await makeQuote(student.user.id, student.studentProfile.id);

    const original = ambientDb.$transaction.bind(ambientDb);
    let transactionCalls = 0;
    (ambientDb as unknown as { $transaction: typeof ambientDb.$transaction }).$transaction = (() => {
      transactionCalls++;
      return Promise.reject(makeP2034Error());
    }) as typeof ambientDb.$transaction;

    try {
      await expect(createRequestWithRetry(baseInput(student.user.id, student.studentProfile.id, quote.id))).rejects.toThrow(
        /exhausted retry budget|serialization conflict/i
      );
    } finally {
      ambientDb.$transaction = original;
    }

    expect(transactionCalls).toBe(6); // withSerializableRetry's own DEFAULT_MAX_RETRIES, never exceeded
    const count = await db.tutoringRequest.count({ where: { studentProfileId: student.studentProfile.id } });
    expect(count).toBe(0);
  });

  it("Uncontended path is unchanged: no retry, no guard cost when there is genuinely no active request", async () => {
    const student = await createSelfManagedStudent();
    const quote = await makeQuote(student.user.id, student.studentProfile.id);
    const original = ambientDb.$transaction.bind(ambientDb);
    let transactionCalls = 0;
    (ambientDb as unknown as { $transaction: typeof ambientDb.$transaction }).$transaction = ((...args: Parameters<typeof original>) => {
      transactionCalls++;
      return (original as (...a: Parameters<typeof original>) => ReturnType<typeof original>)(...args);
    }) as typeof ambientDb.$transaction;

    let request: Awaited<ReturnType<typeof createTutoringRequestForLearnerInOwnTransaction>>;
    try {
      request = await createRequestWithRetry(baseInput(student.user.id, student.studentProfile.id, quote.id));
    } finally {
      ambientDb.$transaction = original;
    }
    createdTutoringRequestIds.push(request.id);
    expect(transactionCalls).toBe(1); // no retry on the uncontended path
    expect(request.status).toBe("PRICED");
    expect(request.customerPriceQuoteId).toBe(quote.id);
  });

  it("NotAuthorizedForLearnerError still fires first when the actor has no authority, even if a duplicate would also apply", async () => {
    // An actor with no relationship at all to the student — authorization
    // failure must win over the (irrelevant, since unauthorized) duplicate
    // question. Directly exercises createTutoringRequestForLearner's own
    // ordering (authorize, then guard) against a fresh tx.
    const student = await createSelfManagedStudent();
    const stranger = await db.user.create({ data: { email: uniqueEmail("stranger"), role: "STUDENT" } });
    createdUserIds.push(stranger.id);
    const quote = await makeQuote(stranger.id, student.studentProfile.id);

    await expect(
      db.$transaction((tx) =>
        createTutoringRequestForLearner(tx, baseInput(stranger.id, student.studentProfile.id, quote.id))
      )
    ).rejects.toBeInstanceOf(NotAuthorizedForLearnerError);

    const count = await db.tutoringRequest.count({ where: { studentProfileId: student.studentProfile.id } });
    expect(count).toBe(0);
  });
});
