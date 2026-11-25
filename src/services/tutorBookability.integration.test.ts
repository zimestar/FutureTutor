import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { TutorApplicationStatus } from "@/generated/prisma/enums";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";
import { futureSlotUtc } from "@/test-support/testSlots";

// RW-03 — real-PostgreSQL proof of the shared tutor bookability rule and of
// the row-locked, in-transaction re-check inside reserveBookingPendingPayment.
//
// Connections: three independent PrismaClient pools against the verified,
// isolated local test database — `db` (fixtures + observation), `reserveDb`
// (every reservation transaction), and the ambient `@/lib/db` singleton
// (used by the REAL suspendTutor, exactly as in production). Each
// interactive transaction pins its own physical PostgreSQL connection.
//
// The only thing stubbed is tutorApplicationNotifications (the in-transaction
// notification-row emitter and the post-commit email dispatch), so no email
// can ever be sent from this file. suspendTutor's status assertion, its
// TutorProfile UPDATE, its audit-log write and its transaction boundary all
// run for real.
vi.mock("@/services/tutorApplicationNotifications", () => ({
  emitTutorApplicationEvent: vi.fn(async () => {}),
  dispatchTutorApplicationNotifications: vi.fn(async () => {}),
}));

vi.setConfig({ testTimeout: 60_000 });

let reserveBookingPendingPayment: typeof import("./bookingCreation").reserveBookingPendingPayment;
let TutorNotBookableError: typeof import("./bookingCreation").TutorNotBookableError;
let isTutorEligibleForRequest: typeof import("./tutorEligibility").isTutorEligibleForRequest;
let getEligibleTutors: typeof import("./tutorEligibility").getEligibleTutors;
let getSupplySignal: typeof import("./marketplaceSupply").getSupplySignal;
let suspendTutor: typeof import("./tutorApplicationWorkflow").suspendTutor;
let createCustomerPriceQuote: typeof import("./customerPricing").createCustomerPriceQuote;
let createTutorPayoutQuote: typeof import("./tutorPayout").createTutorPayoutQuote;
let withSerializableRetry: typeof import("@/lib/serializableRetry").withSerializableRetry;
let BOOKABLE_TUTOR_WHERE: typeof import("@/lib/tutorBookability").BOOKABLE_TUTOR_WHERE;

let db: PrismaClient;
let reserveDb: PrismaClient;
let subjectId: string;
let adminUserId: string;

const ALL_STATUSES = Object.values(TutorApplicationStatus);
const createdUserIds: string[] = [];
const createdTutorProfileIds: string[] = [];
const createdStudentProfileIds: string[] = [];
const createdCustomerQuoteIds: string[] = [];
const createdTutorPayoutQuoteIds: string[] = [];
const createdPaymentIds: string[] = [];

let slotCounter = 0;
function nextSlot(): Date {
  slotCounter += 1;
  return futureSlotUtc(70 + slotCounter);
}

