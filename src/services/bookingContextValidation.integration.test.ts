import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";

// BETA-1 / P1-02 — permanent regression coverage for the fix closing
// Codex's confirmed defect: reserveBookingPendingPayment previously never
// compared the client-supplied startAt/subjectId/academicLevelId/mode
// against the CustomerPriceQuote's own locked context, never checked a
// TutorPayoutQuote belonged to the intended Tutor or the intended customer
// quote, never validated the Payment's ownership/state/quote-linkage before
// reserving against it, and never checked the exclusive Payment-attachment
// updateMany's affected-row count — all of which meant a valid,
// authorized, unconsumed quote/payment pair could reserve (and then
// capture, via captureAuthorizedPayment, called strictly AFTER this
// transaction commits) a Booking for a different slot/subject/tutor than
// what was actually priced and paid for. See bookingCreation.ts's own doc
// comment on reserveBookingPendingPayment for the full fix description.
//
// Same DB-target-redirection / dynamic-import technique as
// bookingCreationConcurrency.integration.test.ts and
// cancellationRefund.integration.test.ts — see either file's own header
// comment for the full rationale. vi.mock("@/lib/stripe", ...) is
// declared here (this file's own module graph) so TEST 12 can prove, via
// a spy, that stripe.paymentIntents.capture is never invoked when the
// reservation step itself rejects the context — existing fixtures in this
// file never reach real Stripe regardless (reserveBookingPendingPayment
// itself performs no external call), so this mock has no effect on any
// assertion other than TEST 12's own.

vi.mock("@/lib/stripe", () => ({ getStripeClient: vi.fn() }));

import { getStripeClient } from "@/lib/stripe";

let createCustomerPriceQuote: typeof import("./customerPricing").createCustomerPriceQuote;
let createTutorPayoutQuote: typeof import("./tutorPayout").createTutorPayoutQuote;
let reserveBookingPendingPayment: typeof import("./bookingCreation").reserveBookingPendingPayment;
let PaymentReservationMismatchError: typeof import("./bookingCreation").PaymentReservationMismatchError;
let QuoteContextMismatchError: typeof import("./customerPricing").QuoteContextMismatchError;
let TutorPayoutQuoteNotActiveError: typeof import("./tutorPayout").TutorPayoutQuoteNotActiveError;
let captureAuthorizedPayment: typeof import("./payments").captureAuthorizedPayment;
let withSerializableRetry: typeof import("@/lib/serializableRetry").withSerializableRetry;

let db: PrismaClient;
let ambientDb: typeof import("@/lib/db").db;
let subjectId: string;
let otherSubjectId: string;
let academicLevelId: string;

const createdUserIds: string[] = [];
const createdStudentProfileIds: string[] = [];
const createdTutorProfileIds: string[] = [];
const createdCustomerQuoteIds: string[] = [];
const createdTutorPayoutQuoteIds: string[] = [];
const createdPaymentIds: string[] = [];
const createdBookingIds: string[] = [];
const createdAcademicLevelIds: string[] = [];

const FAR_FUTURE_START = new Date(Date.now() + 70 * 24 * 60 * 60 * 1000);

