import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";

// Phase 5B — Session Outcome -> Tutor Earning Convergence Engine. Mirrors
// sessionLifecyclePhase4.integration.test.ts's own DB-target-redirection
// technique exactly (resolveVerifiedTestDatabase, tracked-id cleanup
// arrays, ambient @/lib/db singleton redirected to futuretutor_test BEFORE
// any transitively-DB-touching module is imported). No Stripe side effects
// anywhere in this file (task §12/§16) — @/lib/stripe is mocked and never
// given a real implementation; nothing here calls createTransferForEarning
// or processEligibleTransfers's Stripe-touching half.

vi.mock("@/lib/stripe", () => ({ getStripeClient: vi.fn() }));

let createCustomerPriceQuote: typeof import("./customerPricing").createCustomerPriceQuote;
let createTutorPayoutQuote: typeof import("./tutorPayout").createTutorPayoutQuote;
let reserveBookingPendingPayment: typeof import("./bookingCreation").reserveBookingPendingPayment;
let convergeToCaptured: typeof import("./payments").convergeToCaptured;
let cancelBookingWithRefund: typeof import("./cancellationPolicy").cancelBookingWithRefund;
let recordSessionCheckIn: typeof import("./sessionLifecycle").recordSessionCheckIn;
let resolveSessionNoShowConvergence: typeof import("./sessionLifecycle").resolveSessionNoShowConvergence;
let resolveSessionCompletionConvergence: typeof import("./sessionLifecycle").resolveSessionCompletionConvergence;
let requestSessionInterruption: typeof import("./sessionLifecycle").requestSessionInterruption;
let computeNoShowGraceDeadline: typeof import("./sessionLifecycle").computeNoShowGraceDeadline;
let convergeTutorEarningFromSession: typeof import("./tutorEarningConvergence").convergeTutorEarningFromSession;
let sweepTutorEarningConvergence: typeof import("./tutorEarningConvergence").sweepTutorEarningConvergence;
let TUTOR_EARNING_FINANCIAL_DELAY_MS: typeof import("./tutorEarningConvergence").TUTOR_EARNING_FINANCIAL_DELAY_MS;
let markEligibleEarnings: typeof import("./tutorEarningConvergence").markEligibleEarnings;
let processFinancialConvergenceAndEligibility: typeof import("./tutorEarningConvergence").processFinancialConvergenceAndEligibility;
let processEligibleTransfers: typeof import("./tutorTransfers").processEligibleTransfers;
let createTransferForEarning: typeof import("./tutorTransfers").createTransferForEarning;
let sweepPostTransferPaymentSafety: typeof import("./tutorTransferReconciliation").sweepPostTransferPaymentSafety;
let getStripeClient: typeof import("@/lib/stripe").getStripeClient;
let withSerializableRetry: typeof import("@/lib/serializableRetry").withSerializableRetry;

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
  ({ recordSessionCheckIn, resolveSessionNoShowConvergence, resolveSessionCompletionConvergence, requestSessionInterruption, computeNoShowGraceDeadline } =
    await import("./sessionLifecycle"));
  ({ convergeTutorEarningFromSession, sweepTutorEarningConvergence, markEligibleEarnings, processFinancialConvergenceAndEligibility, TUTOR_EARNING_FINANCIAL_DELAY_MS } =
    await import("./tutorEarningConvergence"));
  ({ processEligibleTransfers, createTransferForEarning } = await import("./tutorTransfers"));
  ({ sweepPostTransferPaymentSafety } = await import("./tutorTransferReconciliation"));
  ({ withSerializableRetry } = await import("@/lib/serializableRetry"));
  ({ getStripeClient } = await import("@/lib/stripe"));

  const { db: ambientDb } = await import("@/lib/db");
  const [{ current_database: ambientDatabaseName }] = await ambientDb.$queryRaw<
    Array<{ current_database: string }>
  >`SELECT current_database()`;
  if (ambientDatabaseName !== target.databaseName) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton reports current_database() = "${ambientDatabaseName}", but the verified test database is "${target.databaseName}". Refusing to run any Phase 5B integration test.`
    );
  }
  const devDatabaseNameForSafetyCheckOnly = devDatabaseUrlForSafetyCheckOnly
    ? new URL(devDatabaseUrlForSafetyCheckOnly).pathname.replace(/^\//, "")
    : null;
  if (devDatabaseNameForSafetyCheckOnly && ambientDatabaseName === devDatabaseNameForSafetyCheckOnly) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton's current_database() ("${ambientDatabaseName}") equals the real development database name. Refusing to run any Phase 5B integration test.`
    );
  }

  const subject = await db.subject.create({ data: { slug: `p5b-it-subject-${randomUUID()}`, sortOrder: 999 } });
  subjectId = subject.id;
  const level = await db.academicLevel.create({ data: { slug: `p5b-it-level-${randomUUID()}`, sortOrder: 999 } });
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
  vi.mocked((await import("@/lib/stripe")).getStripeClient).mockReset();
  if (createdBookingIds.length > 0) {
    await db.auditLog.deleteMany({ where: { entityId: { in: createdBookingIds } } });
    const sessionIds = (await db.session_.findMany({ where: { bookingId: { in: createdBookingIds } }, select: { id: true } })).map((s) => s.id);
    if (sessionIds.length > 0) {
      await db.auditLog.deleteMany({ where: { entityId: { in: sessionIds } } });
    }
    const earningIds = (await db.tutorEarning.findMany({ where: { bookingId: { in: createdBookingIds } }, select: { id: true } })).map((e) => e.id);
    if (earningIds.length > 0) {
      await db.auditLog.deleteMany({ where: { entityId: { in: earningIds } } });
      await db.tutorTransfer.deleteMany({ where: { tutorEarningId: { in: earningIds } } });
    }
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
  return `p5b-it-${prefix}-${randomUUID()}@futuretutor.test`;
}

async function createTutorUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("tutor"), role: "TUTOR" } });
  createdUserIds.push(user.id);
  const tutorProfile = await db.tutorProfile.create({
    data: { userId: user.id, slug: `p5b-it-tutor-${randomUUID()}`, applicationStatus: "APPROVED", payoutTier: "NEW", learningMode: "BOTH" },
  });
  createdTutorProfileIds.push(tutorProfile.id);
  return { user, tutorProfile };
}

/** TUTOR-TRANSFER-RECONCILIATION1 — the isolated test database has no
 * seeded ADMIN/SUPER_ADMIN users, but flagTutorTransferForManualReview and
 * sweepPostTransferPaymentSafety both notify every ADMIN/SUPER_ADMIN —
 * tests that assert on that notification need at least one real admin to
 * exist. Tracked for the same afterEach cleanup as every other fixture
 * user. */
async function createAdminUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("admin"), role: "ADMIN" } });
  createdUserIds.push(user.id);
  return { user };
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
    data: { id: randomUUID(), customerPriceQuoteId: quoteId, payerUserId, amountCents: quote.totalCents, currency: quote.currency, status: "AUTHORIZED", authorizedAt: new Date(), stripePaymentIntentId: `pi_test_${randomUUID()}` },
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
  // BETA-1 / P1-02 — wrapped in withSerializableRetry: reserveBookingPendingPayment
  // now also writes CustomerPriceQuote/TutorPayoutQuote inside this same
  // transaction (see that function's own doc comment), which increases
  // real contention surface under this suite's parallel test execution
  // against a shared test database — exposing genuine, expected Postgres
  // Serializable write-conflicts (P2034) that this helper, unlike the
  // production call sites it mirrors, was not previously wrapped to
  // survive. Matches the exact established pattern already used by
  // bookingCreationConcurrency.integration.test.ts's reserveDirectBookingWithRetry.
  const booking = await withSerializableRetry(() =>
    db.$transaction(
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
    )
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
  const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
  return { tutor, student, payment: finalPayment, booking };
}

async function bringToInProgress(
  tutor: { user: { id: string } },
  student: { user: { id: string } },
  booking: { id: string; startAt: Date },
  clock: () => Date = () => booking.startAt
) {
  await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR", clock });
  await recordSessionCheckIn(booking.id, student.user.id, "STUDENT", { actorRole: "STUDENT", clock });
}

async function getEarning(bookingId: string) {
  return db.tutorEarning.findUniqueOrThrow({ where: { bookingId } });
}

async function getSession(bookingId: string) {
  return db.session_.findUniqueOrThrow({ where: { bookingId } });
}

// ===========================================================================
// Required Test Matrix (task §15), numbered to match the spec exactly.
// ===========================================================================