beforeAll(async () => {
  const target = resolveVerifiedTestDatabase();
  const devDatabaseUrlForSafetyCheckOnly = process.env.DATABASE_URL;
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: target.connectionString }) });
  reserveDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: target.connectionString }) });
  process.env.DATABASE_URL = target.connectionString;

  ({ reserveBookingPendingPayment, TutorNotBookableError } = await import("./bookingCreation"));
  ({ isTutorEligibleForRequest, getEligibleTutors } = await import("./tutorEligibility"));
  ({ getSupplySignal } = await import("./marketplaceSupply"));
  ({ suspendTutor } = await import("./tutorApplicationWorkflow"));
  ({ createCustomerPriceQuote } = await import("./customerPricing"));
  ({ createTutorPayoutQuote } = await import("./tutorPayout"));
  ({ withSerializableRetry } = await import("@/lib/serializableRetry"));
  ({ BOOKABLE_TUTOR_WHERE } = await import("@/lib/tutorBookability"));

  // Fail closed unless EVERY client — including the ambient singleton the
  // real suspendTutor uses — is connected to the verified test database.
  const { db: ambientDb } = await import("@/lib/db");
  const devName = devDatabaseUrlForSafetyCheckOnly
    ? new URL(devDatabaseUrlForSafetyCheckOnly).pathname.replace(/^\//, "")
    : null;
  for (const [label, client] of [["fixture", db], ["reservation", reserveDb], ["ambient", ambientDb]] as const) {
    const [{ current_database: name }] = await client.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
    if (name !== target.databaseName) {
      throw new Error(`FAIL CLOSED: ${label} client is on "${name}", expected test database "${target.databaseName}".`);
    }
    if (devName && name === devName) {
      throw new Error(`FAIL CLOSED: ${label} client is on the development database "${devName}".`);
    }
  }

  const subject = await db.subject.create({ data: { slug: `rw03-subject-${randomUUID()}`, sortOrder: 999 } });
  subjectId = subject.id;
  const existingSettings = await db.marketplacePricingSettings.findFirst();
  if (!existingSettings) await db.marketplacePricingSettings.create({ data: {} });
  await db.customerBasePriceRule.create({
    data: { subjectId, academicLevelId: null, baseDurationMinutes: 60, basePriceCents: 8000, pricingVersion: "CUSTOMER_PRICING_V1" },
  });
  await db.tutorBasePayoutRule.create({
    data: { tutorTier: "NEW", subjectId, academicLevelId: null, baseDurationMinutes: 60, payoutCents: 5000, payoutVersion: "TUTOR_PAYOUT_V1" },
  });

  const admin = await db.user.create({ data: { email: `rw03-admin-${randomUUID()}@futuretutor.test`, role: "ADMIN" } });
  adminUserId = admin.id;
}, 60_000);

afterAll(async () => {
  await db.auditLog.deleteMany({ where: { actorUserId: adminUserId } });
  await db.user.delete({ where: { id: adminUserId } }).catch(() => {});
  await db.tutorBasePayoutRule.deleteMany({ where: { subjectId } });
  await db.customerBasePriceRule.deleteMany({ where: { subjectId } });
  await db.subject.delete({ where: { id: subjectId } }).catch(() => {});
  await db?.$disconnect();
  await reserveDb?.$disconnect();
});

afterEach(async () => {
  if (createdTutorProfileIds.length > 0) {
    const bookings = await db.booking.findMany({ where: { tutorProfileId: { in: createdTutorProfileIds } }, select: { id: true } });
    const bookingIds = bookings.map((b) => b.id);
    if (bookingIds.length > 0) {
      await db.payment.updateMany({ where: { bookingId: { in: bookingIds } }, data: { bookingId: null } });
      await db.bookingStatusHistory.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await db.booking.deleteMany({ where: { id: { in: bookingIds } } });
    }
    await db.auditLog.deleteMany({ where: { entityId: { in: createdTutorProfileIds } } });
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

// ---------------------------------------------------------------- fixtures

async function createTutor(opts: { applicationStatus?: TutorApplicationStatus; deactivated?: boolean } = {}) {
  const user = await db.user.create({
    data: {
      email: `rw03-tutor-${randomUUID()}@futuretutor.test`,
      role: "TUTOR",
      deactivatedAt: opts.deactivated ? new Date() : null,
    },
  });
  createdUserIds.push(user.id);
  const tutorProfile = await db.tutorProfile.create({
    data: {
      userId: user.id,
      slug: `rw03-tutor-${randomUUID()}`,
      applicationStatus: opts.applicationStatus ?? "APPROVED",
      payoutTier: "NEW",
      learningMode: "ONLINE",
      tutorAgreementAcceptedAt: new Date(),
      tutorAgreementAcceptedVersion: "2026-08-30",
      tutorAgreementAcceptedLocale: "en",
    },
  });
  createdTutorProfileIds.push(tutorProfile.id);
  await db.tutorSubject.create({ data: { tutorProfileId: tutorProfile.id, subjectId } });
  await db.tutorAvailability.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      tutorProfileId: tutorProfile.id,
      dayOfWeek,
      startTime: "00:00",
      endTime: "23:59",
      timezone: "UTC",
      mode: "ONLINE" as const,
    })),
  });
  return { user, tutorProfile };
}