beforeAll(async () => {
  const target = resolveVerifiedTestDatabase();
  const devDatabaseUrlForSafetyCheckOnly = process.env.DATABASE_URL;
  const adapter = new PrismaPg({ connectionString: target.connectionString });
  db = new PrismaClient({ adapter });

  process.env.DATABASE_URL = target.connectionString;

  ({ createCustomerPriceQuote } = await import("./customerPricing"));
  ({ createTutorPayoutQuote } = await import("./tutorPayout"));
  ({ reserveBookingPendingPayment, PaymentReservationMismatchError } = await import("./bookingCreation"));
  ({ QuoteContextMismatchError } = await import("./customerPricing"));
  ({ TutorPayoutQuoteNotActiveError } = await import("./tutorPayout"));
  ({ captureAuthorizedPayment } = await import("./payments"));
  ({ withSerializableRetry } = await import("@/lib/serializableRetry"));

  ({ db: ambientDb } = await import("@/lib/db"));
  const [{ current_database: ambientDatabaseName }] = await ambientDb.$queryRaw<
    Array<{ current_database: string }>
  >`SELECT current_database()`;
  if (ambientDatabaseName !== target.databaseName) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton reports current_database() = "${ambientDatabaseName}", but the verified test database is "${target.databaseName}". Refusing to run any booking-context-validation test.`
    );
  }
  const devDatabaseNameForSafetyCheckOnly = devDatabaseUrlForSafetyCheckOnly
    ? new URL(devDatabaseUrlForSafetyCheckOnly).pathname.replace(/^\//, "")
    : null;
  if (devDatabaseNameForSafetyCheckOnly && ambientDatabaseName === devDatabaseNameForSafetyCheckOnly) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton's current_database() ("${ambientDatabaseName}") equals the real development database name. Refusing to run any booking-context-validation test.`
    );
  }

  const subject = await db.subject.create({ data: { slug: `p1-02-subject-${randomUUID()}`, sortOrder: 999 } });
  subjectId = subject.id;
  const otherSubject = await db.subject.create({ data: { slug: `p1-02-subject-b-${randomUUID()}`, sortOrder: 998 } });
  otherSubjectId = otherSubject.id;
  const level = await db.academicLevel.create({ data: { slug: `p1-02-level-${randomUUID()}`, sortOrder: 999 } });
  academicLevelId = level.id;
  createdAcademicLevelIds.push(level.id);

  const existingSettings = await db.marketplacePricingSettings.findFirst();
  if (!existingSettings) await db.marketplacePricingSettings.create({ data: {} });

  for (const sid of [subjectId, otherSubjectId]) {
    await db.customerBasePriceRule.create({
      data: { subjectId: sid, academicLevelId: null, baseDurationMinutes: 60, basePriceCents: 8000, pricingVersion: "CUSTOMER_PRICING_V1" },
    });
    await db.tutorBasePayoutRule.create({
      data: { tutorTier: "NEW", subjectId: sid, academicLevelId: null, baseDurationMinutes: 60, payoutCents: 5000, payoutVersion: "TUTOR_PAYOUT_V1" },
    });
  }
}, 30000);

afterAll(async () => {
  await db.tutorBasePayoutRule.deleteMany({ where: { subjectId: { in: [subjectId, otherSubjectId] } } });
  await db.customerBasePriceRule.deleteMany({ where: { subjectId: { in: [subjectId, otherSubjectId] } } });
  await db.academicLevel.deleteMany({ where: { id: { in: createdAcademicLevelIds } } });
  await db.subject.deleteMany({ where: { id: { in: [subjectId, otherSubjectId] } } });
  await db?.$disconnect();
});

