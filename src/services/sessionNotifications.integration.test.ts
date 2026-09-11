import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";

// SESSION-NOTIFICATION-INAPP-DEDUP-FIX1 — real-DB integration coverage for
// the durable in-app dedup fix. Mirrors tutorEarningConvergence.integration.
// test.ts's own DB-target-redirection technique exactly (resolveVerifiedTestDatabase,
// tracked-id cleanup arrays, ambient @/lib/db singleton redirected to
// futuretutor_test BEFORE any transitively-DB-touching module is imported).
// No Stripe involved anywhere in this file — Payment rows are seeded
// directly as already-AUTHORIZED/CAPTURED, never through a real Stripe call.

let createCustomerPriceQuote: typeof import("./customerPricing").createCustomerPriceQuote;
let createTutorPayoutQuote: typeof import("./tutorPayout").createTutorPayoutQuote;
let reserveBookingPendingPayment: typeof import("./bookingCreation").reserveBookingPendingPayment;
let convergeToCaptured: typeof import("./payments").convergeToCaptured;
let recordSessionCheckIn: typeof import("./sessionLifecycle").recordSessionCheckIn;
let resolveSessionNoShowConvergence: typeof import("./sessionLifecycle").resolveSessionNoShowConvergence;
let computeNoShowGraceDeadline: typeof import("./sessionLifecycle").computeNoShowGraceDeadline;
let sweepDueSessionReminders: typeof import("./sessionNotifications").sweepDueSessionReminders;
let emitSessionNotificationEvent: typeof import("./sessionNotifications").emitSessionNotificationEvent;
let withSerializableRetry: typeof import("@/lib/serializableRetry").withSerializableRetry;

let db: PrismaClient;
let subjectId: string;
let academicLevelId: string;

const createdUserIds: string[] = [];
const createdStudentProfileIds: string[] = [];
const createdTutorProfileIds: string[] = [];
const createdParentProfileIds: string[] = [];
const createdRelationshipIds: string[] = [];
const createdCustomerQuoteIds: string[] = [];
const createdTutorPayoutQuoteIds: string[] = [];
const createdPaymentIds: string[] = [];
const createdBookingIds: string[] = [];

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
  ({ recordSessionCheckIn, resolveSessionNoShowConvergence, computeNoShowGraceDeadline } = await import("./sessionLifecycle"));
  ({ sweepDueSessionReminders, emitSessionNotificationEvent } = await import("./sessionNotifications"));
  ({ withSerializableRetry } = await import("@/lib/serializableRetry"));

  const { db: ambientDb } = await import("@/lib/db");
  const [{ current_database: ambientDatabaseName }] = await ambientDb.$queryRaw<
    Array<{ current_database: string }>
  >`SELECT current_database()`;
  if (ambientDatabaseName !== target.databaseName) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton reports current_database() = "${ambientDatabaseName}", but the verified test database is "${target.databaseName}". Refusing to run any session-notification integration test.`
    );
  }
  const devDatabaseNameForSafetyCheckOnly = devDatabaseUrlForSafetyCheckOnly
    ? new URL(devDatabaseUrlForSafetyCheckOnly).pathname.replace(/^\//, "")
    : null;
  if (devDatabaseNameForSafetyCheckOnly && ambientDatabaseName === devDatabaseNameForSafetyCheckOnly) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton's current_database() ("${ambientDatabaseName}") equals the real development database name. Refusing to run any session-notification integration test.`
    );
  }

  const subject = await db.subject.create({ data: { slug: `snd-it-subject-${randomUUID()}`, sortOrder: 999 } });
  subjectId = subject.id;
  const level = await db.academicLevel.create({ data: { slug: `snd-it-level-${randomUUID()}`, sortOrder: 999 } });
  academicLevelId = level.id;
});

afterAll(async () => {
  await db.academicLevel.delete({ where: { id: academicLevelId } });
  await db.subject.delete({ where: { id: subjectId } });
  await db?.$disconnect();
});