async function createStudent() {
  const user = await db.user.create({ data: { email: `rw03-student-${randomUUID()}@futuretutor.test`, role: "STUDENT" } });
  createdUserIds.push(user.id);
  const studentProfile = await db.studentProfile.create({
    data: { userId: user.id, firstName: "Rw", lastName: "Three", managementMode: "SELF_MANAGED" },
  });
  createdStudentProfileIds.push(studentProfile.id);
  return { user, studentProfile };
}

/** Quote + payout quote + AUTHORIZED payment for one slot, while the tutor
 * is still APPROVED (exactly the real production sequencing: the action-level
 * checks passed and money was authorized before the reservation runs). */
async function prepareReservation(tutorProfileId: string) {
  const student = await createStudent();
  const startAt = nextSlot();
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
  const quote = await createCustomerPriceQuote(
    {
      createdByUserId: student.user.id,
      studentProfileId: student.studentProfile.id,
      subjectId,
      academicLevelId: null,
      tutoringMode: "ONLINE",
      durationMinutes: 60,
      requestedStartAt: startAt,
    },
    db
  );
  createdCustomerQuoteIds.push(quote.id);
  const payoutQuote = await createTutorPayoutQuote(
    { tutorProfileId, subjectId, academicLevelId: null, tutoringMode: "ONLINE", durationMinutes: 60, requestedStartAt: startAt },
    quote.id,
    db
  );
  createdTutorPayoutQuoteIds.push(payoutQuote.id);
  const payment = await db.payment.create({
    data: {
      id: randomUUID(),
      customerPriceQuoteId: quote.id,
      payerUserId: student.user.id,
      amountCents: quote.totalCents,
      currency: quote.currency,
      status: "AUTHORIZED",
      authorizedAt: new Date(),
      stripePaymentIntentId: `pi_test_${randomUUID()}`,
    },
  });
  createdPaymentIds.push(payment.id);
  const input: Parameters<typeof reserveBookingPendingPayment>[1] = {
    actorUserId: student.user.id,
    studentProfileId: student.studentProfile.id,
    tutorProfileId,
    subjectId,
    academicLevelId: null,
    startAt,
    endAt,
    timezone: "UTC",
    mode: "ONLINE",
    paymentId: payment.id,
    customerPriceQuoteId: quote.id,
    tutorPayoutQuoteId: payoutQuote.id,
  };
  return { input, quote, payoutQuote, payment };
}

const SERIALIZABLE_TX = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  timeout: 30_000,
  maxWait: 10_000,
} as const;

/** Production shape of the reservation (createBookingAction /
 * acceptTutorInvitationAction): withSerializableRetry around a Serializable
 * interactive transaction — here on its own dedicated connection pool. The
 * optional hook runs inside the transaction on every attempt. */
function reserveWithRetry(
  input: Parameters<typeof reserveBookingPendingPayment>[1],
  hooks: { beforeReserve?: (tx: Prisma.TransactionClient, attempt: number) => Promise<void>; afterReserve?: (attempt: number) => Promise<void> } = {},
  attempts: { count: number; errors: unknown[] } = { count: 0, errors: [] }
) {
  return withSerializableRetry(() =>
    reserveDb.$transaction(async (tx) => {
      attempts.count += 1;
      const attempt = attempts.count;
      try {
        if (hooks.beforeReserve) await hooks.beforeReserve(tx, attempt);
        const booking = await reserveBookingPendingPayment(tx, input);
        if (hooks.afterReserve) await hooks.afterReserve(attempt);
        return booking;
      } catch (error) {
        attempts.errors.push(error);
        throw error;
      }
    }, SERIALIZABLE_TX)
  );
}