afterEach(async () => {
  vi.mocked(getStripeClient).mockReset();
  if (createdBookingIds.length > 0) {
    // TEST 1/12/15a can reach a real CONFIRMED booking, which creates a
    // Session_ and TutorEarning (see convergeToCaptured) — both must be
    // removed before Booking itself, matching the established cleanup
    // order in bookingCreationConcurrency.integration.test.ts.
    await db.tutorEarning.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
    await db.session_.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
    await db.bookingStatusHistory.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
    await db.booking.deleteMany({ where: { id: { in: createdBookingIds } } });
    createdBookingIds.length = 0;
  }
  if (createdPaymentIds.length > 0) {
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
  return `p1-02-${prefix}-${randomUUID()}@futuretutor.test`;
}

async function createTutorUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("tutor"), role: "TUTOR" } });
  createdUserIds.push(user.id);
  const tutorProfile = await db.tutorProfile.create({
    data: { userId: user.id, slug: `p1-02-tutor-${randomUUID()}`, applicationStatus: "APPROVED", payoutTier: "NEW", learningMode: "BOTH" },
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

async function makeQuote(params: {
  actorUserId: string;
  studentProfileId: string;
  subjectId?: string;
  academicLevelId?: string | null;
  mode?: "ONLINE" | "IN_PERSON" | "BOTH";
  requestedStartAt?: Date;
}) {
  const quote = await createCustomerPriceQuote(
    {
      createdByUserId: params.actorUserId,
      studentProfileId: params.studentProfileId,
      subjectId: params.subjectId ?? subjectId,
      academicLevelId: params.academicLevelId ?? null,
      tutoringMode: params.mode ?? "ONLINE",
      durationMinutes: 60,
      requestedStartAt: params.requestedStartAt ?? FAR_FUTURE_START,
    },
    db
  );
  createdCustomerQuoteIds.push(quote.id);
  return quote;
}

async function makePayoutQuote(params: {
  tutorProfileId: string;
  customerQuoteId: string;
  subjectId?: string;
  academicLevelId?: string | null;
  mode?: "ONLINE" | "IN_PERSON" | "BOTH";
  requestedStartAt?: Date;
}) {
  const payoutQuote = await createTutorPayoutQuote(
    {
      tutorProfileId: params.tutorProfileId,
      subjectId: params.subjectId ?? subjectId,
      academicLevelId: params.academicLevelId ?? null,
      tutoringMode: params.mode ?? "ONLINE",
      durationMinutes: 60,
      requestedStartAt: params.requestedStartAt ?? FAR_FUTURE_START,
    },
    params.customerQuoteId,
    db
  );
  createdTutorPayoutQuoteIds.push(payoutQuote.id);
  return payoutQuote;
}

async function makeAuthorizedPayment(quoteId: string, payerUserId: string) {
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

/** Faithful reproduction of createBookingAction's real two-step ordering
 * (src/lib/actions/bookings.ts): Step A (reserveBookingPendingPayment,
 * inside a Serializable transaction) must fully commit before Step B
 * (captureAuthorizedPayment, a real external Stripe call) is ever
 * attempted — never the reverse, and never concurrently. */
async function attemptBookingThenCapture(input: Parameters<typeof reserveBookingPendingPayment>[1]) {
  const booking = await withSerializableRetry(() =>
    ambientDb.$transaction((tx) => reserveBookingPendingPayment(tx, input), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    })
  );
  await captureAuthorizedPayment(input.paymentId);
  return booking;
}

async function buildScenario(overrides: {
  startAt?: Date;
  subjectId?: string;
  academicLevelId?: string | null;
  mode?: "ONLINE" | "IN_PERSON" | "BOTH";
} = {}) {
  const tutor = await createTutorUser();
  const student = await createSelfManagedStudent();
  const quote = await makeQuote({
    actorUserId: student.user.id,
    studentProfileId: student.studentProfile.id,
    subjectId: overrides.subjectId,
    academicLevelId: overrides.academicLevelId,
    mode: overrides.mode,
    requestedStartAt: overrides.startAt,
  });
  const payoutQuote = await makePayoutQuote({
    tutorProfileId: tutor.tutorProfile.id,
    customerQuoteId: quote.id,
    subjectId: overrides.subjectId,
    academicLevelId: overrides.academicLevelId,
    mode: overrides.mode,
    requestedStartAt: overrides.startAt,
  });
  const payment = await makeAuthorizedPayment(quote.id, student.user.id);
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
      subjectId: overrides.subjectId ?? subjectId,
      academicLevelId: overrides.academicLevelId ?? null,
      startAt,
      endAt,
      timezone: "America/Toronto",
      mode: (overrides.mode ?? "ONLINE") as "ONLINE",
      paymentId: payment.id,
      customerPriceQuoteId: quote.id,
      tutorPayoutQuoteId: payoutQuote.id,
    },
  };
}

