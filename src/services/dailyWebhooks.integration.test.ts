import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";
import { withSerializableRetry } from "@/lib/serializableRetry";
import type { VideoProviderAdapter } from "./videoProvider";

// VIDEO-1B — Daily webhook business-event processing integration coverage.
// Mirrors videoJoin.integration.test.ts's exact DB-target-redirection
// technique. Signature verification itself is unit-tested separately
// (src/lib/dailyWebhookSignature.test.ts) — this file starts one layer in,
// exercising processDailyWebhookEvent directly with already-parsed event
// bodies, exactly as the route handler would call it AFTER signature
// verification has already passed. Never calls a real Daily API.

vi.mock("@/lib/stripe", () => ({ getStripeClient: vi.fn() }));

let createCustomerPriceQuote: typeof import("./customerPricing").createCustomerPriceQuote;
let createTutorPayoutQuote: typeof import("./tutorPayout").createTutorPayoutQuote;
let reserveBookingPendingPayment: typeof import("./bookingCreation").reserveBookingPendingPayment;
let convergeToCaptured: typeof import("./payments").convergeToCaptured;
let ensureVideoRoomForSession: typeof import("./videoSession").ensureVideoRoomForSession;
let processDailyWebhookEvent: typeof import("./dailyWebhooks").processDailyWebhookEvent;
let MalformedDailyWebhookPayloadError: typeof import("./dailyWebhooks").MalformedDailyWebhookPayloadError;
let UnsupportedDailyWebhookEventError: typeof import("./dailyWebhooks").UnsupportedDailyWebhookEventError;

let db: PrismaClient;
let subjectId: string;
let academicLevelId: string;