async function expectNothingReserved(prepared: Awaited<ReturnType<typeof prepareReservation>>) {
  expect(await db.booking.count({ where: { customerPriceQuoteId: prepared.quote.id } })).toBe(0);
  expect((await db.customerPriceQuote.findUniqueOrThrow({ where: { id: prepared.quote.id } })).status).toBe("ACTIVE");
  expect((await db.tutorPayoutQuote.findUniqueOrThrow({ where: { id: prepared.payoutQuote.id } })).status).toBe("ACTIVE");
  expect((await db.payment.findUniqueOrThrow({ where: { id: prepared.payment.id } })).bookingId).toBeNull();
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

/** Polls pg_stat_activity (on the observer connection) until some backend in
 * this test database is blocked on a heavyweight lock while running a
 * statement matching `pattern`. Proves a real lock wait, not a timing guess. */
async function waitForLockWait(pattern: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await db.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock' AND query ILIKE ${`%${pattern}%`}`;
    if (rows[0].n > 0) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`no backend observed waiting on a lock for /${pattern}/ within ${timeoutMs}ms`);
}

/** True only for a genuine Postgres 40001 raised by the raw FOR SHARE lock
 * statement: Prisma wraps it as P2010 ("Raw query failed") with the adapter's
 * mapped error (original code 40001, kind TransactionWriteConflict). */
function isSerializationFailure(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2010") return false;
  const cause = (error.meta as { driverAdapterError?: { cause?: { originalCode?: unknown; kind?: unknown } } } | undefined)
    ?.driverAdapterError?.cause;
  return cause?.originalCode === "40001" && cause?.kind === "TransactionWriteConflict";
}

const deactivateUser = (userId: string) => async () => {
  const { db: ambientDb } = await import("@/lib/db");
  await ambientDb.user.update({ where: { id: userId }, data: { deactivatedAt: new Date() } });
};

// ------------------------------------------------- reservation-level checks

describe("reserveBookingPendingPayment — row-locked bookability re-check (sequential)", () => {
  it.each(ALL_STATUSES)("applicationStatus=%s with an active user -> reserves only when APPROVED", async (status) => {
    const { tutorProfile } = await createTutor();
    const prepared = await prepareReservation(tutorProfile.id);
    await db.tutorProfile.update({ where: { id: tutorProfile.id }, data: { applicationStatus: status } });

    if (status === "APPROVED") {
      const booking = await reserveWithRetry(prepared.input);
      expect(booking.status).toBe("PENDING_PAYMENT");
      expect((await db.payment.findUniqueOrThrow({ where: { id: prepared.payment.id } })).bookingId).toBe(booking.id);
    } else {
      await expect(reserveWithRetry(prepared.input)).rejects.toBeInstanceOf(TutorNotBookableError);
      await expectNothingReserved(prepared);
    }
  });

  it("APPROVED tutor whose User account is deactivated -> refused, nothing written", async () => {
    const { tutorProfile, user } = await createTutor();
    const prepared = await prepareReservation(tutorProfile.id);
    await db.user.update({ where: { id: user.id }, data: { deactivatedAt: new Date() } });

    await expect(reserveWithRetry(prepared.input)).rejects.toBeInstanceOf(TutorNotBookableError);
    await expectNothingReserved(prepared);
  });

  it("nonexistent tutorProfileId -> refused before anything else is read", async () => {
    const { tutorProfile } = await createTutor();
    const prepared = await prepareReservation(tutorProfile.id);
    await expect(
      reserveWithRetry({ ...prepared.input, tutorProfileId: `missing-${randomUUID()}` })
    ).rejects.toBeInstanceOf(TutorNotBookableError);
    await expectNothingReserved(prepared);
  });
});

// ----------------------------------------- Quick Match / discovery / supply