describe("Phase 5B — 1/2. SCHEDULED / IN_PROGRESS never become ELIGIBLE from time alone", () => {
  it("1. SCHEDULED session, far-past manually-set eligibleAt -> convergence reports NOT_DUE, sweep never promotes", async () => {
    const { booking } = await setupConfirmedCapturedBooking();
    const earning = await getEarning(booking.id);
    expect(earning.eligibleAt).toBeNull();
    await db.tutorEarning.update({ where: { id: earning.id }, data: { eligibleAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } });

    const result = await convergeTutorEarningFromSession(booking.id);
    expect(result.outcome).toBe("NOT_DUE");
    expect(result.mutated).toBe(false);

    const promoted = await markEligibleEarnings();
    void promoted;
    const final = await getEarning(booking.id);
    expect(final.status).toBe("PENDING_ELIGIBLE");
  });

  it("2. IN_PROGRESS session, far-past manually-set eligibleAt -> convergence reports NOT_DUE, sweep never promotes", async () => {
    const { tutor, student, booking } = await setupConfirmedCapturedBooking();
    await bringToInProgress(tutor, student, booking);
    const session = await getSession(booking.id);
    expect(session.status).toBe("IN_PROGRESS");

    const earning = await getEarning(booking.id);
    await db.tutorEarning.update({ where: { id: earning.id }, data: { eligibleAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } });

    const result = await convergeTutorEarningFromSession(booking.id);
    expect(result.outcome).toBe("NOT_DUE");

    await markEligibleEarnings();
    const final = await getEarning(booking.id);
    expect(final.status).toBe("PENDING_ELIGIBLE");
  });
});

describe("Phase 5B — 3/4. COMPLETED: prerequisite first, delay second", () => {
  it("3. COMPLETED before the financial delay has elapsed -> eligibleAt set, but not yet promoted to ELIGIBLE", async () => {
    const { tutor, student, booking } = await setupConfirmedCapturedBooking();
    await bringToInProgress(tutor, student, booking);
    const completion = await resolveSessionCompletionConvergence(booking.id, { clock: () => booking.endAt });
    expect(completion.decision).toBe("COMPLETE");

    const result = await convergeTutorEarningFromSession(booking.id);
    expect(result.outcome).toBe("ELIGIBLE_AT_SET_VIA_COMPLETION");
    expect(result.eligibleAt?.getTime()).toBe(completion.completedAt!.getTime() + TUTOR_EARNING_FINANCIAL_DELAY_MS);
    expect(result.earningStatus).toBe("PENDING_ELIGIBLE");

    await markEligibleEarnings();
    const final = await getEarning(booking.id);
    // completedAt was "now" (booking.endAt, effectively immediate) + 24h is
    // still in the future relative to real wall-clock time -> not yet due.
    expect(final.status).toBe("PENDING_ELIGIBLE");
  });

  it("4. COMPLETED after the financial delay has elapsed -> promoted to ELIGIBLE", async () => {
    // A real past startAt (30h ago) is required so that (a) the completion
    // decision's own >= booking.endAt gate can actually fire at a clock
    // value that is (b) also more than 24 real-wall-clock-hours in the
    // past, so the resulting eligibleAt anchor (completedAt + 24h) is
    // already due by the time markEligibleEarnings runs below.
    const pastStartAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const { tutor, student, booking } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
    await bringToInProgress(tutor, student, booking, () => pastStartAt);
    const completion = await resolveSessionCompletionConvergence(booking.id, { clock: () => booking.endAt });
    expect(completion.transitioned).toBe(true);

    const converge = await convergeTutorEarningFromSession(booking.id);
    expect(converge.outcome).toBe("ELIGIBLE_AT_SET_VIA_COMPLETION");
    expect(converge.eligibleAt!.getTime()).toBeLessThan(Date.now());

    const promoted = await markEligibleEarnings();
    expect(promoted).toBeGreaterThanOrEqual(1);
    const final = await getEarning(booking.id);
    expect(final.status).toBe("ELIGIBLE");
  });
});

describe("Phase 5B — 5. STUDENT_NO_SHOW preserves normal tutor earning after the existing delay", () => {
  it("5. STUDENT_NO_SHOW, delay elapsed -> eligibleAt anchored to noShowConvergedAt, promotable to ELIGIBLE", async () => {
    const { tutor, booking } = await setupConfirmedCapturedBooking();
    await recordSessionCheckIn(booking.id, tutor.user.id, "TUTOR", { actorRole: "TUTOR" });
    const deadline = computeNoShowGraceDeadline(booking.startAt);
    const noShow = await resolveSessionNoShowConvergence(booking.id, { clock: () => deadline });
    expect(noShow.decision).toBe("STUDENT_NO_SHOW");

    const converge = await convergeTutorEarningFromSession(booking.id);
    expect(converge.outcome).toBe("ELIGIBLE_AT_SET_VIA_STUDENT_NO_SHOW");
    const session = await getSession(booking.id);
    expect(converge.eligibleAt!.getTime()).toBe(session.noShowConvergedAt!.getTime() + TUTOR_EARNING_FINANCIAL_DELAY_MS);

    // Force the anchor into the past to exercise the actual promotion path
    // deterministically (rather than waiting 24 real hours in a test).
    await db.tutorEarning.update({
      where: { bookingId: booking.id },
      data: { eligibleAt: new Date(Date.now() - 1000) },
    });
    await markEligibleEarnings();
    const final = await getEarning(booking.id);
    expect(final.status).toBe("ELIGIBLE");
  });
});

describe("Phase 5B — 6. TUTOR_NO_SHOW never payable from time alone", () => {
  it("6. TUTOR_NO_SHOW -> HELD, eligibleAt null, never promotable", async () => {
    const { student, booking } = await setupConfirmedCapturedBooking();
    await recordSessionCheckIn(booking.id, student.user.id, "STUDENT", { actorRole: "STUDENT" });
    const deadline = computeNoShowGraceDeadline(booking.startAt);
    const noShow = await resolveSessionNoShowConvergence(booking.id, { clock: () => deadline });
    expect(noShow.decision).toBe("TUTOR_NO_SHOW");

    const converge = await convergeTutorEarningFromSession(booking.id);
    expect(converge.outcome).toBe("HELD_VIA_TUTOR_NO_SHOW");
    expect(converge.earningStatus).toBe("HELD");
    expect(converge.eligibleAt).toBeNull();

    await markEligibleEarnings();
    const final = await getEarning(booking.id);
    expect(final.status).toBe("HELD");
    expect(final.eligibleAt).toBeNull();
  });
});

describe("Phase 5B — 7. NO_SHOW_UNRESOLVED never decides refund liability", () => {
  it("7. NO_SHOW_UNRESOLVED -> HELD, eligibleAt null", async () => {
    const { booking } = await setupConfirmedCapturedBooking();
    const deadline = computeNoShowGraceDeadline(booking.startAt);
    const noShow = await resolveSessionNoShowConvergence(booking.id, { clock: () => deadline });
    expect(noShow.decision).toBe("NO_SHOW_UNRESOLVED");

    const converge = await convergeTutorEarningFromSession(booking.id);
    expect(converge.outcome).toBe("HELD_VIA_NO_SHOW_UNRESOLVED");
    expect(converge.earningStatus).toBe("HELD");
    expect(converge.eligibleAt).toBeNull();
  });
});

describe("Phase 5B — 8. INTERRUPTED never auto-paid, never prorated", () => {
  it("8. INTERRUPTED -> HELD, eligibleAt null", async () => {
    const { tutor, student, booking } = await setupConfirmedCapturedBooking();
    await bringToInProgress(tutor, student, booking);
    await requestSessionInterruption(booking.id, tutor.user.id, { actorRole: "TUTOR", reason: "connection lost" });

    const converge = await convergeTutorEarningFromSession(booking.id);
    expect(converge.outcome).toBe("HELD_VIA_INTERRUPTED");
    expect(converge.earningStatus).toBe("HELD");
    expect(converge.eligibleAt).toBeNull();
  });
});

describe("Phase 5B — 9. Duplicate convergence is idempotent", () => {
  it("9a. Repeated convergence of a COMPLETED session never re-writes eligibleAt or double-fires", async () => {
    const { tutor, student, booking } = await setupConfirmedCapturedBooking();
    await bringToInProgress(tutor, student, booking);
    await resolveSessionCompletionConvergence(booking.id, { clock: () => booking.endAt });

    const first = await convergeTutorEarningFromSession(booking.id);
    expect(first.outcome).toBe("ELIGIBLE_AT_SET_VIA_COMPLETION");
    expect(first.mutated).toBe(true);

    const second = await convergeTutorEarningFromSession(booking.id);
    expect(second.outcome).toBe("ELIGIBLE_AT_ALREADY_SET");
    expect(second.mutated).toBe(false);
    expect(second.eligibleAt!.getTime()).toBe(first.eligibleAt!.getTime());
  });

  it("9b. Repeated convergence of a TUTOR_NO_SHOW session never double-fires", async () => {
    const { student, booking } = await setupConfirmedCapturedBooking();
    await recordSessionCheckIn(booking.id, student.user.id, "STUDENT", { actorRole: "STUDENT" });
    const deadline = computeNoShowGraceDeadline(booking.startAt);
    await resolveSessionNoShowConvergence(booking.id, { clock: () => deadline });

    const first = await convergeTutorEarningFromSession(booking.id);
    expect(first.outcome).toBe("HELD_VIA_TUTOR_NO_SHOW");
    expect(first.mutated).toBe(true);

    const second = await convergeTutorEarningFromSession(booking.id);
    expect(second.outcome).toBe("HELD_ALREADY");
    expect(second.mutated).toBe(false);
  });

  it("9c. Repeated convergence of an INTERRUPTED session never double-fires", async () => {
    const { tutor, student, booking } = await setupConfirmedCapturedBooking();
    await bringToInProgress(tutor, student, booking);
    await requestSessionInterruption(booking.id, tutor.user.id, { actorRole: "TUTOR" });

    const first = await convergeTutorEarningFromSession(booking.id);
    expect(first.mutated).toBe(true);
    const second = await convergeTutorEarningFromSession(booking.id);
    expect(second.outcome).toBe("HELD_ALREADY");
    expect(second.mutated).toBe(false);
  });
});