afterEach(async () => {
  if (createdBookingIds.length > 0) {
    await db.sessionNotification.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
    await db.auditLog.deleteMany({ where: { entityId: { in: createdBookingIds } } });
    const sessionIds = (await db.session_.findMany({ where: { bookingId: { in: createdBookingIds } }, select: { id: true } })).map((s) => s.id);
    if (sessionIds.length > 0) {
      await db.sessionAttendanceEvent.deleteMany({ where: { sessionId: { in: sessionIds } } });
    }
    await db.session_.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
    await db.tutorEarning.deleteMany({ where: { bookingId: { in: createdBookingIds } } }); // convergeToCaptured's CONFIRMED branch always creates one alongside Session_
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
  if (createdRelationshipIds.length > 0) {
    await db.parentStudentRelationship.deleteMany({ where: { id: { in: createdRelationshipIds } } });
    createdRelationshipIds.length = 0;
  }
  if (createdParentProfileIds.length > 0) {
    await db.parentProfile.deleteMany({ where: { id: { in: createdParentProfileIds } } });
    createdParentProfileIds.length = 0;
  }
  if (createdStudentProfileIds.length > 0) {
    await db.studentProfile.deleteMany({ where: { id: { in: createdStudentProfileIds } } });
    createdStudentProfileIds.length = 0;
  }
  if (createdTutorProfileIds.length > 0) {
    await db.tutorProfile.deleteMany({ where: { id: { in: createdTutorProfileIds } } });
    createdTutorProfileIds.length = 0;
  }
  if (createdUserIds.length > 0) {
    await db.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
});

function uniqueEmail(prefix: string) {
  return `snd-it-${prefix}-${randomUUID()}@futuretutor.test`;
}

async function createTutorUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("tutor"), role: "TUTOR" } });
  createdUserIds.push(user.id);
  const tutorProfile = await db.tutorProfile.create({
    data: { userId: user.id, slug: `snd-it-tutor-${randomUUID()}`, applicationStatus: "APPROVED", payoutTier: "NEW", learningMode: "BOTH" },
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

async function createGuardianManagedStudentWithParent() {
  const studentProfile = await db.studentProfile.create({
    data: { firstName: "Child", lastName: "Student", managementMode: "GUARDIAN_MANAGED" },
  });
  createdStudentProfileIds.push(studentProfile.id);
  const parentUser = await db.user.create({ data: { email: uniqueEmail("parent"), role: "PARENT" } });
  createdUserIds.push(parentUser.id);
  const parentProfile = await db.parentProfile.create({ data: { userId: parentUser.id, firstName: "Test", lastName: "Parent" } });
  createdParentProfileIds.push(parentProfile.id);
  const relationship = await db.parentStudentRelationship.create({
    data: { parentProfileId: parentProfile.id, studentProfileId: studentProfile.id, status: "ACTIVE", createdByUserId: parentUser.id },
  });
  createdRelationshipIds.push(relationship.id);
  return { parentUser, parentProfile, studentProfile };
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

/** Confirmed, CAPTURED booking with a real tutor + self-managed student
 * payer, `startAt` controllable so it can be placed inside the 24h or 2h
 * reminder window. */
async function setupConfirmedBooking(overrides: { startAt?: Date } = {}) {
  const startAt = overrides.startAt ?? new Date(Date.now() + 90 * 60 * 1000); // 90 min out — inside the 2h reminder window by default
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
  await db.payment.update({ where: { id: payment.id }, data: { status: "AUTHORIZED", stripePaymentIntentId: `pi_fake_${randomUUID()}` } });
  await convergeToCaptured(payment.id);
  return { tutor, student, payment, booking };
}

/** Same as setupConfirmedBooking, but the payer is a PARENT (guardian-
 * managed student) — for the Phase 6 guardian-privacy regression check. */
async function setupConfirmedBookingGuardianManaged(overrides: { startAt?: Date } = {}) {
  const startAt = overrides.startAt ?? new Date(Date.now() + 90 * 60 * 1000);
  const tutor = await createTutorUser();
  const { parentUser, studentProfile } = await createGuardianManagedStudentWithParent();
  const quote = await makeQuote(parentUser.id, studentProfile.id, startAt);
  const payoutQuote = await makePayoutQuote(tutor.tutorProfile.id, quote.id, startAt);
  const payment = await makePayment(quote.id, parentUser.id);
  const booking = await reserveBooking({
    actorUserId: parentUser.id,
    studentProfileId: studentProfile.id,
    tutorProfileId: tutor.tutorProfile.id,
    customerPriceQuoteId: quote.id,
    tutorPayoutQuoteId: payoutQuote.id,
    paymentId: payment.id,
    startAt,
  });
  await db.payment.update({ where: { id: payment.id }, data: { status: "AUTHORIZED", stripePaymentIntentId: `pi_fake_${randomUUID()}` } });
  await convergeToCaptured(payment.id);
  return { tutor, parentUser, studentProfile, payment, booking };
}

async function inAppNotificationCount(userId: string, type: string, bookingId: string) {
  return db.notification.count({
    where: { userId, type, metadata: { path: ["bookingId"], equals: bookingId } },
  });
}

async function sessionNotificationCount(bookingId: string, event: string, recipientUserId: string) {
  return db.sessionNotification.count({ where: { bookingId, event: event as never, recipientUserId } });
}

describe("SESSION-NOTIFICATION-INAPP-DEDUP-FIX1 — repeated reminder emission (the certified bug scenario)", () => {
  it("repeated 2H reminder ticks (simulating 8 real cron ticks across the 2h window) create exactly ONE in-app row per recipient — the certified bug, fixed", async () => {
    const startAt = new Date(Date.now() + 90 * 60 * 1000); // inside the 2h window
    const { tutor, student, payment, booking } = await setupConfirmedBooking({ startAt });

    for (let i = 0; i < 8; i++) {
      await sweepDueSessionReminders();
    }

    expect(await inAppNotificationCount(tutor.user.id, "session.session_reminder_2h", booking.id)).toBe(1);
    expect(await inAppNotificationCount(student.user.id, "session.session_reminder_2h", booking.id)).toBe(1);
    // Email/outbox regression: the outbox path was already correct — still exactly 1 each.
    expect(await sessionNotificationCount(booking.id, "SESSION_REMINDER_2H", tutor.user.id)).toBe(1);
    expect(await sessionNotificationCount(booking.id, "SESSION_REMINDER_2H", student.user.id)).toBe(1);
    void payment;
  });

  it("repeated 24H reminder ticks create exactly ONE in-app row per recipient", async () => {
    const startAt = new Date(Date.now() + 20 * 60 * 60 * 1000); // inside the 24h window ([2h, 24h))
    const { tutor, student, booking } = await setupConfirmedBooking({ startAt });

    for (let i = 0; i < 5; i++) {
      await sweepDueSessionReminders();
    }

    expect(await inAppNotificationCount(tutor.user.id, "session.session_reminder_24h", booking.id)).toBe(1);
    expect(await inAppNotificationCount(student.user.id, "session.session_reminder_24h", booking.id)).toBe(1);
    expect(await sessionNotificationCount(booking.id, "SESSION_REMINDER_24H", tutor.user.id)).toBe(1);
    expect(await sessionNotificationCount(booking.id, "SESSION_REMINDER_24H", student.user.id)).toBe(1);
  });

  it("24H and 2H coexist correctly — a booking that naturally crosses both windows over time gets one notification of EACH per recipient, neither suppressing the other", async () => {
    // Start inside the 24h window, converge the row, then hand-move the
    // booking into the 2h window (simulating real time passing) and sweep
    // again — proves the two events use genuinely distinct dedupeKeys.
    const startAt = new Date(Date.now() + 20 * 60 * 60 * 1000);
    const { tutor, student, booking } = await setupConfirmedBooking({ startAt });
    await sweepDueSessionReminders();
    expect(await inAppNotificationCount(tutor.user.id, "session.session_reminder_24h", booking.id)).toBe(1);

    await db.booking.update({ where: { id: booking.id }, data: { startAt: new Date(Date.now() + 90 * 60 * 1000), endAt: new Date(Date.now() + 150 * 60 * 1000) } });
    await sweepDueSessionReminders();

    expect(await inAppNotificationCount(tutor.user.id, "session.session_reminder_24h", booking.id)).toBe(1); // untouched
    expect(await inAppNotificationCount(tutor.user.id, "session.session_reminder_2h", booking.id)).toBe(1); // newly created
    expect(await inAppNotificationCount(student.user.id, "session.session_reminder_24h", booking.id)).toBe(1);
    expect(await inAppNotificationCount(student.user.id, "session.session_reminder_2h", booking.id)).toBe(1);
  });
});

describe("SESSION-NOTIFICATION-INAPP-DEDUP-FIX1 — Phase 3: concurrency", () => {
  it("two simultaneous sweeps for the same due booking still produce exactly ONE in-app row per recipient", async () => {
    const startAt = new Date(Date.now() + 90 * 60 * 1000);
    const { tutor, student, booking } = await setupConfirmedBooking({ startAt });

    await Promise.all([sweepDueSessionReminders(), sweepDueSessionReminders()]);

    expect(await inAppNotificationCount(tutor.user.id, "session.session_reminder_2h", booking.id)).toBe(1);
    expect(await inAppNotificationCount(student.user.id, "session.session_reminder_2h", booking.id)).toBe(1);
  });

  it("two concurrent direct emitSessionNotificationEvent calls with the identical dedupeKey produce exactly ONE durable in-app row (Postgres-level, not app-level, deduplication)", async () => {
    const { tutor, booking } = await setupConfirmedBooking();
    const dedupeKey = `session:${booking.id}:SESSION_REMINDER_24H:TUTOR`;

    await Promise.all(
      [0, 1].map(() =>
        db.$transaction((tx) =>
          emitSessionNotificationEvent(tx, {
            bookingId: booking.id,
            recipientUserId: tutor.user.id,
            recipientRole: "TUTOR",
            event: "SESSION_REMINDER_24H",
            dedupeKey,
            inAppTitle: "Upcoming session tomorrow",
            inAppBody: "body",
          })
        )
      )
    );

    expect(await inAppNotificationCount(tutor.user.id, "session.session_reminder_24h", booking.id)).toBe(1);
  });
});

describe("SESSION-NOTIFICATION-INAPP-DEDUP-FIX1 — Phase 2/6: other emitSessionNotificationEvent call sites (cancellation, no-show) unaffected in behavior, now also durably deduped", () => {
  it("SESSION_CANCELLED: repeated emission for the same booking/role produces exactly one in-app row (previously would have duplicated)", async () => {
    const { tutor, booking } = await setupConfirmedBooking();
    const emit = () =>
      db.$transaction((tx) =>
        emitSessionNotificationEvent(tx, {
          bookingId: booking.id,
          recipientUserId: tutor.user.id,
          recipientRole: "TUTOR",
          event: "SESSION_CANCELLED",
          dedupeKey: `session:${booking.id}:SESSION_CANCELLED:TUTOR`,
          detail: { cancelledByRelation: "OTHER_PARTY" },
          inAppTitle: "Session cancelled",
          inAppBody: "One of your upcoming sessions was cancelled.",
        })
      );

    await emit();
    await emit();
    await emit();

    expect(await inAppNotificationCount(tutor.user.id, "session.session_cancelled", booking.id)).toBe(1);
    expect(await sessionNotificationCount(booking.id, "SESSION_CANCELLED", tutor.user.id)).toBe(1); // outbox regression check
  });

  it("no-show convergence (SESSION_NO_SHOW_TUTOR) via the real sessionLifecycle.ts call path creates exactly one in-app row, and a repeated direct emission with the same key does not add a second", async () => {
    const { student, booking } = await setupConfirmedBooking({ startAt: new Date(Date.now() + 5 * 60 * 1000) });
    await recordSessionCheckIn(booking.id, student.user.id, "STUDENT", { actorRole: "STUDENT" });
    const deadline = computeNoShowGraceDeadline(booking.startAt);
    const result = await resolveSessionNoShowConvergence(booking.id, { clock: () => deadline });
    expect(result.decision).toBe("TUTOR_NO_SHOW");

    // The real no-show convergence path already emitted once (via
    // sessionLifecycle.ts's own emitSessionNotificationEvent call) — a
    // hypothetical repeat (e.g. a retried convergence sweep) must not add
    // a second row.
    expect(await inAppNotificationCount(student.user.id, "session.session_no_show_tutor", booking.id)).toBe(1);

    await db.$transaction((tx) =>
      emitSessionNotificationEvent(tx, {
        bookingId: booking.id,
        recipientUserId: student.user.id,
        recipientRole: "PAYER",
        event: "SESSION_NO_SHOW_TUTOR",
        dedupeKey: `session:${booking.id}:SESSION_NO_SHOW_TUTOR:PAYER`,
        inAppTitle: "Session marked as missed",
        inAppBody: "This session was marked as missed based on check-in records.",
      })
    );
    expect(await inAppNotificationCount(student.user.id, "session.session_no_show_tutor", booking.id)).toBe(1); // still 1, not 2
  });
});

describe("SESSION-NOTIFICATION-INAPP-DEDUP-FIX1 — Phase 6: guardian-managed recipient privacy unaffected", () => {
  it("a guardian-managed booking's reminder goes to the PARENT's userId only, exactly once, never to a second/leaked recipient", async () => {
    const startAt = new Date(Date.now() + 90 * 60 * 1000);
    const { tutor, parentUser, booking } = await setupConfirmedBookingGuardianManaged({ startAt });

    for (let i = 0; i < 3; i++) {
      await sweepDueSessionReminders();
    }

    expect(await inAppNotificationCount(tutor.user.id, "session.session_reminder_2h", booking.id)).toBe(1);
    expect(await inAppNotificationCount(parentUser.id, "session.session_reminder_2h", booking.id)).toBe(1);

    // No stray rows for anyone else: exactly 2 in-app rows total for this booking+event across ALL users.
    const total = await db.notification.count({
      where: { type: "session.session_reminder_2h", metadata: { path: ["bookingId"], equals: booking.id } },
    });
    expect(total).toBe(2);
  });
});

describe("SESSION-NOTIFICATION-INAPP-DEDUP-FIX1 — other notifyUser callers are unaffected (backward compatibility)", () => {
  it("notifyUser without a dedupeKey still creates a plain Notification row every call (unchanged behavior for every other caller)", async () => {
    const { user } = await createTutorUser();
    const { notifyUser } = await import("@/lib/notify");
    await db.$transaction(async (tx) => {
      await notifyUser(tx, { userId: user.id, type: "test.no_dedupe", title: "t1", body: "b1" });
      await notifyUser(tx, { userId: user.id, type: "test.no_dedupe", title: "t2", body: "b2" });
    });
    const count = await db.notification.count({ where: { userId: user.id, type: "test.no_dedupe" } });
    expect(count).toBe(2); // no dedupeKey passed -> unchanged plain-create behavior, both rows created
  });
});
