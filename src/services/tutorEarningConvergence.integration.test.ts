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
let markEligibleEarnings: typeof import("./tutorTransfers").markEligibleEarnings;
let processEligibleTransfers: typeof import("./tutorTransfers").processEligibleTransfers;

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
  ({ convergeTutorEarningFromSession, sweepTutorEarningConvergence, TUTOR_EARNING_FINANCIAL_DELAY_MS } = await import(
    "./tutorEarningConvergence"
  ));
  ({ markEligibleEarnings, processEligibleTransfers } = await import("./tutorTransfers"));

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

describe("Phase 5B — sweepTutorEarningConvergence / processEligibleTransfers wiring", () => {
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

  it("processEligibleTransfers runs financial convergence before the (hardened) eligibility promotion, with no Stripe calls for a dev-bypass-free assertion of internal state only", async () => {
    const pastStartAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const { tutor, student, booking } = await setupConfirmedCapturedBooking({ startAt: pastStartAt });
    await bringToInProgress(tutor, student, booking, () => pastStartAt);
    await resolveSessionCompletionConvergence(booking.id, { clock: () => booking.endAt });

    vi.mocked((await import("@/lib/stripe")).getStripeClient).mockReturnValue({
      transfers: { create: vi.fn(async () => ({ id: `tr_fake_${randomUUID()}` })) },
    } as never);

    const result = await processEligibleTransfers();
    expect(result.convergedEarnings).toBeGreaterThanOrEqual(1);
    expect(result.markedEligible).toBeGreaterThanOrEqual(1);
  });
});