describe("Phase 5B — 10. TRANSFERRED firewall: never clawed back, conflicts flagged not corrected", () => {
  it("10. TRANSFERRED earning whose Session is TUTOR_NO_SHOW -> untouched, reconciliation required", async () => {
    const { student, booking } = await setupConfirmedCapturedBooking();
    await recordSessionCheckIn(booking.id, student.user.id, "STUDENT", { actorRole: "STUDENT" });
    const deadline = computeNoShowGraceDeadline(booking.startAt);
    await resolveSessionNoShowConvergence(booking.id, { clock: () => deadline });

    // Force TRANSFERRED directly — simulates a legacy/pre-Phase-5B earning
    // that was already paid out before this Session's outcome was known.
    const earningBefore = await getEarning(booking.id);
    await db.tutorEarning.update({ where: { id: earningBefore.id }, data: { status: "TRANSFERRED", transferredAt: new Date() } });

    const result = await convergeTutorEarningFromSession(booking.id);
    expect(result.outcome).toBe("TRANSFERRED_RECONCILIATION_REQUIRED");
    expect(result.reconciliationRequired).toBe(true);
    expect(result.mutated).toBe(false);
    expect(result.earningStatus).toBe("TRANSFERRED");

    const final = await getEarning(booking.id);
    expect(final.status).toBe("TRANSFERRED"); // never clawed back, never HELD
    expect(final.eligibleAt).toBe(earningBefore.eligibleAt);
  });

  it("10b. TRANSFERRED earning whose Session is COMPLETED -> untouched, no reconciliation flagged (consistent)", async () => {
    const { tutor, student, booking } = await setupConfirmedCapturedBooking();
    await bringToInProgress(tutor, student, booking);
    await resolveSessionCompletionConvergence(booking.id, { clock: () => booking.endAt });

    const earningBefore = await getEarning(booking.id);
    await db.tutorEarning.update({ where: { id: earningBefore.id }, data: { status: "TRANSFERRED", transferredAt: new Date() } });

    const result = await convergeTutorEarningFromSession(booking.id);
    expect(result.outcome).toBe("TRANSFERRED_CONSISTENT");
    expect(result.reconciliationRequired).toBe(false);
    expect(result.mutated).toBe(false);
  });
});

describe("Phase 5B — 11. CANCELLED earning firewall (H.8 semantics preserved)", () => {
  it("11. CANCELLED earning is preserved untouched by convergence, regardless of Session state", async () => {
    const { student, booking } = await setupConfirmedCapturedBooking();
    await cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" });

    const earningBefore = await getEarning(booking.id);
    expect(earningBefore.status).toBe("CANCELLED");

    const result = await convergeTutorEarningFromSession(booking.id);
    expect(result.outcome).toBe("CANCELLED_EARNING_PRESERVED");
    expect(result.mutated).toBe(false);

    const final = await getEarning(booking.id);
    expect(final.status).toBe("CANCELLED");
    expect(final.cancelledAt?.getTime()).toBe(earningBefore.cancelledAt?.getTime());
  });
});

describe("Phase 5B — 12-15. Concurrency: financial convergence races Session Lifecycle writers", () => {
  it("12. Concurrent completion convergence vs financial convergence -> exactly one consistent final financial state", async () => {
    const { tutor, student, booking } = await setupConfirmedCapturedBooking();
    await bringToInProgress(tutor, student, booking);

    await Promise.allSettled([
      resolveSessionCompletionConvergence(booking.id, { clock: () => booking.endAt }),
      convergeTutorEarningFromSession(booking.id),
    ]);
    // Self-heal: whichever ran first, a second convergence call always
    // reaches the correct final state (lazy convergence never gets stuck).
    const settled = await convergeTutorEarningFromSession(booking.id);
    expect(["ELIGIBLE_AT_SET_VIA_COMPLETION", "ELIGIBLE_AT_ALREADY_SET"]).toContain(settled.outcome);
    expect(settled.earningStatus).toBe("PENDING_ELIGIBLE");
    expect(settled.eligibleAt).not.toBeNull();
  });

  it("13. Concurrent no-show convergence vs financial convergence -> exactly one consistent final financial state", async () => {
    const { student, booking } = await setupConfirmedCapturedBooking();
    await recordSessionCheckIn(booking.id, student.user.id, "STUDENT", { actorRole: "STUDENT" });
    const deadline = computeNoShowGraceDeadline(booking.startAt);

    await Promise.allSettled([
      resolveSessionNoShowConvergence(booking.id, { clock: () => deadline }),
      convergeTutorEarningFromSession(booking.id),
    ]);
    const settled = await convergeTutorEarningFromSession(booking.id);
    expect(["HELD_VIA_TUTOR_NO_SHOW", "HELD_ALREADY"]).toContain(settled.outcome);
    expect(settled.earningStatus).toBe("HELD");
    expect(settled.eligibleAt).toBeNull();
  });

  it("14. Concurrent interruption vs financial convergence -> exactly one consistent final financial state", async () => {
    const { tutor, student, booking } = await setupConfirmedCapturedBooking();
    await bringToInProgress(tutor, student, booking);

    await Promise.allSettled([
      requestSessionInterruption(booking.id, tutor.user.id, { actorRole: "TUTOR" }),
      convergeTutorEarningFromSession(booking.id),
    ]);
    const settled = await convergeTutorEarningFromSession(booking.id);
    expect(["HELD_VIA_INTERRUPTED", "HELD_ALREADY", "NOT_DUE"]).toContain(settled.outcome);
    // NOT_DUE only possible if the interruption request itself hadn't
    // committed yet at the time of the LAST settle call, which cannot
    // happen since requestSessionInterruption is awaited via allSettled
    // before this final call — asserted strictly below instead.
    const session = await getSession(booking.id);
    expect(session.status).toBe("INTERRUPTED");
    expect(settled.earningStatus).toBe("HELD");
    expect(settled.eligibleAt).toBeNull();
  });

  it("15. Concurrent cancellation vs financial convergence -> earning always ends CANCELLED, never HELD/ELIGIBLE", async () => {
    vi.mocked((await import("@/lib/stripe")).getStripeClient).mockReturnValue({
      refunds: { create: vi.fn(async () => ({ id: `re_fake_${randomUUID()}`, status: "succeeded" })) },
      paymentIntents: { cancel: vi.fn(), retrieve: vi.fn() },
    } as never);

    const { student, booking } = await setupConfirmedCapturedBooking();

    await Promise.allSettled([
      cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" }),
      convergeTutorEarningFromSession(booking.id),
    ]);

    const final = await getEarning(booking.id);
    expect(final.status).toBe("CANCELLED");
  });
});

describe("Phase 5B — 16. Legacy PENDING_ELIGIBLE rows with a stale eligibleAt never become eligible from time alone", () => {
  it("16. A SCHEDULED session's earning with a legacy (pre-Phase-5B-style) eligibleAt is never promoted by the sweep", async () => {
    const { booking } = await setupConfirmedCapturedBooking();
    const earning = await getEarning(booking.id);
    // Simulate the pre-Phase-5B writer: a populated, wall-clock-derived
    // eligibleAt at creation time, with the Session never having converged.
    await db.tutorEarning.update({
      where: { id: earning.id },
      data: { eligibleAt: new Date(booking.endAt.getTime() + TUTOR_EARNING_FINANCIAL_DELAY_MS - 60 * 24 * 60 * 60 * 1000) },
    });

    await markEligibleEarnings();
    const final = await getEarning(booking.id);
    expect(final.status).toBe("PENDING_ELIGIBLE");

    // The convergence engine itself also never rewrites this legacy value
    // (write-once guard: eligibleAt must be null to fire the ELIGIBLE_AT_*
    // branch) — Session_ is still SCHEDULED so it reports NOT_DUE anyway.
    const converge = await convergeTutorEarningFromSession(booking.id);
    expect(converge.outcome).toBe("NOT_DUE");
    const stillLegacy = await getEarning(booking.id);
    expect(stillLegacy.eligibleAt!.getTime()).toBe(final.eligibleAt!.getTime());
  });
});

describe("Phase 5B — 17. New earning creation", () => {
  it("17. A freshly captured booking's TutorEarning starts PENDING_ELIGIBLE with a null eligibleAt", async () => {
    const { booking } = await setupConfirmedCapturedBooking();
    const earning = await getEarning(booking.id);
    expect(earning.status).toBe("PENDING_ELIGIBLE");
    expect(earning.eligibleAt).toBeNull();
  });
});