describe("shared bookability rule in Quick Match eligibility, discovery and supply (real Postgres)", () => {
  const eligibilityRequest = () => ({
    subjectId,
    academicLevelId: null,
    tutoringMode: "ONLINE" as const,
    requestedStartAt: nextSlot(),
    durationMinutes: 60,
    city: null,
  });

  it.each(ALL_STATUSES)("isTutorEligibleForRequest: applicationStatus=%s x {active, deactivated}", async (status) => {
    const active = await createTutor({ applicationStatus: status });
    const deactivated = await createTutor({ applicationStatus: status, deactivated: true });
    const request = eligibilityRequest();
    expect(await isTutorEligibleForRequest(db, active.tutorProfile.id, request)).toBe(status === "APPROVED");
    expect(await isTutorEligibleForRequest(db, deactivated.tutorProfile.id, request)).toBe(false);
  });

  it("getEligibleTutors, BOOKABLE_TUTOR_WHERE discovery queries and getSupplySignal include only APPROVED + active tutors", async () => {
    const bookable = await createTutor();
    const deactivated = await createTutor({ deactivated: true });
    const suspended = await createTutor({ applicationStatus: "SUSPENDED" });
    const ours = [bookable.tutorProfile.id, deactivated.tutorProfile.id, suspended.tutorProfile.id];

    const eligible = await getEligibleTutors(db, eligibilityRequest());
    expect(eligible.map((t) => t.id).filter((id) => ours.includes(id))).toEqual([bookable.tutorProfile.id]);

    // The exact where-fragment the 5 public discovery queries spread in.
    const discovered = await db.tutorProfile.findMany({ where: { ...BOOKABLE_TUTOR_WHERE, id: { in: ours } }, select: { id: true } });
    expect(discovered.map((t) => t.id)).toEqual([bookable.tutorProfile.id]);

    // Only this test's tutors teach this test's unique subject.
    const supply = await getSupplySignal(db, { subjectId, mode: "ONLINE" }, 1);
    expect(supply.qualifiedTutorCount).toBe(1);
  });
});

// ------------------------------------------------------------- concurrency