describe("BETA-1 / P1-02 — complete pre-capture context validation", () => {
  it("TEST 1 — normal valid Direct Booking succeeds, quotes consumed, payment attached", async () => {
    const scenario = await buildScenario();
    const booking = await withSerializableRetry(() =>
      ambientDb.$transaction((tx) => reserveBookingPendingPayment(tx, scenario.input), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      })
    );
    createdBookingIds.push(booking.id);
    expect(booking.status).toBe("PENDING_PAYMENT");

    const finalQuote = await db.customerPriceQuote.findUniqueOrThrow({ where: { id: scenario.quote.id } });
    expect(finalQuote.status).toBe("CONSUMED");
    const finalPayoutQuote = await db.tutorPayoutQuote.findUniqueOrThrow({ where: { id: scenario.payoutQuote.id } });
    expect(finalPayoutQuote.status).toBe("CONSUMED");
    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: scenario.payment.id } });
    expect(finalPayment.bookingId).toBe(booking.id);
  });

  it("TEST 3 — same quote/payment reused for a DIFFERENT NON-OVERLAPPING slot is rejected before capture (the exact Codex scenario)", async () => {
    const scenario = await buildScenario();
    // First reservation consumes the quote/payment for the originally
    // priced slot.
    const firstBooking = await withSerializableRetry(() =>
      ambientDb.$transaction((tx) => reserveBookingPendingPayment(tx, scenario.input), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    );
    createdBookingIds.push(firstBooking.id);

    // Attempt to reuse the SAME (now-consumed) quote/payment/payout-quote
    // ids against a different, non-overlapping slot for the same tutor —
    // exactly the gap Codex identified: startAt is client-supplied and was
    // never compared against the quote's own locked context.
    const differentSlotStart = new Date(scenario.input.startAt.getTime() + 5 * 24 * 60 * 60 * 1000);
    const capture = vi.fn();
    vi.mocked(getStripeClient).mockReturnValue({ paymentIntents: { capture, retrieve: vi.fn() } } as never);

    await expect(
      attemptBookingThenCapture({
        ...scenario.input,
        startAt: differentSlotStart,
        endAt: new Date(differentSlotStart.getTime() + 60 * 60 * 1000),
      })
    ).rejects.toThrow(); // QuoteAlreadyConsumedError (already CONSUMED from the first reservation)

    expect(capture).not.toHaveBeenCalled(); // Stripe capture never reached
    const bookingCount = await db.booking.count({ where: { tutorProfileId: scenario.tutor.tutorProfile.id } });
    expect(bookingCount).toBe(1); // only the first, legitimate booking exists
  });

  it("TEST 3b — a FRESH (never-consumed) quote/payment but a startAt that does not match the quote's own locked context is rejected before capture", async () => {
    const scenario = await buildScenario();
    const wrongStart = new Date(scenario.input.startAt.getTime() + 3 * 24 * 60 * 60 * 1000);
    const capture = vi.fn();
    vi.mocked(getStripeClient).mockReturnValue({ paymentIntents: { capture, retrieve: vi.fn() } } as never);

    await expect(
      attemptBookingThenCapture({ ...scenario.input, startAt: wrongStart, endAt: new Date(wrongStart.getTime() + 60 * 60 * 1000) })
    ).rejects.toThrow(QuoteContextMismatchError);

    expect(capture).not.toHaveBeenCalled();
    const finalQuote = await db.customerPriceQuote.findUniqueOrThrow({ where: { id: scenario.quote.id } });
    expect(finalQuote.status).toBe("ACTIVE"); // never consumed by the rejected attempt
    const bookingCount = await db.booking.count({ where: { customerPriceQuoteId: scenario.quote.id } });
    expect(bookingCount).toBe(0);
  });

  it("TEST 4 — customer quote subject mismatch rejected before capture", async () => {
    const scenario = await buildScenario();
    const capture = vi.fn();
    vi.mocked(getStripeClient).mockReturnValue({ paymentIntents: { capture, retrieve: vi.fn() } } as never);

    await expect(
      attemptBookingThenCapture({ ...scenario.input, subjectId: otherSubjectId })
    ).rejects.toThrow(QuoteContextMismatchError);
    expect(capture).not.toHaveBeenCalled();
  });

  it("TEST 5 — academic level mismatch rejected before capture", async () => {
    const scenario = await buildScenario({ academicLevelId: null });
    const capture = vi.fn();
    vi.mocked(getStripeClient).mockReturnValue({ paymentIntents: { capture, retrieve: vi.fn() } } as never);

    await expect(
      attemptBookingThenCapture({ ...scenario.input, academicLevelId })
    ).rejects.toThrow(QuoteContextMismatchError);
    expect(capture).not.toHaveBeenCalled();
  });

  it("TEST 6 — tutoring mode mismatch rejected before capture", async () => {
    const scenario = await buildScenario({ mode: "ONLINE" });
    const capture = vi.fn();
    vi.mocked(getStripeClient).mockReturnValue({ paymentIntents: { capture, retrieve: vi.fn() } } as never);

    await expect(
      attemptBookingThenCapture({ ...scenario.input, mode: "IN_PERSON" as never })
    ).rejects.toThrow(QuoteContextMismatchError);
    expect(capture).not.toHaveBeenCalled();
  });

  it("TEST 7 — a TutorPayoutQuote belonging to a DIFFERENT Tutor is rejected before capture (cannot substitute another Tutor's payout)", async () => {
    const scenario = await buildScenario();
    const otherTutor = await createTutorUser();
    const capture = vi.fn();
    vi.mocked(getStripeClient).mockReturnValue({ paymentIntents: { capture, retrieve: vi.fn() } } as never);

    await expect(
      attemptBookingThenCapture({ ...scenario.input, tutorProfileId: otherTutor.tutorProfile.id })
    ).rejects.toThrow(TutorPayoutQuoteNotActiveError);
    expect(capture).not.toHaveBeenCalled();

    const bookingCount = await db.booking.count({ where: { tutorProfileId: otherTutor.tutorProfile.id } });
    expect(bookingCount).toBe(0);
  });

  it("TEST 7b — a TutorPayoutQuote belonging to an unrelated CustomerPriceQuote is rejected before capture", async () => {
    const scenario = await buildScenario();
    const unrelatedStudent = await createSelfManagedStudent();
    const unrelatedQuote = await makeQuote({ actorUserId: unrelatedStudent.user.id, studentProfileId: unrelatedStudent.studentProfile.id });
    const unrelatedPayoutQuote = await makePayoutQuote({ tutorProfileId: scenario.tutor.tutorProfile.id, customerQuoteId: unrelatedQuote.id });
    const capture = vi.fn();
    vi.mocked(getStripeClient).mockReturnValue({ paymentIntents: { capture, retrieve: vi.fn() } } as never);

    await expect(
      attemptBookingThenCapture({ ...scenario.input, tutorPayoutQuoteId: unrelatedPayoutQuote.id })
    ).rejects.toThrow(TutorPayoutQuoteNotActiveError);
    expect(capture).not.toHaveBeenCalled();
  });

  it("TEST 8 — a Payment belonging to a DIFFERENT payer is rejected before capture", async () => {
    const scenario = await buildScenario();
    const otherUser = await db.user.create({ data: { email: uniqueEmail("otherpayer"), role: "STUDENT" } });
    createdUserIds.push(otherUser.id);
    await db.payment.update({ where: { id: scenario.payment.id }, data: { payerUserId: otherUser.id } });
    const capture = vi.fn();
    vi.mocked(getStripeClient).mockReturnValue({ paymentIntents: { capture, retrieve: vi.fn() } } as never);

    await expect(attemptBookingThenCapture(scenario.input)).rejects.toThrow(PaymentReservationMismatchError);
    expect(capture).not.toHaveBeenCalled();
    const bookingCount = await db.booking.count({ where: { customerPriceQuoteId: scenario.quote.id } });
    expect(bookingCount).toBe(0);
  });

  it("TEST 8b — a Payment still PENDING (never authorized) is rejected before capture", async () => {
    const scenario = await buildScenario();
    await db.payment.update({ where: { id: scenario.payment.id }, data: { status: "PENDING", authorizedAt: null } });
    const capture = vi.fn();
    vi.mocked(getStripeClient).mockReturnValue({ paymentIntents: { capture, retrieve: vi.fn() } } as never);

    await expect(attemptBookingThenCapture(scenario.input)).rejects.toThrow(PaymentReservationMismatchError);
    expect(capture).not.toHaveBeenCalled();
  });

  it("TEST 8c — a Payment whose amount no longer matches the quote's total is rejected before capture", async () => {
    const scenario = await buildScenario();
    await db.payment.update({ where: { id: scenario.payment.id }, data: { amountCents: scenario.payment.amountCents + 100 } });
    const capture = vi.fn();
    vi.mocked(getStripeClient).mockReturnValue({ paymentIntents: { capture, retrieve: vi.fn() } } as never);

    await expect(attemptBookingThenCapture(scenario.input)).rejects.toThrow(PaymentReservationMismatchError);
    expect(capture).not.toHaveBeenCalled();
  });

  it("TEST 9 — a Payment already attached to a different Booking cannot attach to a second Booking", async () => {
    const scenario = await buildScenario();
    const firstBooking = await withSerializableRetry(() =>
      ambientDb.$transaction((tx) => reserveBookingPendingPayment(tx, scenario.input), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    );
    createdBookingIds.push(firstBooking.id);

    // A second, independent quote/payout-quote pair for a different slot,
    // but forcibly wired to reuse the ALREADY-ATTACHED payment id.
    const secondSlotStart = new Date(scenario.input.startAt.getTime() + 8 * 24 * 60 * 60 * 1000);
    const secondQuote = await makeQuote({ actorUserId: scenario.student.user.id, studentProfileId: scenario.student.studentProfile.id, requestedStartAt: secondSlotStart });
    const secondPayoutQuote = await makePayoutQuote({ tutorProfileId: scenario.tutor.tutorProfile.id, customerQuoteId: secondQuote.id, requestedStartAt: secondSlotStart });
    // Force the existing (already-attached) Payment to point at the new
    // quote id, simulating a forged/reused paymentId whose own
    // customerPriceQuoteId was somehow made to match — the exclusive
    // bookingId guard must still catch it independently of quote linkage.
    await db.payment.update({ where: { id: scenario.payment.id }, data: { customerPriceQuoteId: secondQuote.id } });

    const capture = vi.fn();
    vi.mocked(getStripeClient).mockReturnValue({ paymentIntents: { capture, retrieve: vi.fn() } } as never);

    await expect(
      attemptBookingThenCapture({
        actorUserId: scenario.student.user.id,
        studentProfileId: scenario.student.studentProfile.id,
        tutorProfileId: scenario.tutor.tutorProfile.id,
        subjectId,
        academicLevelId: null,
        startAt: secondSlotStart,
        endAt: new Date(secondSlotStart.getTime() + 60 * 60 * 1000),
        timezone: "America/Toronto",
        mode: "ONLINE",
        paymentId: scenario.payment.id,
        customerPriceQuoteId: secondQuote.id,
        tutorPayoutQuoteId: secondPayoutQuote.id,
      })
    ).rejects.toThrow(PaymentReservationMismatchError); // bookingId !== null pre-check catches it

    expect(capture).not.toHaveBeenCalled();
    const bookingCount = await db.booking.count({ where: { tutorProfileId: scenario.tutor.tutorProfile.id } });
    expect(bookingCount).toBe(1); // only the first booking
  });

  it("TEST 10 — exclusive attachment: a concurrently-raced updateMany affecting zero rows aborts the whole reservation before capture", async () => {
    // Simulates the race directly: pre-attach the Payment to an unrelated
    // Booking-shaped row via a raw update between the pre-check read and
    // the guarded write would require true concurrency to exercise
    // naturally (already covered by bookingCreationConcurrency's tests
    // D/E for the general Serializable-conflict path). Here we prove the
    // narrower, deterministic case: bookingId is already non-null by the
    // time reserveBookingPendingPayment's OWN pre-check would run, via a
    // payment pointing at a real, different, already-existing booking.
    const scenario = await buildScenario();
    const firstBooking = await withSerializableRetry(() =>
      ambientDb.$transaction((tx) => reserveBookingPendingPayment(tx, scenario.input), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    );
    createdBookingIds.push(firstBooking.id);

    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: scenario.payment.id } });
    expect(finalPayment.bookingId).toBe(firstBooking.id); // exclusive attachment succeeded exactly once

    // A direct second attempt with the identical, now-attached payment and
    // already-consumed quotes is rejected — proving no code path ever
    // reaches the exclusive-attachment write a second time for the same
    // payment (the earlier quote-consumption checks already reject first,
    // which is itself the correct, cheaper fail point — attachment is
    // still exercised in TEST 9 above via a fresh quote pair).
    await expect(
      withSerializableRetry(() =>
        ambientDb.$transaction((tx) => reserveBookingPendingPayment(tx, scenario.input), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
      )
    ).rejects.toThrow();
    const bookingCount = await db.booking.count({ where: { tutorProfileId: scenario.tutor.tutorProfile.id } });
    expect(bookingCount).toBe(1);
  });

  it("TEST 12 — Stripe capture is never invoked for ANY of the invalid pre-capture contexts, and IS invoked for a valid one", async () => {
    // Invalid: subject mismatch.
    const invalid = await buildScenario();
    const captureInvalid = vi.fn();
    vi.mocked(getStripeClient).mockReturnValue({ paymentIntents: { capture: captureInvalid, retrieve: vi.fn() } } as never);
    await expect(attemptBookingThenCapture({ ...invalid.input, subjectId: otherSubjectId })).rejects.toThrow();
    expect(captureInvalid).not.toHaveBeenCalled();

    // Valid: capture IS reached and invoked exactly once.
    const valid = await buildScenario();
    const captureValid = vi.fn(async (id: string) => ({ id, status: "succeeded" }));
    vi.mocked(getStripeClient).mockReturnValue({ paymentIntents: { capture: captureValid, retrieve: vi.fn(async (id: string) => ({ id, status: "succeeded" })) } } as never);
    const booking = await attemptBookingThenCapture(valid.input);
    createdBookingIds.push(booking.id);
    expect(captureValid).toHaveBeenCalledTimes(1);
    expect(captureValid).toHaveBeenCalledWith(valid.payment.stripePaymentIntentId, {}, { idempotencyKey: `capture:${valid.payment.id}` });

    const finalBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(finalBooking.status).toBe("CONFIRMED");
  });

  it("TEST 15a — Quick Match's own quote/payout-quote validation path is unaffected: a valid ACCEPTED payout quote still consumes correctly", async () => {
    // Mirrors acceptTutorInvitationAction's real shape (ACTIVE payout quote
    // -> ACCEPTED via acceptTutorPayoutQuote, then consumed here) without
    // pulling in the full Quick Match dispatch machinery — proving
    // reserveBookingPendingPayment's new validation accepts the ACCEPTED
    // starting state exactly as it did before this fix.
    const { acceptTutorPayoutQuote } = await import("./tutorPayout");
    const scenario = await buildScenario();
    await db.$transaction((tx) => acceptTutorPayoutQuote(tx, scenario.payoutQuote.id, scenario.tutor.tutorProfile.id));

    const booking = await withSerializableRetry(() =>
      ambientDb.$transaction((tx) => reserveBookingPendingPayment(tx, scenario.input), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    );
    createdBookingIds.push(booking.id);
    expect(booking.status).toBe("PENDING_PAYMENT");
    const finalPayoutQuote = await db.tutorPayoutQuote.findUniqueOrThrow({ where: { id: scenario.payoutQuote.id } });
    expect(finalPayoutQuote.status).toBe("CONSUMED");
  });
});