describe("Phase 5B — 18. Eligibility sweep cannot bypass Session truth", () => {
  it("18. A mixed batch of PENDING_ELIGIBLE earnings, all with a past eligibleAt, is promoted ONLY where Session truth actually permits it", async () => {
    // (a) SCHEDULED — never promoted.
    const scheduled = await setupConfirmedCapturedBooking();
    await db.tutorEarning.update({ where: { bookingId: scheduled.booking.id }, data: { eligibleAt: new Date(Date.now() - 1000) } });

    // (b) COMPLETED, delay elapsed — promoted. Needs a real past startAt so
    // the completion decision's own >= booking.endAt gate can fire at a
    // clock value also more than 24 real-wall-clock-hours in the past.
    const completedPastStartAt = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const completed = await setupConfirmedCapturedBooking({ startAt: completedPastStartAt });
    await bringToInProgress(completed.tutor, completed.student, completed.booking, () => completedPastStartAt);
    await resolveSessionCompletionConvergence(completed.booking.id, { clock: () => completed.booking.endAt });
    await convergeTutorEarningFromSession(completed.booking.id);

    // (c) TUTOR_NO_SHOW — self-heals to HELD via the sweep's own convergence pass, never promoted.
    const tutorNoShow = await setupConfirmedCapturedBooking();
    await recordSessionCheckIn(tutorNoShow.booking.id, tutorNoShow.student.user.id, "STUDENT", { actorRole: "STUDENT" });
    const deadline = computeNoShowGraceDeadline(tutorNoShow.booking.startAt);
    await resolveSessionNoShowConvergence(tutorNoShow.booking.id, { clock: () => deadline });
    await db.tutorEarning.update({ where: { bookingId: tutorNoShow.booking.id }, data: { eligibleAt: new Date(Date.now() - 1000) } });

    // (d) INTERRUPTED — never promoted.
    const interrupted = await setupConfirmedCapturedBooking();
    await bringToInProgress(interrupted.tutor, interrupted.student, interrupted.booking);
    await requestSessionInterruption(interrupted.booking.id, interrupted.tutor.user.id, { actorRole: "TUTOR" });
    await db.tutorEarning.update({ where: { bookingId: interrupted.booking.id }, data: { eligibleAt: new Date(Date.now() - 1000) } });

    await sweepTutorEarningConvergence();
    await markEligibleEarnings();

    expect((await getEarning(scheduled.booking.id)).status).toBe("PENDING_ELIGIBLE");
    expect((await getEarning(completed.booking.id)).status).toBe("ELIGIBLE");
    expect((await getEarning(tutorNoShow.booking.id)).status).toBe("HELD");
    expect((await getEarning(interrupted.booking.id)).status).toBe("HELD");
  });
});

// ===========================================================================
// Additional coverage beyond the required matrix: architectural boundary and
// the wired sweep entrypoint.
// ===========================================================================

describe("Phase 5B — architectural boundary (task §1)", () => {
  it("Session Lifecycle writers never touch TutorEarning directly — only convergeTutorEarningFromSession does", async () => {
    const { tutor, student, booking } = await setupConfirmedCapturedBooking();
    const before = await getEarning(booking.id);

    await bringToInProgress(tutor, student, booking);
    const afterInProgress = await getEarning(booking.id);
    expect(afterInProgress).toEqual(before);

    await resolveSessionCompletionConvergence(booking.id, { clock: () => booking.endAt });
    const afterCompletion = await getEarning(booking.id);
    expect(afterCompletion).toEqual(before); // completion convergence itself never touches TutorEarning
  });
});

describe("Phase 5B — sweepTutorEarningConvergence converges without any explicit call", () => {
  it("sweepTutorEarningConvergence converges a COMPLETED booking's earning without any explicit call", async () => {
    const { tutor, student, booking } = await setupConfirmedCapturedBooking();
    await bringToInProgress(tutor, student, booking);
    await resolveSessionCompletionConvergence(booking.id, { clock: () => booking.endAt });

    const result = await sweepTutorEarningConvergence();
    expect(result.converged).toBeGreaterThanOrEqual(1);

    const final = await getEarning(booking.id);
    expect(final.eligibleAt).not.toBeNull();
    expect(final.status).toBe("PENDING_ELIGIBLE");
  });
});

describe("FINANCIAL-CONVERGENCE-ROUTE-SEPARATION1 — processFinancialConvergenceAndEligibility vs. processEligibleTransfers separation", () => {
  it("processFinancialConvergenceAndEligibility runs convergence then eligibility promotion, DB-only, with ZERO Stripe calls", async () => {
    const pastStartAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const { tutor, student, booking } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
    await bringToInProgress(tutor, student, booking, () => pastStartAt);
    await resolveSessionCompletionConvergence(booking.id, { clock: () => booking.endAt });

    // Fixture setup itself (payment capture / email dispatch side effects)
    // legitimately touches getStripeClient — clear call history so the
    // assertion below is scoped to ONLY the orchestrator call under test.
    vi.mocked(getStripeClient).mockClear();

    const result = await processFinancialConvergenceAndEligibility();
    expect(result.convergedEarnings).toBeGreaterThanOrEqual(1);
    expect(result.markedEligible).toBeGreaterThanOrEqual(1);
    expect(getStripeClient).not.toHaveBeenCalled(); // runtime proof, not just static — the DB-only orchestrator never reaches Stripe

    const final = await getEarning(booking.id);
    expect(final.status).toBe("ELIGIBLE");
  });

  it("processEligibleTransfers no longer converges or promotes anything itself — it only transfers earnings that are ALREADY ELIGIBLE", async () => {
    const pastStartAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const { tutor, student, booking, payment } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
    await bringToInProgress(tutor, student, booking, () => pastStartAt);
    await resolveSessionCompletionConvergence(booking.id, { clock: () => booking.endAt });
    // createTransferForEarning defers (never reaches Stripe) unless the
    // tutor's Connect account is ACTIVE with an account id, AND
    // Payment.stripeChargeId is resolvable — neither is true for this
    // fixture by default (createTutorUser leaves stripeConnectStatus at its
    // schema default, and the fake stripePaymentIntentId can't be resolved
    // against the mocked Stripe client). Set both directly here to reach
    // the actual transfer call this test exists to prove.
    await db.tutorProfile.update({
      where: { id: tutor.tutorProfile.id },
      data: { stripeConnectStatus: "ACTIVE", stripeConnectAccountId: `acct_fake_${randomUUID()}` },
    });
    await db.payment.update({ where: { id: payment.id }, data: { stripeChargeId: `ch_fake_${randomUUID()}` } });

    // The financial delay has already elapsed (bookingStartAt is 30h in the
    // past), so if processEligibleTransfers still silently converged +
    // promoted on its own, this earning would be ELIGIBLE by the time we
    // check below. It must not be — convergence/eligibility now require an
    // explicit, separate call to processFinancialConvergenceAndEligibility.
    const beforeAnyTransferSweep = await getEarning(booking.id);
    expect(beforeAnyTransferSweep.status).toBe("PENDING_ELIGIBLE");
    expect(beforeAnyTransferSweep.eligibleAt).toBeNull();

    // Fixture setup itself (payment capture / email dispatch side effects)
    // legitimately touches getStripeClient — clear call history so the
    // assertions below are scoped to the transfer/convergence calls under
    // test, not ambient setup activity.
    vi.mocked(getStripeClient).mockClear();
    vi.mocked(getStripeClient).mockReturnValue({
      transfers: { create: vi.fn(async () => ({ id: `tr_fake_${randomUUID()}` })) },
    } as never);

    const transferResultBeforeConvergence = await processEligibleTransfers();
    expect(transferResultBeforeConvergence.transfersAttempted).toBe(0);
    expect(getStripeClient).not.toHaveBeenCalled(); // nothing was ELIGIBLE yet, so createTransferForEarning never even reached the Stripe call

    const stillUnconverged = await getEarning(booking.id);
    expect(stillUnconverged.status).toBe("PENDING_ELIGIBLE");
    expect(stillUnconverged.eligibleAt).toBeNull();

    // Now run the separated DB-only orchestrator explicitly, THEN the
    // transfer sweep — this is the real two-cron shape this mission wires.
    await processFinancialConvergenceAndEligibility();
    const eligible = await getEarning(booking.id);
    expect(eligible.status).toBe("ELIGIBLE");

    const transferResultAfterConvergence = await processEligibleTransfers();
    expect(transferResultAfterConvergence.transfersAttempted).toBeGreaterThanOrEqual(1);
    expect(getStripeClient).toHaveBeenCalled(); // only NOW, from the transfer step, never from convergence/eligibility
  });
});

describe("FINANCIAL-CONVERGENCE-ROUTE-SEPARATION1 — Phase 5 behavior test G: repeated eligibility sweep is idempotent", () => {
  it("a second markEligibleEarnings() call after promotion is a pure no-op — same ELIGIBLE status, same (unchanged) row", async () => {
    const pastStartAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const { tutor, student, booking } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
    await bringToInProgress(tutor, student, booking, () => pastStartAt);
    await resolveSessionCompletionConvergence(booking.id, { clock: () => booking.endAt });
    await sweepTutorEarningConvergence();

    const firstPromoted = await markEligibleEarnings();
    expect(firstPromoted).toBeGreaterThanOrEqual(1);
    const afterFirst = await getEarning(booking.id);
    expect(afterFirst.status).toBe("ELIGIBLE");

    const secondPromoted = await markEligibleEarnings();
    const afterSecond = await getEarning(booking.id);
    // The guarded updateMany's own `where: { status: "PENDING_ELIGIBLE", ... }`
    // no longer matches an already-ELIGIBLE row, so the second sweep cannot
    // touch it again — this specific earning contributes 0 to the second
    // call's count (other unrelated PENDING_ELIGIBLE rows elsewhere in the
    // test DB may still legitimately contribute, so this asserts the ROW,
    // not the global count).
    expect(afterSecond).toEqual(afterFirst);
    void secondPromoted;
  });
});