describe("concurrent reservation vs. tutor suspension/deactivation (separate real connections)", () => {
  it("NEGATIVE CONTROL: a Serializable transaction with a plain (unlocked) read commits on stale eligibility after a suspension already committed", async () => {
    const { tutorProfile } = await createTutor();
    const snapshotTaken = deferred();
    const suspensionCommitted = deferred();
    let statusSeen: string | null = null;

    const staleTx = reserveDb.$transaction(async (tx) => {
      const row = await tx.tutorProfile.findUniqueOrThrow({ where: { id: tutorProfile.id }, select: { applicationStatus: true } });
      statusSeen = row.applicationStatus;
      snapshotTaken.resolve();
      await suspensionCommitted.promise;
      // Stand-in for "create the booking": any write in the same transaction.
      await tx.auditLog.create({
        data: { actorUserId: adminUserId, action: "rw03.negative_control", entityType: "TutorProfile", entityId: tutorProfile.id },
      });
    }, SERIALIZABLE_TX);

    await snapshotTaken.promise;
    await suspendTutor(tutorProfile.id, adminUserId, "rw03 negative control");
    suspensionCommitted.resolve();

    await expect(staleTx).resolves.toBeUndefined(); // committed — Serializable did NOT catch it
    expect(statusSeen).toBe("APPROVED");
    expect((await db.tutorProfile.findUniqueOrThrow({ where: { id: tutorProfile.id } })).applicationStatus).toBe("SUSPENDED");
  });

  it("ORDERING 1 — reservation locks first: the real suspendTutor blocks on the lock until the booking commits, then applies", async () => {
    const { tutorProfile } = await createTutor();
    const prepared = await prepareReservation(tutorProfile.id);
    const locked = deferred();
    const release = deferred();
    const order: string[] = [];
    const attempts = { count: 0, errors: [] as unknown[] };

    const reservation = reserveWithRetry(
      prepared.input,
      {
        afterReserve: async (attempt) => {
          if (attempt !== 1) return;
          locked.resolve();
          await release.promise;
        },
      },
      attempts
    ).then((booking) => {
      order.push("reservation-committed");
      return booking;
    });

    await locked.promise;
    const suspension = suspendTutor(tutorProfile.id, adminUserId, "rw03 ordering 1").then(() => {
      order.push("suspension-committed");
    });

    await waitForLockWait('UPDATE "public"."TutorProfile"');
    expect(order).toEqual([]); // suspension genuinely blocked, not finished
    release.resolve();

    const booking = await reservation;
    await suspension;

    expect(order).toEqual(["reservation-committed", "suspension-committed"]);
    expect(attempts.count).toBe(1);
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("PENDING_PAYMENT");
    expect((await db.tutorProfile.findUniqueOrThrow({ where: { id: tutorProfile.id } })).applicationStatus).toBe("SUSPENDED");
  });

  it("ORDERING 2 — suspension commits after the reservation's snapshot but before its lock: 40001 -> retry -> refused, nothing written", async () => {
    const { tutorProfile } = await createTutor();
    const prepared = await prepareReservation(tutorProfile.id);
    const snapshotTaken = deferred();
    const suspensionCommitted = deferred();
    const attempts = { count: 0, errors: [] as unknown[] };

    const reservation = reserveWithRetry(
      prepared.input,
      {
        beforeReserve: async (tx, attempt) => {
          // Establish this transaction's snapshot first (Quick Match accept
          // reads the invitation/request before reaching the reservation).
          await tx.studentProfile.findUniqueOrThrow({ where: { id: prepared.input.studentProfileId } });
          if (attempt !== 1) return;
          snapshotTaken.resolve();
          await suspensionCommitted.promise;
        },
      },
      attempts
    );

    await snapshotTaken.promise;
    await suspendTutor(tutorProfile.id, adminUserId, "rw03 ordering 2");
    suspensionCommitted.resolve();

    await expect(reservation).rejects.toBeInstanceOf(TutorNotBookableError);
    expect(attempts.count).toBe(2);
    expect(isSerializationFailure(attempts.errors[0])).toBe(true);
    expect(attempts.errors[1]).toBeInstanceOf(TutorNotBookableError);
    await expectNothingReserved(prepared);
  });

  it("ORDERING 3 — suspension UPDATE in flight (uncommitted) when the reservation reaches its lock: the reservation waits, then 40001 -> retry -> refused", async () => {
    const { tutorProfile } = await createTutor();
    const prepared = await prepareReservation(tutorProfile.id);
    const updated = deferred();
    const commitSuspension = deferred();
    const attempts = { count: 0, errors: [] as unknown[] };
    const { db: ambientDb } = await import("@/lib/db");

    // Same statement suspendTutor issues, held open so the reservation's
    // FOR SHARE has to wait on it (suspendTutor itself cannot be paused).
    const suspension = ambientDb.$transaction(
      async (tx) => {
        await tx.tutorProfile.update({ where: { id: tutorProfile.id }, data: { applicationStatus: "SUSPENDED" } });
        updated.resolve();
        await commitSuspension.promise;
      },
      { timeout: 30_000, maxWait: 10_000 }
    );

    await updated.promise;
    const reservation = reserveWithRetry(prepared.input, {}, attempts);
    await waitForLockWait("FOR SHARE");
    commitSuspension.resolve();
    await suspension;

    await expect(reservation).rejects.toBeInstanceOf(TutorNotBookableError);
    expect(attempts.count).toBe(2);
    expect(isSerializationFailure(attempts.errors[0])).toBe(true);
    await expectNothingReserved(prepared);
  });

  it("ORDERING 3b — the in-flight suspension rolls back: the waiting reservation proceeds and books", async () => {
    const { tutorProfile } = await createTutor();
    const prepared = await prepareReservation(tutorProfile.id);
    const updated = deferred();
    const abortSuspension = deferred();
    const { db: ambientDb } = await import("@/lib/db");

    const suspension = ambientDb
      .$transaction(
        async (tx) => {
          await tx.tutorProfile.update({ where: { id: tutorProfile.id }, data: { applicationStatus: "SUSPENDED" } });
          updated.resolve();
          await abortSuspension.promise;
          throw new Error("rw03: deliberate rollback");
        },
        { timeout: 30_000, maxWait: 10_000 }
      )
      .catch((error: Error) => error.message);

    await updated.promise;
    const reservation = reserveWithRetry(prepared.input);
    await waitForLockWait("FOR SHARE");
    abortSuspension.resolve();

    expect(await suspension).toBe("rw03: deliberate rollback");
    const booking = await reservation;
    expect(booking.status).toBe("PENDING_PAYMENT");
    expect((await db.tutorProfile.findUniqueOrThrow({ where: { id: tutorProfile.id } })).applicationStatus).toBe("APPROVED");
  });

  it("USER DEACTIVATION, reservation first: the User UPDATE blocks on the lock until the booking commits", async () => {
    const { tutorProfile, user } = await createTutor();
    const prepared = await prepareReservation(tutorProfile.id);
    const locked = deferred();
    const release = deferred();
    const order: string[] = [];

    const reservation = reserveWithRetry(prepared.input, {
      afterReserve: async (attempt) => {
        if (attempt !== 1) return;
        locked.resolve();
        await release.promise;
      },
    }).then((b) => {
      order.push("reservation-committed");
      return b;
    });

    await locked.promise;
    const deactivation = deactivateUser(user.id)().then(() => order.push("deactivation-committed"));
    await waitForLockWait('UPDATE "public"."User"');
    expect(order).toEqual([]);
    release.resolve();

    await reservation;
    await deactivation;
    expect(order).toEqual(["reservation-committed", "deactivation-committed"]);
  });

  it("USER DEACTIVATION, committed after the reservation's snapshot: 40001 -> retry -> refused, nothing written", async () => {
    const { tutorProfile, user } = await createTutor();
    const prepared = await prepareReservation(tutorProfile.id);
    const snapshotTaken = deferred();
    const deactivated = deferred();
    const attempts = { count: 0, errors: [] as unknown[] };

    const reservation = reserveWithRetry(
      prepared.input,
      {
        beforeReserve: async (tx, attempt) => {
          await tx.studentProfile.findUniqueOrThrow({ where: { id: prepared.input.studentProfileId } });
          if (attempt !== 1) return;
          snapshotTaken.resolve();
          await deactivated.promise;
        },
      },
      attempts
    );

    await snapshotTaken.promise;
    await deactivateUser(user.id)();
    deactivated.resolve();

    await expect(reservation).rejects.toBeInstanceOf(TutorNotBookableError);
    expect(attempts.count).toBe(2);
    expect(isSerializationFailure(attempts.errors[0])).toBe(true);
    await expectNothingReserved(prepared);
  });

  it("CONTENTION — two reservations for the same tutor (different slots) never block each other on the bookability lock", async () => {
    const { tutorProfile } = await createTutor();
    const first = await prepareReservation(tutorProfile.id);
    const second = await prepareReservation(tutorProfile.id);
    const firstHoldsLock = deferred();
    const releaseFirst = deferred();

    const firstReservation = reserveWithRetry(first.input, {
      afterReserve: async (attempt) => {
        if (attempt !== 1) return;
        firstHoldsLock.resolve();
        await releaseFirst.promise;
      },
    });

    await firstHoldsLock.promise;
    // Completes while the first transaction still holds its FOR SHARE locks.
    const secondBooking = await reserveWithRetry(second.input);
    expect(secondBooking.status).toBe("PENDING_PAYMENT");
    releaseFirst.resolve();

    const firstBooking = await firstReservation;
    expect(firstBooking.status).toBe("PENDING_PAYMENT");
    expect(await db.booking.count({ where: { tutorProfileId: tutorProfile.id } })).toBe(2);
  });
});