const createdUserIds: string[] = [];
const createdStudentProfileIds: string[] = [];
const createdParentProfileIds: string[] = [];
const createdRelationshipIds: string[] = [];
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
  ({ ensureVideoRoomForSession } = await import("./videoSession"));
  ({ processDailyWebhookEvent, MalformedDailyWebhookPayloadError, UnsupportedDailyWebhookEventError } = await import(
    "./dailyWebhooks"
  ));

  const { db: ambientDb } = await import("@/lib/db");
  const [{ current_database: ambientDatabaseName }] = await ambientDb.$queryRaw<
    Array<{ current_database: string }>
  >`SELECT current_database()`;
  if (ambientDatabaseName !== target.databaseName) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton reports current_database() = "${ambientDatabaseName}", but the verified test database is "${target.databaseName}". Refusing to run any Daily webhook integration test.`
    );
  }
  const devDatabaseNameForSafetyCheckOnly = devDatabaseUrlForSafetyCheckOnly
    ? new URL(devDatabaseUrlForSafetyCheckOnly).pathname.replace(/^\//, "")
    : null;
  if (devDatabaseNameForSafetyCheckOnly && ambientDatabaseName === devDatabaseNameForSafetyCheckOnly) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton's current_database() ("${ambientDatabaseName}") equals the real development database name. Refusing to run any Daily webhook integration test.`
    );
  }

  const subject = await db.subject.create({ data: { slug: `dailywh-it-subject-${randomUUID()}`, sortOrder: 999 } });
  subjectId = subject.id;
  const level = await db.academicLevel.create({ data: { slug: `dailywh-it-level-${randomUUID()}`, sortOrder: 999 } });
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
  const { getStripeClient } = await import("@/lib/stripe");
  vi.mocked(getStripeClient).mockReset();

  if (createdRelationshipIds.length > 0) {
    await db.parentStudentRelationship.deleteMany({ where: { id: { in: createdRelationshipIds } } });
    createdRelationshipIds.length = 0;
  }
  if (createdBookingIds.length > 0) {
    const sessions = await db.session_.findMany({ where: { bookingId: { in: createdBookingIds } }, select: { id: true } });
    if (sessions.length > 0) {
      await db.sessionAttendanceEvent.deleteMany({ where: { sessionId: { in: sessions.map((s) => s.id) } } });
      await db.auditLog.deleteMany({ where: { entityId: { in: sessions.map((s) => s.id) } } });
    }
    await db.auditLog.deleteMany({ where: { entityId: { in: createdBookingIds } } });
    await db.tutorEarning.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
    await db.bookingStatusHistory.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
    await db.session_.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
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
  if (createdParentProfileIds.length > 0) {
    await db.parentProfile.deleteMany({ where: { id: { in: createdParentProfileIds } } });
    createdParentProfileIds.length = 0;
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
  return `dailywh-it-${prefix}-${randomUUID()}@futuretutor.test`;
}

async function createTutorUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("tutor"), role: "TUTOR" } });
  createdUserIds.push(user.id);
  const tutorProfile = await db.tutorProfile.create({
    data: { userId: user.id, slug: `dailywh-it-tutor-${randomUUID()}`, applicationStatus: "APPROVED", payoutTier: "NEW", learningMode: "BOTH" },
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

async function attachGuardian(studentProfileId: string, relationshipStatus: "ACTIVE" | "REVOKED") {
  const parentUser = await db.user.create({ data: { email: uniqueEmail("parent"), role: "PARENT" } });
  createdUserIds.push(parentUser.id);
  const parentProfile = await db.parentProfile.create({ data: { userId: parentUser.id, firstName: "Test", lastName: "Parent" } });
  createdParentProfileIds.push(parentProfile.id);
  const relationship = await db.parentStudentRelationship.create({
    data: { parentProfileId: parentProfile.id, studentProfileId, status: relationshipStatus, createdByUserId: parentUser.id },
  });
  createdRelationshipIds.push(relationship.id);
  return { parentUser };
}

async function setupConfirmedBookingWithRoom() {
  const startAt = DEFAULT_TEST_START_AT;
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
  const tutor = await createTutorUser();
  const student = await createSelfManagedStudent();

  const quote = await createCustomerPriceQuote(
    { createdByUserId: student.user.id, studentProfileId: student.studentProfile.id, subjectId, academicLevelId, tutoringMode: "ONLINE", durationMinutes: 60, requestedStartAt: startAt },
    db
  );
  createdCustomerQuoteIds.push(quote.id);
  const payoutQuote = await createTutorPayoutQuote(
    { tutorProfileId: tutor.tutorProfile.id, subjectId, academicLevelId, tutoringMode: "ONLINE", durationMinutes: 60, requestedStartAt: startAt },
    quote.id,
    db
  );
  createdTutorPayoutQuoteIds.push(payoutQuote.id);
  const payment = await db.payment.create({
    data: { id: randomUUID(), customerPriceQuoteId: quote.id, payerUserId: student.user.id, amountCents: quote.totalCents, currency: quote.currency, status: "PENDING" },
  });
  createdPaymentIds.push(payment.id);

  const booking = await withSerializableRetry(() =>
    db.$transaction(
      (tx) =>
        reserveBookingPendingPayment(tx, {
          actorUserId: student.user.id,
          studentProfileId: student.studentProfile.id,
          tutorProfileId: tutor.tutorProfile.id,
          subjectId,
          academicLevelId,
          startAt,
          endAt,
          timezone: "America/Toronto",
          mode: "ONLINE",
          paymentId: payment.id,
          customerPriceQuoteId: quote.id,
          tutorPayoutQuoteId: payoutQuote.id,
          tutoringRequestId: null,
        }),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  );
  createdBookingIds.push(booking.id);

  await db.payment.update({ where: { id: payment.id }, data: { status: "AUTHORIZED", stripePaymentIntentId: `pi_fake_${randomUUID()}` } });
  await convergeToCaptured(payment.id);

  const session = await db.session_.findUniqueOrThrow({ where: { bookingId: booking.id } });
  const provider: VideoProviderAdapter = {
    name: "DAILY",
    async createRoom() {
      return { providerRoomId: `ft-fake-room-${randomUUID().slice(0, 8)}` };
    },
    async createParticipantToken() {
      return { token: "fake-token", expiresAt: new Date() };
    },
    async revokeRoomAccess() {},
  };
  const providerRoomId = await ensureVideoRoomForSession(session.id, provider);

  return { tutor, student, booking, session, providerRoomId: providerRoomId as string };
}

function participantJoinedEvent(room: string, userId: string) {
  return {
    version: "1.0.0",
    type: "participant.joined",
    id: `ptcpt-join-${randomUUID()}`,
    payload: {
      room,
      user_id: userId,
      user_name: "test",
      session_id: randomUUID(),
      joined_at: Date.now() / 1000,
      owner: false,
    },
    event_ts: Date.now() / 1000,
  };
}

describe("processDailyWebhookEvent — correlation and basic outcomes", () => {
  it("STUDENT join: correlates room+user, records ONLINE_ACTIVITY CHECK_IN", async () => {
    const { booking, session, student, providerRoomId } = await setupConfirmedBookingWithRoom();

    const result = await processDailyWebhookEvent(participantJoinedEvent(providerRoomId, student.user.id));

    expect(result.handled).toBe(true);
    const events = await db.sessionAttendanceEvent.findMany({ where: { sessionId: session.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ participantRole: "STUDENT", source: "ONLINE_ACTIVITY", eventType: "CHECK_IN" });
    const bookingAfter = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(bookingAfter.status).toBe("CONFIRMED"); // financial firewall — unaffected
  });

  it("TUTOR join: correlates room+user, records ONLINE_ACTIVITY CHECK_IN", async () => {
    const { session, tutor, providerRoomId } = await setupConfirmedBookingWithRoom();

    await processDailyWebhookEvent(participantJoinedEvent(providerRoomId, tutor.user.id));

    const events = await db.sessionAttendanceEvent.findMany({ where: { sessionId: session.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ participantRole: "TUTOR", source: "ONLINE_ACTIVITY" });
  });

  it("PARENT observer join: does NOT count toward dual-presence attendance", async () => {
    const { session, student, providerRoomId } = await setupConfirmedBookingWithRoom();
    const { parentUser } = await attachGuardian(student.studentProfile.id, "ACTIVE");

    const result = await processDailyWebhookEvent(participantJoinedEvent(providerRoomId, parentUser.id));

    expect(result.handled).toBe(true); // correlated fine — just no attendance written
    const events = await db.sessionAttendanceEvent.findMany({ where: { sessionId: session.id } });
    expect(events).toHaveLength(0);
    const sessionAfter = await db.session_.findUniqueOrThrow({ where: { id: session.id } });
    expect(sessionAfter.status).toBe("SCHEDULED");
  });

  it("unknown room: safely ignored, no error, no attendance", async () => {
    const { student } = await setupConfirmedBookingWithRoom();
    const result = await processDailyWebhookEvent(participantJoinedEvent("ft-totally-unknown-room", student.user.id));
    expect(result).toEqual({ handled: false, reason: "unknown_room" });
  });

  it("cancelled booking: a late-arriving join event is safely ignored, not a thrown error, not attendance", async () => {
    const { booking, session, student, providerRoomId } = await setupConfirmedBookingWithRoom();
    await db.booking.update({ where: { id: booking.id }, data: { status: "CANCELLED" } });
    await db.session_.update({ where: { id: session.id }, data: { status: "CANCELLED" } });

    const result = await processDailyWebhookEvent(participantJoinedEvent(providerRoomId, student.user.id));

    expect(result.handled).toBe(true); // correlated fine — recordSessionCheckIn's own eligibility gate rejects it, caught as a safe no-op
    const events = await db.sessionAttendanceEvent.findMany({ where: { sessionId: session.id } });
    expect(events).toHaveLength(0);
    const sessionAfter = await db.session_.findUniqueOrThrow({ where: { id: session.id } });
    expect(sessionAfter.status).toBe("CANCELLED"); // unchanged — never resurrected by a late join signal
  });

  it("unknown participant (user_id not a real FutureTutor user): safely ignored", async () => {
    const { session, providerRoomId } = await setupConfirmedBookingWithRoom();
    const result = await processDailyWebhookEvent(participantJoinedEvent(providerRoomId, "nonexistent-user-id"));
    expect(result).toEqual({ handled: false, reason: "unknown_participant" });
    const events = await db.sessionAttendanceEvent.findMany({ where: { sessionId: session.id } });
    expect(events).toHaveLength(0);
  });

  it("unrelated user (real FutureTutor user, but not authorized for this booking): correlates but records nothing", async () => {
    const { session, providerRoomId } = await setupConfirmedBookingWithRoom();
    const unrelated = await createSelfManagedStudent();

    const result = await processDailyWebhookEvent(participantJoinedEvent(providerRoomId, unrelated.user.id));

    expect(result.handled).toBe(true);
    const events = await db.sessionAttendanceEvent.findMany({ where: { sessionId: session.id } });
    expect(events).toHaveLength(0);
  });

  it("malformed event (missing payload): throws MalformedDailyWebhookPayloadError", async () => {
    await expect(processDailyWebhookEvent({ type: "participant.joined" })).rejects.toThrow(
      MalformedDailyWebhookPayloadError
    );
  });

  it("malformed event (not an object): throws MalformedDailyWebhookPayloadError", async () => {
    await expect(processDailyWebhookEvent("not an object")).rejects.toThrow(MalformedDailyWebhookPayloadError);
  });

  it("unsupported event type: throws UnsupportedDailyWebhookEventError, never processed", async () => {
    await expect(
      processDailyWebhookEvent({ type: "meeting.ended", payload: { room: "ft-abc" } })
    ).rejects.toThrow(UnsupportedDailyWebhookEventError);
  });
});

describe("processDailyWebhookEvent — idempotency and dual-presence convergence", () => {
  it("duplicate delivery of the same participant.joined event is safe — no duplicate CHECK_IN row", async () => {
    const { session, student, providerRoomId } = await setupConfirmedBookingWithRoom();
    const event = participantJoinedEvent(providerRoomId, student.user.id);

    await processDailyWebhookEvent(event);
    await processDailyWebhookEvent(event); // exact same delivery, redelivered
    await processDailyWebhookEvent(participantJoinedEvent(providerRoomId, student.user.id)); // a distinct redelivery (new event id)

    const events = await db.sessionAttendanceEvent.findMany({ where: { sessionId: session.id, participantRole: "STUDENT" } });
    expect(events).toHaveLength(1);
  });

  it("Student then Tutor join -> Session_ transitions SCHEDULED -> IN_PROGRESS exactly once", async () => {
    const { session, student, tutor, providerRoomId } = await setupConfirmedBookingWithRoom();

    await processDailyWebhookEvent(participantJoinedEvent(providerRoomId, student.user.id));
    let sessionState = await db.session_.findUniqueOrThrow({ where: { id: session.id } });
    expect(sessionState.status).toBe("SCHEDULED");

    await processDailyWebhookEvent(participantJoinedEvent(providerRoomId, tutor.user.id));
    sessionState = await db.session_.findUniqueOrThrow({ where: { id: session.id } });
    expect(sessionState.status).toBe("IN_PROGRESS");

    // A further redelivery for either party must not un-converge or re-fire anything.
    await processDailyWebhookEvent(participantJoinedEvent(providerRoomId, student.user.id));
    sessionState = await db.session_.findUniqueOrThrow({ where: { id: session.id } });
    expect(sessionState.status).toBe("IN_PROGRESS");
    const events = await db.sessionAttendanceEvent.findMany({ where: { sessionId: session.id } });
    expect(events).toHaveLength(2); // exactly one STUDENT + one TUTOR CHECK_IN, no duplicates
  });

  it("a parent-observer join interleaved with student+tutor joins never affects the dual-presence transition", async () => {
    const { session, student, tutor, providerRoomId } = await setupConfirmedBookingWithRoom();
    const { parentUser } = await attachGuardian(student.studentProfile.id, "ACTIVE");

    await processDailyWebhookEvent(participantJoinedEvent(providerRoomId, parentUser.id));
    await processDailyWebhookEvent(participantJoinedEvent(providerRoomId, student.user.id));
    await processDailyWebhookEvent(participantJoinedEvent(providerRoomId, parentUser.id));
    await processDailyWebhookEvent(participantJoinedEvent(providerRoomId, tutor.user.id));

    const sessionState = await db.session_.findUniqueOrThrow({ where: { id: session.id } });
    expect(sessionState.status).toBe("IN_PROGRESS");
    const events = await db.sessionAttendanceEvent.findMany({ where: { sessionId: session.id } });
    expect(events).toHaveLength(2); // only STUDENT + TUTOR — the parent's two joins wrote nothing
  });

  it("token-request-alone (no webhook event) never produces attendance — only a processed participant.joined event does", async () => {
    const { session } = await setupConfirmedBookingWithRoom();
    // No processDailyWebhookEvent call at all here — simulating "a token was
    // issued but the participant never actually joined" (or the webhook
    // simply never arrived).
    const events = await db.sessionAttendanceEvent.findMany({ where: { sessionId: session.id } });
    expect(events).toHaveLength(0);
  });
});

describe("processDailyWebhookEvent — financial firewall (VIDEO-1B §17)", () => {
  it("a fully successful dual-presence join sequence never touches Booking, Payment, or TutorEarning", async () => {
    const { booking, student, tutor, providerRoomId } = await setupConfirmedBookingWithRoom();

    await processDailyWebhookEvent(participantJoinedEvent(providerRoomId, student.user.id));
    await processDailyWebhookEvent(participantJoinedEvent(providerRoomId, tutor.user.id));

    const bookingAfter = await db.booking.findUniqueOrThrow({ where: { id: booking.id }, include: { payment: true } });
    expect(bookingAfter.status).toBe("CONFIRMED"); // never COMPLETED from this event alone
    expect(bookingAfter.payment?.status).toBe("CAPTURED"); // unchanged
    const earning = await db.tutorEarning.findUnique({ where: { bookingId: booking.id } });
    expect(earning?.status).toBe("PENDING_ELIGIBLE"); // unchanged — eligibility is time+status driven, not video-driven
  });
});