describe("FINANCIAL-CONVERGENCE-ROUTE-SEPARATION1 — Phase 5 behavior test J: HELD is terminal under current deployed behavior", () => {
  it("a HELD earning (via TUTOR_NO_SHOW) is never reverted or promoted by any further convergence or eligibility sweep", async () => {
    const { student, booking } = await setupConfirmedCapturedBooking();
    await recordSessionCheckIn(booking.id, student.user.id, "STUDENT", { actorRole: "STUDENT" });
    const deadline = computeNoShowGraceDeadline(booking.startAt);
    await resolveSessionNoShowConvergence(booking.id, { clock: () => deadline });
    await convergeTutorEarningFromSession(booking.id);

    const held = await getEarning(booking.id);
    expect(held.status).toBe("HELD");
    expect(held.eligibleAt).toBeNull();

    // Re-run the full DB-only pipeline several times — no writer anywhere
    // in this codebase transitions a HELD earning to any other status
    // (convergeTutorEarningFromSession's own HELD firewall: "every Session
    // state that produces HELD is terminal ... observed and returned
    // as-is"). This is current deployed behavior, not something this
    // mission changes.
    await processFinancialConvergenceAndEligibility();
    await processFinancialConvergenceAndEligibility();
    const stillHeld = await getEarning(booking.id);
    expect(stillHeld).toEqual(held);
  });
});

describe("FINANCIAL-CONVERGENCE-ROUTE-SEPARATION1 — Phase 5 behavior test K: zero Stripe calls across the full convergence decision matrix", () => {
  it("runs every convergence outcome (COMPLETED, STUDENT_NO_SHOW, TUTOR_NO_SHOW, NO_SHOW_UNRESOLVED, INTERRUPTED, SCHEDULED-not-due) through the DB-only orchestrator and asserts getStripeClient was never invoked", async () => {
    const pastStartAt = new Date(Date.now() - 30 * 60 * 60 * 1000);

    const completed = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
    await bringToInProgress(completed.tutor, completed.student, completed.booking, () => pastStartAt);
    await resolveSessionCompletionConvergence(completed.booking.id, { clock: () => completed.booking.endAt });

    const studentNoShow = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
    // A real past startAt means the grace deadline has ALSO already passed
    // in real wall-clock time — recordSessionCheckIn's own embedded lazy
    // no-show convergence would reject the check-in outright unless it is
    // given the same past clock this fixture is deliberately using (matches
    // bringToInProgress's own pattern above for the `completed` fixture).
    await recordSessionCheckIn(studentNoShow.booking.id, studentNoShow.tutor.user.id, "TUTOR", {
      actorRole: "TUTOR",
      clock: () => pastStartAt,
    });
    await resolveSessionNoShowConvergence(studentNoShow.booking.id, { clock: () => computeNoShowGraceDeadline(studentNoShow.booking.startAt) });

    const tutorNoShow = await setupConfirmedCapturedBooking();
    await recordSessionCheckIn(tutorNoShow.booking.id, tutorNoShow.student.user.id, "STUDENT", { actorRole: "STUDENT" });
    await resolveSessionNoShowConvergence(tutorNoShow.booking.id, { clock: () => computeNoShowGraceDeadline(tutorNoShow.booking.startAt) });

    const unresolved = await setupConfirmedCapturedBooking();
    await resolveSessionNoShowConvergence(unresolved.booking.id, { clock: () => computeNoShowGraceDeadline(unresolved.booking.startAt) });

    const interrupted = await setupConfirmedCapturedBooking();
    await bringToInProgress(interrupted.tutor, interrupted.student, interrupted.booking);
    await requestSessionInterruption(interrupted.booking.id, interrupted.tutor.user.id, { actorRole: "TUTOR", reason: "connection lost" });

    const scheduled = await setupConfirmedCapturedBooking();

    // Every fixture's own setup (payment capture / email dispatch side
    // effects) legitimately touches getStripeClient — clear call history so
    // the assertion below is scoped to ONLY the two orchestrator calls.
    vi.mocked(getStripeClient).mockClear();

    // Run the DB-only orchestrator repeatedly — covers first convergence,
    // eligibility promotion, and idempotent re-runs, across every outcome
    // above, all in one sweep pass each time.
    await processFinancialConvergenceAndEligibility();
    await processFinancialConvergenceAndEligibility();

    expect(getStripeClient).not.toHaveBeenCalled();

    // Sanity: confirm the matrix actually exercised every branch (not a
    // vacuous pass because setup silently no-op'd somewhere).
    expect((await getEarning(completed.booking.id)).status).toBe("ELIGIBLE"); // 30h past start + 24h delay has elapsed
    expect((await getEarning(studentNoShow.booking.id)).status).toBe("ELIGIBLE");
    expect((await getEarning(tutorNoShow.booking.id)).status).toBe("HELD");
    expect((await getEarning(unresolved.booking.id)).status).toBe("HELD");
    expect((await getEarning(interrupted.booking.id)).status).toBe("HELD");
    expect((await getEarning(scheduled.booking.id)).status).toBe("PENDING_ELIGIBLE");
  }, 20000); // six real fixtures + two full sweep passes legitimately exceeds the 5000ms default
});

// ===========================================================================
// FINANCIAL-TRANSFER-SAFETY-GATES1 — real-DB integration coverage for the
// two new payment-safety gates. The pure decision-table coverage (every
// PaymentStatus/disputeStatus/refund combination) already lives in
// paymentSafety.test.ts with zero I/O; these tests instead prove the real
// wiring — that markEligibleEarnings and createTransferForEarning actually
// call the predicate against real Payment/Refund rows, in the real
// database, and that createTransferForEarning never reaches Stripe when
// blocked.
// ===========================================================================

async function makeConnectActive(tutorProfileId: string) {
  await db.tutorProfile.update({
    where: { id: tutorProfileId },
    data: { stripeConnectStatus: "ACTIVE", stripeConnectAccountId: `acct_fake_${randomUUID()}` },
  });
}

async function makeChargeResolvable(paymentId: string) {
  await db.payment.update({ where: { id: paymentId }, data: { stripeChargeId: `ch_fake_${randomUUID()}` } });
}

/** Brings a booking's earning all the way to ELIGIBLE via the real pipeline
 * (completion -> convergence -> eligibility promotion), while the Payment
 * is still fully safe — so a test can then mutate Payment/Refund state
 * AFTER the fact to exercise the transfer-time gate specifically. */
async function bringEarningToEligible(tutor: { user: { id: string } }, student: { user: { id: string } }, booking: { id: string; startAt: Date; endAt: Date }) {
  await bringToInProgress(tutor, student, booking, () => booking.startAt);
  await resolveSessionCompletionConvergence(booking.id, { clock: () => booking.endAt });
  const result = await processFinancialConvergenceAndEligibility();
  expect(result.markedEligible).toBeGreaterThanOrEqual(1);
}

describe("FINANCIAL-TRANSFER-SAFETY-GATES1 — eligibility gate (Phase 3, real DB)", () => {
  it("a REFUNDED payment blocks PENDING_ELIGIBLE -> ELIGIBLE promotion, even though eligibleAt is still correctly established", async () => {
    const pastStartAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const { tutor, student, booking, payment } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
    await bringToInProgress(tutor, student, booking, () => pastStartAt);
    await resolveSessionCompletionConvergence(booking.id, { clock: () => booking.endAt });
    await db.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED", refundedAmountCents: payment.amountCents } });

    const result = await processFinancialConvergenceAndEligibility();
    expect(result.convergedEarnings).toBeGreaterThanOrEqual(1); // convergence itself is unaffected — eligibleAt still gets set
    expect(result.markedEligible).toBe(0); // but promotion is blocked

    const final = await getEarning(booking.id);
    expect(final.status).toBe("PENDING_ELIGIBLE"); // never promoted
    expect(final.eligibleAt).not.toBeNull(); // eligibleAt is historical lifecycle truth, untouched by the block

    const auditRow = await db.auditLog.findFirst({
      where: { entityType: "TutorEarning", entityId: final.id, action: "tutor_earning.eligibility_blocked_payment_unsafe" },
    });
    expect(auditRow).not.toBeNull();
    expect((auditRow?.metadata as Record<string, unknown>)?.reason).toBe("PAYMENT_REFUNDED");
  });

  it("an OPEN dispute blocks PENDING_ELIGIBLE -> ELIGIBLE promotion", async () => {
    const pastStartAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const { tutor, student, booking, payment } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
    await bringToInProgress(tutor, student, booking, () => pastStartAt);
    await resolveSessionCompletionConvergence(booking.id, { clock: () => booking.endAt });
    await db.payment.update({ where: { id: payment.id }, data: { disputeStatus: "OPEN" } });

    const result = await processFinancialConvergenceAndEligibility();
    expect(result.markedEligible).toBe(0);

    const final = await getEarning(booking.id);
    expect(final.status).toBe("PENDING_ELIGIBLE");
  });

  it("a safe CAPTURED payment (no refund, no dispute) still promotes normally — no regression", async () => {
    const pastStartAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const { tutor, student, booking } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
    await bringToInProgress(tutor, student, booking, () => pastStartAt);
    await resolveSessionCompletionConvergence(booking.id, { clock: () => booking.endAt });

    const result = await processFinancialConvergenceAndEligibility();
    expect(result.markedEligible).toBeGreaterThanOrEqual(1);
    expect((await getEarning(booking.id)).status).toBe("ELIGIBLE");
  });
});

describe("FINANCIAL-TRANSFER-SAFETY-GATES1 — transfer-time gate (Phase 4/8, real DB, zero-Stripe-call proof)", () => {
  it("Phase 6 scenario D: a PARTIAL refund occurring AFTER an earning is already ELIGIBLE blocks createTransferForEarning — zero Stripe calls", async () => {
    const pastStartAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const { tutor, student, booking, payment } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
    await bringEarningToEligible(tutor, student, booking);
    await makeConnectActive(tutor.tutorProfile.id);
    await makeChargeResolvable(payment.id);

    // The refund happens AFTER eligibility was established — exactly the
    // race this defense-in-depth gate exists for.
    await db.payment.update({ where: { id: payment.id }, data: { status: "PARTIALLY_REFUNDED", refundedAmountCents: 500 } });

    vi.mocked(getStripeClient).mockClear();
    vi.mocked(getStripeClient).mockReturnValue({
      transfers: { create: vi.fn(async () => ({ id: `tr_fake_${randomUUID()}` })) },
    } as never);

    const earningBefore = await getEarning(booking.id);
    await createTransferForEarning(earningBefore.id);

    expect(getStripeClient).not.toHaveBeenCalled();
    const earningAfter = await getEarning(booking.id);
    expect(earningAfter.status).toBe("ELIGIBLE"); // never silently advanced to TRANSFERRED
    const transfer = await db.tutorTransfer.findUnique({ where: { tutorEarningId: earningBefore.id } });
    expect(transfer?.status).not.toBe("COMPLETED"); // no completed transfer exists

    const auditRow = await db.auditLog.findFirst({
      where: { entityType: "TutorTransfer", action: "tutor_transfer.deferred_payment_unsafe" },
      orderBy: { createdAt: "desc" },
    });
    expect(auditRow).not.toBeNull();
    expect((auditRow?.metadata as Record<string, unknown>)?.reason).toBe("PAYMENT_PARTIALLY_REFUNDED");
  });

  it("Phase 6 scenario E: a FULL refund occurring AFTER an earning is already ELIGIBLE blocks createTransferForEarning — zero Stripe calls", async () => {
    const pastStartAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const { tutor, student, booking, payment } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
    await bringEarningToEligible(tutor, student, booking);
    await makeConnectActive(tutor.tutorProfile.id);
    await makeChargeResolvable(payment.id);
    await db.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED", refundedAmountCents: payment.amountCents } });

    vi.mocked(getStripeClient).mockClear();
    vi.mocked(getStripeClient).mockReturnValue({
      transfers: { create: vi.fn(async () => ({ id: `tr_fake_${randomUUID()}` })) },
    } as never);

    const earningBefore = await getEarning(booking.id);
    await createTransferForEarning(earningBefore.id);

    expect(getStripeClient).not.toHaveBeenCalled();
    expect((await getEarning(booking.id)).status).toBe("ELIGIBLE");
  });

  it("Phase 7: a dispute opening AFTER an earning is already ELIGIBLE blocks createTransferForEarning — zero Stripe calls", async () => {
    const pastStartAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const { tutor, student, booking, payment } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
    await bringEarningToEligible(tutor, student, booking);
    await makeConnectActive(tutor.tutorProfile.id);
    await makeChargeResolvable(payment.id);
    await db.payment.update({ where: { id: payment.id }, data: { disputeStatus: "OPEN" } });

    vi.mocked(getStripeClient).mockClear();
    vi.mocked(getStripeClient).mockReturnValue({
      transfers: { create: vi.fn(async () => ({ id: `tr_fake_${randomUUID()}` })) },
    } as never);

    const earningBefore = await getEarning(booking.id);
    await createTransferForEarning(earningBefore.id);

    expect(getStripeClient).not.toHaveBeenCalled();
    expect((await getEarning(booking.id)).status).toBe("ELIGIBLE");
  });

  it("a WON dispute does NOT block createTransferForEarning — reaches the real Stripe call (no regression)", async () => {
    const pastStartAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const { tutor, student, booking, payment } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
    await bringEarningToEligible(tutor, student, booking);
    await makeConnectActive(tutor.tutorProfile.id);
    await makeChargeResolvable(payment.id);
    await db.payment.update({ where: { id: payment.id }, data: { disputeStatus: "WON" } });

    vi.mocked(getStripeClient).mockClear();
    vi.mocked(getStripeClient).mockReturnValue({
      transfers: { create: vi.fn(async () => ({ id: `tr_fake_${randomUUID()}` })) },
    } as never);

    const earningBefore = await getEarning(booking.id);
    await createTransferForEarning(earningBefore.id);

    expect(getStripeClient).toHaveBeenCalled();
    expect((await getEarning(booking.id)).status).toBe("TRANSFERRED");
  });
});

describe("FINANCIAL-TRANSFER-SAFETY-GATES1 — Phase 8: no regression to existing terminal-state invariants", () => {
  it("a HELD earning is unaffected by the new gates — stays HELD regardless of Payment safety", async () => {
    const { student, booking, payment } = await setupConfirmedCapturedBooking();
    await recordSessionCheckIn(booking.id, student.user.id, "STUDENT", { actorRole: "STUDENT" });
    const deadline = computeNoShowGraceDeadline(booking.startAt);
    await resolveSessionNoShowConvergence(booking.id, { clock: () => deadline });
    await convergeTutorEarningFromSession(booking.id);
    expect((await getEarning(booking.id)).status).toBe("HELD");

    await db.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED", refundedAmountCents: payment.amountCents } });
    await processFinancialConvergenceAndEligibility();
    expect((await getEarning(booking.id)).status).toBe("HELD"); // unchanged
  });

  it("a CANCELLED earning is unaffected by the new gates — the H.8 firewall still owns it exclusively", async () => {
    const { booking, payment } = await setupConfirmedCapturedBooking();
    await db.tutorEarning.update({ where: { bookingId: booking.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });

    await db.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED", refundedAmountCents: payment.amountCents } });
    await processFinancialConvergenceAndEligibility();
    expect((await getEarning(booking.id)).status).toBe("CANCELLED"); // unchanged, never touched by the payment-safety gate either
  });

  it("a TRANSFERRED earning is unaffected by the new gates — never clawed back even if a refund appears afterward", async () => {
    const pastStartAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const { tutor, student, booking, payment } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
    await bringEarningToEligible(tutor, student, booking);
    await makeConnectActive(tutor.tutorProfile.id);
    await makeChargeResolvable(payment.id);

    vi.mocked(getStripeClient).mockClear();
    vi.mocked(getStripeClient).mockReturnValue({
      transfers: { create: vi.fn(async () => ({ id: `tr_fake_${randomUUID()}` })) },
    } as never);
    const earning = await getEarning(booking.id);
    await createTransferForEarning(earning.id);
    expect((await getEarning(booking.id)).status).toBe("TRANSFERRED");

    // A refund appears AFTER the transfer already completed — the existing
    // TRANSFERRED-immutable-but-flagged firewall (task §7, pre-existing,
    // unchanged by this mission) owns this, not the new payment-safety
    // gates (which only ever run before promotion/before a transfer
    // attempt, never after one has already completed).
    await db.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED", refundedAmountCents: payment.amountCents } });
    const convergence = await convergeTutorEarningFromSession(booking.id);
    expect(convergence.outcome).toBe("TRANSFERRED_CONSISTENT"); // isSessionEligibleForPayment is about Session truth, not Payment truth — still consistent here
    expect((await getEarning(booking.id)).status).toBe("TRANSFERRED"); // never clawed back
  });
});

// ===========================================================================
// TUTOR-TRANSFER-RECONCILIATION1 — real-DB integration coverage for both
// failure domains: (A) pre/in-flight transfer recovery (bounded retry) and
// (B) post-transfer financial inconsistency detection. The pure
// decision-table coverage for the retry classifier already lives in
// tutorTransferReconciliation.test.ts with zero I/O; these tests prove the
// real wiring against a real database and a mocked Stripe client.
// ===========================================================================

/** Brings a booking's earning all the way to TRANSFERRED via the real
 * pipeline (completion -> convergence -> eligibility -> transfer), with a
 * fixed, known Stripe transfer id so later assertions can confirm exactly
 * one such id ever gets persisted. */
async function bringEarningToTransferred(
  tutor: { user: { id: string }; tutorProfile: { id: string } },
  student: { user: { id: string } },
  booking: { id: string; startAt: Date; endAt: Date },
  payment: { id: string },
  stripeTransferId: string
) {
  await bringEarningToEligible(tutor, student, booking);
  await makeConnectActive(tutor.tutorProfile.id);
  await makeChargeResolvable(payment.id);

  vi.mocked(getStripeClient).mockClear();
  vi.mocked(getStripeClient).mockReturnValue({
    transfers: { create: vi.fn(async () => ({ id: stripeTransferId })) },
  } as never);

  const earning = await getEarning(booking.id);
  await createTransferForEarning(earning.id);
  expect((await getEarning(booking.id)).status).toBe("TRANSFERRED");
}

describe("TUTOR-TRANSFER-RECONCILIATION1 — Phase 11 test 1: clean successful transfer lifecycle", () => {
  it("PENDING_ELIGIBLE -> ELIGIBLE -> TRANSFERRED, exactly one COMPLETED TutorTransfer, exactly one Stripe call", async () => {
    const pastStartAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const { tutor, student, booking, payment } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
    const stripeTransferId = `tr_clean_${randomUUID()}`;
    await bringEarningToTransferred(tutor, student, booking, payment, stripeTransferId);

    const earning = await getEarning(booking.id);
    expect(earning.status).toBe("TRANSFERRED");
    expect(getStripeClient).toHaveBeenCalledTimes(1);

    const transfer = await db.tutorTransfer.findUnique({ where: { tutorEarningId: earning.id } });
    expect(transfer?.status).toBe("COMPLETED");
    expect(transfer?.stripeTransferId).toBe(stripeTransferId);
  });
});

describe("TUTOR-TRANSFER-RECONCILIATION1 — Phase 11 test 2: Stripe fails before creation -> safe retry", () => {
  it("first attempt throws, transfer marked FAILED; a prompt retry (well inside the safe window) succeeds and reaches COMPLETED", async () => {
    const pastStartAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const { tutor, student, booking, payment } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
    await bringEarningToEligible(tutor, student, booking);
    await makeConnectActive(tutor.tutorProfile.id);
    await makeChargeResolvable(payment.id);

    const stripeTransferId = `tr_retry_${randomUUID()}`;
    let callCount = 0;
    vi.mocked(getStripeClient).mockClear();
    vi.mocked(getStripeClient).mockReturnValue({
      transfers: {
        create: vi.fn(async () => {
          callCount++;
          if (callCount === 1) throw new Error("simulated transient Stripe error");
          return { id: stripeTransferId };
        }),
      },
    } as never);

    const earning = await getEarning(booking.id);

    await createTransferForEarning(earning.id); // attempt 1: fails
    expect((await getEarning(booking.id)).status).toBe("ELIGIBLE");
    const afterFirst = await db.tutorTransfer.findUnique({ where: { tutorEarningId: earning.id } });
    expect(afterFirst?.status).toBe("FAILED");

    await createTransferForEarning(earning.id); // attempt 2: succeeds (recent -> RETRYABLE)
    expect((await getEarning(booking.id)).status).toBe("TRANSFERRED");
    const afterSecond = await db.tutorTransfer.findUnique({ where: { tutorEarningId: earning.id } });
    expect(afterSecond?.status).toBe("COMPLETED");
    expect(afterSecond?.stripeTransferId).toBe(stripeTransferId);
    expect(callCount).toBe(2);
  });
});

describe("TUTOR-TRANSFER-RECONCILIATION1 — Phase 11 test 3 / Phase 12: Stripe succeeds, DB finalization fails -> economic exactly-once", () => {
  it("a transfer marked FAILED after Stripe actually already succeeded (simulated) converges to exactly ONE COMPLETED TutorTransfer with the SAME stripeTransferId on retry, via the deterministic idempotency key — never a second transfer", async () => {
    const pastStartAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const { tutor, student, booking, payment } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
    await bringEarningToEligible(tutor, student, booking);
    await makeConnectActive(tutor.tutorProfile.id);
    await makeChargeResolvable(payment.id);
    const earning = await getEarning(booking.id);

    // Simulate "Stripe succeeded, then finalizeTransfer failed" directly:
    // a real Stripe transfer object already exists (fixed id, as Stripe's
    // own idempotent replay would return for a retried key), but the local
    // row was left FAILED because the DB step never committed. This is the
    // exact state createTransferForEarning's own catch block can produce
    // when the error is thrown AFTER a successful stripe.transfers.create.
    const stripeTransferId = `tr_stripe_already_succeeded_${randomUUID()}`;
    await db.tutorTransfer.create({
      data: {
        id: randomUUID(),
        tutorEarningId: earning.id,
        tutorProfileId: tutor.tutorProfile.id,
        amountCents: earning.amountCents,
        currency: earning.currency,
        status: "FAILED",
        initiatedAt: new Date(),
        failedAt: new Date(),
        failureReason: "simulated DB finalization failure after a successful Stripe call",
      },
    });

    // A real Stripe idempotent replay of the SAME key returns the SAME
    // object — this mock enforces that a call with the expected
    // deterministic key always returns the one fixed id, so the test fails
    // loudly if the code ever used a different (non-deterministic) key.
    const observedKeys: string[] = [];
    vi.mocked(getStripeClient).mockClear();
    vi.mocked(getStripeClient).mockReturnValue({
      transfers: {
        create: vi.fn(async (_params: unknown, options: { idempotencyKey: string }) => {
          observedKeys.push(options.idempotencyKey);
          return { id: stripeTransferId }; // Stripe's own dedup: same key -> same object, always
        }),
      },
    } as never);

    await createTransferForEarning(earning.id); // the automatic retry (recent -> RETRYABLE)

    expect((await getEarning(booking.id)).status).toBe("TRANSFERRED");
    const finalTransfer = await db.tutorTransfer.findUnique({ where: { tutorEarningId: earning.id } });
    expect(finalTransfer?.status).toBe("COMPLETED");
    expect(finalTransfer?.stripeTransferId).toBe(stripeTransferId); // the SAME id Stripe already had — no second economic transfer
    expect(observedKeys).toEqual([`transfer:${earning.id}`]); // the deterministic key, unchanged

    // DB exactly-once (structural, always true): exactly one TutorTransfer
    // ROW exists for this earning — enforced by the DB-level unique
    // constraint on tutorEarningId, independent of retry count.
    const allTransfersForEarning = await db.tutorTransfer.findMany({ where: { tutorEarningId: earning.id } });
    expect(allTransfersForEarning.length).toBe(1);
  });
});

describe("TUTOR-TRANSFER-RECONCILIATION1 — Phase 11 test 4: repeated reconciliation is idempotent", () => {
  it("sweepPostTransferPaymentSafety run twice against the same unsafe TRANSFERRED earning writes exactly one audit row and notifies admins exactly once", async () => {
    await createAdminUser(); // the isolated test DB has no seeded admin — create one so the notification assertion below is meaningful
    const pastStartAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const { tutor, student, booking, payment } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
    await bringEarningToTransferred(tutor, student, booking, payment, `tr_idem_${randomUUID()}`);
    await db.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED", refundedAmountCents: payment.amountCents } });

    const first = await sweepPostTransferPaymentSafety();
    expect(first.flagged).toBeGreaterThanOrEqual(1);
    const second = await sweepPostTransferPaymentSafety();
    expect(second.flagged).toBe(0); // this specific condition was already flagged — nothing new to write

    const earning = await getEarning(booking.id);
    const auditRows = await db.auditLog.findMany({
      where: { entityType: "TutorEarning", entityId: earning.id, action: "tutor_earning.post_transfer_payment_unsafe" },
    });
    expect(auditRows.length).toBe(1); // no duplicate spam across sweeps

    const notifications = await db.notification.findMany({
      where: { type: "tutor_earning.post_transfer_payment_unsafe", metadata: { path: ["tutorEarningId"], equals: earning.id } },
    });
    expect(notifications.length).toBeGreaterThanOrEqual(1); // at least one admin notified, and only from the first sweep
  });
});

describe("TUTOR-TRANSFER-RECONCILIATION1 — Phase 11 test 5: concurrent reconciliation workers are safe", () => {
  it("two concurrent createTransferForEarning calls for the same earning result in exactly one COMPLETED TutorTransfer and exactly one Stripe call", async () => {
    const pastStartAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const { tutor, student, booking, payment } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
    await bringEarningToEligible(tutor, student, booking);
    await makeConnectActive(tutor.tutorProfile.id);
    await makeChargeResolvable(payment.id);
    const earning = await getEarning(booking.id);

    let stripeCallCount = 0;
    vi.mocked(getStripeClient).mockClear();
    vi.mocked(getStripeClient).mockReturnValue({
      transfers: {
        create: vi.fn(async () => {
          stripeCallCount++;
          return { id: `tr_concurrent_${randomUUID()}` };
        }),
      },
    } as never);

    await Promise.all([createTransferForEarning(earning.id), createTransferForEarning(earning.id)]);

    expect((await getEarning(booking.id)).status).toBe("TRANSFERRED");
    const allTransfers = await db.tutorTransfer.findMany({ where: { tutorEarningId: earning.id } });
    expect(allTransfers.length).toBe(1); // the DB unique constraint on tutorEarningId is the authoritative guard
    expect(allTransfers[0].status).toBe("COMPLETED");
    expect(stripeCallCount).toBeLessThanOrEqual(1); // the loser of the TutorTransfer-create race defers before ever reaching Stripe
  });
});

describe("TUTOR-TRANSFER-RECONCILIATION1 — Phase 11 test 6/7: bounded retry — recent vs. stale FAILED transfer", () => {
  it("a recent FAILED transfer (well inside the 24h window) is automatically retried and reaches Stripe", async () => {
    const pastStartAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const { tutor, student, booking, payment } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
    await bringEarningToEligible(tutor, student, booking);
    await makeConnectActive(tutor.tutorProfile.id);
    await makeChargeResolvable(payment.id);
    const earning = await getEarning(booking.id);

    await db.tutorTransfer.create({
      data: {
        id: randomUUID(),
        tutorEarningId: earning.id,
        tutorProfileId: tutor.tutorProfile.id,
        amountCents: earning.amountCents,
        currency: earning.currency,
        status: "FAILED",
        initiatedAt: new Date(Date.now() - 60 * 60 * 1000), // 1h ago — recent
        failedAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });

    vi.mocked(getStripeClient).mockClear();
    vi.mocked(getStripeClient).mockReturnValue({
      transfers: { create: vi.fn(async () => ({ id: `tr_recent_${randomUUID()}` })) },
    } as never);

    await createTransferForEarning(earning.id);
    expect(getStripeClient).toHaveBeenCalled();
    expect((await getEarning(booking.id)).status).toBe("TRANSFERRED");
  });

  it("a stale FAILED transfer (past the 24h window) is NOT automatically retried — zero Stripe calls, flagged for manual review exactly once", async () => {
    const pastStartAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const { tutor, student, booking, payment } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
    await bringEarningToEligible(tutor, student, booking);
    await makeConnectActive(tutor.tutorProfile.id);
    await makeChargeResolvable(payment.id);
    const earning = await getEarning(booking.id);

    const staleTransferId = randomUUID();
    await db.tutorTransfer.create({
      data: {
        id: staleTransferId,
        tutorEarningId: earning.id,
        tutorProfileId: tutor.tutorProfile.id,
        amountCents: earning.amountCents,
        currency: earning.currency,
        status: "FAILED",
        initiatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48h ago — stale
        failedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      },
    });

    vi.mocked(getStripeClient).mockClear();
    vi.mocked(getStripeClient).mockReturnValue({
      transfers: { create: vi.fn(async () => ({ id: `tr_should_never_be_called_${randomUUID()}` })) },
    } as never);

    await createTransferForEarning(earning.id);
    expect(getStripeClient).not.toHaveBeenCalled();
    expect((await getEarning(booking.id)).status).toBe("ELIGIBLE"); // never advanced

    const transfer = await db.tutorTransfer.findUnique({ where: { id: staleTransferId } });
    expect(transfer?.status).toBe("FAILED"); // untouched — no blind status flip

    const auditRow = await db.auditLog.findFirst({
      where: { entityType: "TutorTransfer", entityId: staleTransferId, action: "tutor_transfer.manual_review_required" },
    });
    expect(auditRow).not.toBeNull();

    // Idempotent re-run: no duplicate audit spam.
    await createTransferForEarning(earning.id);
    const auditRowsAfterSecondCall = await db.auditLog.findMany({
      where: { entityType: "TutorTransfer", entityId: staleTransferId, action: "tutor_transfer.manual_review_required" },
    });
    expect(auditRowsAfterSecondCall.length).toBe(1);
  });
});

describe("TUTOR-TRANSFER-RECONCILIATION1 — Phase 11 tests 8-15: post-transfer payment-safety sweep", () => {
  it("test 8: TRANSFERRED + clean CAPTURED payment -> healthy, zero flags", async () => {
    const pastStartAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const { tutor, student, booking, payment } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
    await bringEarningToTransferred(tutor, student, booking, payment, `tr_healthy_${randomUUID()}`);

    const earning = await getEarning(booking.id);
    await sweepPostTransferPaymentSafety();
    const auditRow = await db.auditLog.findFirst({
      where: { entityType: "TutorEarning", entityId: earning.id, action: "tutor_earning.post_transfer_payment_unsafe" },
    });
    expect(auditRow).toBeNull();
  });

  it("test 9: TRANSFERRED + partial refund -> reconciliation required", async () => {
    const pastStartAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const { tutor, student, booking, payment } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
    await bringEarningToTransferred(tutor, student, booking, payment, `tr_partial_${randomUUID()}`);
    await db.payment.update({ where: { id: payment.id }, data: { status: "PARTIALLY_REFUNDED", refundedAmountCents: 500 } });

    const result = await sweepPostTransferPaymentSafety();
    expect(result.flagged).toBeGreaterThanOrEqual(1);
    const earning = await getEarning(booking.id);
    expect(earning.status).toBe("TRANSFERRED"); // never mutated — detection only
    const auditRow = await db.auditLog.findFirst({
      where: { entityType: "TutorEarning", entityId: earning.id, action: "tutor_earning.post_transfer_payment_unsafe" },
    });
    expect((auditRow?.metadata as Record<string, unknown>)?.reason).toBe("PAYMENT_PARTIALLY_REFUNDED");
  });

  it("test 10: TRANSFERRED + full refund -> reconciliation required", async () => {
    const pastStartAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const { tutor, student, booking, payment } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
    await bringEarningToTransferred(tutor, student, booking, payment, `tr_full_${randomUUID()}`);
    await db.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED", refundedAmountCents: payment.amountCents } });

    const result = await sweepPostTransferPaymentSafety();
    expect(result.flagged).toBeGreaterThanOrEqual(1);
    expect((await getEarning(booking.id)).status).toBe("TRANSFERRED");
  });

  it("test 11: TRANSFERRED + OPEN dispute -> reconciliation required", async () => {
    const pastStartAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const { tutor, student, booking, payment } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
    await bringEarningToTransferred(tutor, student, booking, payment, `tr_open_${randomUUID()}`);
    await db.payment.update({ where: { id: payment.id }, data: { disputeStatus: "OPEN" } });

    const result = await sweepPostTransferPaymentSafety();
    expect(result.flagged).toBeGreaterThanOrEqual(1);
  });

  it("test 12: TRANSFERRED + LOST dispute -> reconciliation required", async () => {
    const pastStartAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const { tutor, student, booking, payment } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
    await bringEarningToTransferred(tutor, student, booking, payment, `tr_lost_${randomUUID()}`);
    await db.payment.update({ where: { id: payment.id }, data: { disputeStatus: "LOST" } });

    const result = await sweepPostTransferPaymentSafety();
    expect(result.flagged).toBeGreaterThanOrEqual(1);
  });

  it("test 13: TRANSFERRED + WON dispute -> healthy (safety predicate says safe)", async () => {
    const pastStartAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const { tutor, student, booking, payment } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
    await bringEarningToTransferred(tutor, student, booking, payment, `tr_won_${randomUUID()}`);
    await db.payment.update({ where: { id: payment.id }, data: { disputeStatus: "WON" } });

    const earning = await getEarning(booking.id);
    await sweepPostTransferPaymentSafety();
    const auditRow = await db.auditLog.findFirst({
      where: { entityType: "TutorEarning", entityId: earning.id, action: "tutor_earning.post_transfer_payment_unsafe" },
    });
    expect(auditRow).toBeNull();
  });

  it("test 14: TRANSFERRED + PENDING Refund -> reconciliation required", async () => {
    const pastStartAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const { tutor, student, booking, payment } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
    await bringEarningToTransferred(tutor, student, booking, payment, `tr_pending_refund_${randomUUID()}`);
    await db.refund.create({
      data: { id: randomUUID(), paymentId: payment.id, bookingId: booking.id, amountCents: 500, status: "PENDING" },
    });

    const result = await sweepPostTransferPaymentSafety();
    expect(result.flagged).toBeGreaterThanOrEqual(1);
    const earning = await getEarning(booking.id);
    const auditRow = await db.auditLog.findFirst({
      where: { entityType: "TutorEarning", entityId: earning.id, action: "tutor_earning.post_transfer_payment_unsafe" },
    });
    expect((auditRow?.metadata as Record<string, unknown>)?.reason).toBe("REFUND_PENDING_RECONCILIATION");
  });

  it("test 15: ambiguous payment state (non-CAPTURED, non-refunded status) -> fail closed, flagged", async () => {
    const pastStartAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const { tutor, student, booking, payment } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
    await bringEarningToTransferred(tutor, student, booking, payment, `tr_ambiguous_${randomUUID()}`);
    // Defensive/should-be-unreachable state, exercised directly per this
    // codebase's own established "direct DB write to exercise a status
    // value" technique (see cancellationConcurrency.integration.test.ts's
    // own precedent).
    await db.payment.update({ where: { id: payment.id }, data: { status: "CANCELLED" } });

    const result = await sweepPostTransferPaymentSafety();
    expect(result.flagged).toBeGreaterThanOrEqual(1);
    const earning = await getEarning(booking.id);
    const auditRow = await db.auditLog.findFirst({
      where: { entityType: "TutorEarning", entityId: earning.id, action: "tutor_earning.post_transfer_payment_unsafe" },
    });
    expect((auditRow?.metadata as Record<string, unknown>)?.paymentSafetyStatus).toBe("UNKNOWN");
  });
});

describe("TUTOR-TRANSFER-RECONCILIATION1 — Phase 11 test 16: DB-only financial convergence route still zero Stripe calls (with post-transfer sweep included)", () => {
  it("processFinancialConvergenceAndEligibility + sweepPostTransferPaymentSafety together never touch getStripeClient", async () => {
    const pastStartAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const { tutor, student, booking, payment } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
    await bringEarningToTransferred(tutor, student, booking, payment, `tr_route_check_${randomUUID()}`);
    await db.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED", refundedAmountCents: payment.amountCents } });

    vi.mocked(getStripeClient).mockClear();
    await processFinancialConvergenceAndEligibility();
    await sweepPostTransferPaymentSafety();

    expect(getStripeClient).not.toHaveBeenCalled();
  });
});
