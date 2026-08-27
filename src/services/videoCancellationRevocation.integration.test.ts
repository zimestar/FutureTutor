import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";
import { withSerializableRetry } from "@/lib/serializableRetry";
import type { VideoProviderAdapter } from "./videoProvider";

// VIDEO-1B — cancellation video-access revocation integration coverage.
// Mirrors videoJoin.integration.test.ts / videoSession.integration.test.ts's
// exact DB-target-redirection technique. Never calls a real Daily API — the
// video provider is faked both directly (for revokeVideoAccessForCancelled
// Booking's own tests) and via a vi.mock of @/services/dailyVideoProvider's
// createDailyVideoProvider (for cancelBookingWithRefund's own tests, since
// that function constructs its own provider internally rather than
// accepting one as a parameter — see cancellationPolicy.ts).

vi.mock("@/lib/stripe", () => ({ getStripeClient: vi.fn() }));

const mockCreateDailyVideoProvider = vi.fn();
vi.mock("@/services/dailyVideoProvider", () => ({
  createDailyVideoProvider: () => mockCreateDailyVideoProvider(),
}));

let createCustomerPriceQuote: typeof import("./customerPricing").createCustomerPriceQuote;
let createTutorPayoutQuote: typeof import("./tutorPayout").createTutorPayoutQuote;
let reserveBookingPendingPayment: typeof import("./bookingCreation").reserveBookingPendingPayment;
let convergeToCaptured: typeof import("./payments").convergeToCaptured;
let ensureVideoRoomForSession: typeof import("./videoSession").ensureVideoRoomForSession;
let revokeVideoAccessForCancelledBooking: typeof import("./videoSession").revokeVideoAccessForCancelledBooking;
let cancelBookingWithRefund: typeof import("./cancellationPolicy").cancelBookingWithRefund;

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
  ({ ensureVideoRoomForSession, revokeVideoAccessForCancelledBooking } = await import("./videoSession"));
  ({ cancelBookingWithRefund } = await import("./cancellationPolicy"));

  const { db: ambientDb } = await import("@/lib/db");
  const [{ current_database: ambientDatabaseName }] = await ambientDb.$queryRaw<
    Array<{ current_database: string }>
  >`SELECT current_database()`;
  if (ambientDatabaseName !== target.databaseName) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton reports current_database() = "${ambientDatabaseName}", but the verified test database is "${target.databaseName}". Refusing to run any video cancellation revocation integration test.`
    );
  }
  const devDatabaseNameForSafetyCheckOnly = devDatabaseUrlForSafetyCheckOnly
    ? new URL(devDatabaseUrlForSafetyCheckOnly).pathname.replace(/^\//, "")
    : null;
  if (devDatabaseNameForSafetyCheckOnly && ambientDatabaseName === devDatabaseNameForSafetyCheckOnly) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton's current_database() ("${ambientDatabaseName}") equals the real development database name. Refusing to run any video cancellation revocation integration test.`
    );
  }

  const subject = await db.subject.create({ data: { slug: `vidcancel-it-subject-${randomUUID()}`, sortOrder: 999 } });
  subjectId = subject.id;
  const level = await db.academicLevel.create({ data: { slug: `vidcancel-it-level-${randomUUID()}`, sortOrder: 999 } });
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
  mockCreateDailyVideoProvider.mockReset();
  delete process.env.DAILY_API_KEY;

  if (createdRelationshipIds.length > 0) {
    await db.parentStudentRelationship.deleteMany({ where: { id: { in: createdRelationshipIds } } });
    createdRelationshipIds.length = 0;
  }
  if (createdBookingIds.length > 0) {
    await db.auditLog.deleteMany({ where: { entityId: { in: createdBookingIds } } });
    await db.tutorEarning.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
    await db.bookingStatusHistory.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
    const sessions = await db.session_.findMany({ where: { bookingId: { in: createdBookingIds } }, select: { id: true } });
    if (sessions.length > 0) {
      await db.auditLog.deleteMany({ where: { entityId: { in: sessions.map((s) => s.id) } } });
    }
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
  return `vidcancel-it-${prefix}-${randomUUID()}@futuretutor.test`;
}

async function createTutorUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("tutor"), role: "TUTOR" } });
  createdUserIds.push(user.id);
  const tutorProfile = await db.tutorProfile.create({
    data: { userId: user.id, slug: `vidcancel-it-tutor-${randomUUID()}`, applicationStatus: "APPROVED", payoutTier: "NEW", learningMode: "BOTH" },
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
  return { parentUser, parentProfile };
}

async function setupConfirmedBooking(overrides: { startAt?: Date } = {}) {
  const startAt = overrides.startAt ?? DEFAULT_TEST_START_AT;
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
    data: { id: randomUUID(), customerPriceQuoteId: quote.id, payerUserId: student.user.id, amountCents: quote.totalCents, currency: quote.currency, status: "AUTHORIZED", authorizedAt: new Date(), stripePaymentIntentId: `pi_test_${randomUUID()}` },
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
  return { tutor, student, booking, session };
}

function makeFakeProvider(opts: { onCreateRoom?: () => { providerRoomId: string }; onRevoke?: () => void | "throw" } = {}): VideoProviderAdapter & {
  __revokeCalls: Array<{ providerRoomId: string; knownParticipantUserIds: string[] }>;
} {
  let nextId = 1;
  const revokeCalls: Array<{ providerRoomId: string; knownParticipantUserIds: string[] }> = [];
  return {
    name: "DAILY",
    async createRoom() {
      if (opts.onCreateRoom) return opts.onCreateRoom();
      return { providerRoomId: `ft-fake-room-${nextId++}` };
    },
    async roomExists() {
      return true;
    },
    async createParticipantToken() {
      return { token: "fake-token", expiresAt: new Date() };
    },
    async revokeRoomAccess(input) {
      revokeCalls.push(input);
      const result = opts.onRevoke?.();
      if (result === "throw") throw new Error("simulated Daily revocation failure");
    },
    get __revokeCalls() {
      return revokeCalls;
    },
  };
}

describe("revokeVideoAccessForCancelledBooking", () => {
  it("no-ops when the booking has no Session_ row", async () => {
    const provider = makeFakeProvider();
    await revokeVideoAccessForCancelledBooking("nonexistent-booking-id", provider);
    expect(provider.__revokeCalls).toHaveLength(0);
  });

  it("no-ops when no room was ever provisioned (providerRoomId still null)", async () => {
    const { booking } = await setupConfirmedBooking();
    const provider = makeFakeProvider();
    await revokeVideoAccessForCancelledBooking(booking.id, provider);
    expect(provider.__revokeCalls).toHaveLength(0);
  });

  it("no-ops when the room is still a pending placeholder (never actually created on Daily's side)", async () => {
    const { booking, session } = await setupConfirmedBooking();
    await db.session_.update({ where: { id: session.id }, data: { providerRoomId: `pending:${Date.now()}:${randomUUID()}` } });
    const provider = makeFakeProvider();
    await revokeVideoAccessForCancelledBooking(booking.id, provider);
    expect(provider.__revokeCalls).toHaveLength(0);
  });

  it("calls revokeRoomAccess with the real providerRoomId and the tutor + student user ids when a room exists", async () => {
    const { booking, session, tutor, student } = await setupConfirmedBooking();
    const provider = makeFakeProvider();
    await ensureVideoRoomForSession(session.id, provider);

    await revokeVideoAccessForCancelledBooking(booking.id, provider);

    expect(provider.__revokeCalls).toHaveLength(1);
    expect(provider.__revokeCalls[0].providerRoomId).toBe("ft-fake-room-1");
    expect(provider.__revokeCalls[0].knownParticipantUserIds).toEqual(
      expect.arrayContaining([tutor.user.id, student.user.id])
    );
  });

  it("includes an ACTIVE guardian's user id in the known-participant list", async () => {
    const { booking, session, tutor, student } = await setupConfirmedBooking();
    const { parentUser } = await attachGuardian(student.studentProfile.id, "ACTIVE");
    const provider = makeFakeProvider();
    await ensureVideoRoomForSession(session.id, provider);

    await revokeVideoAccessForCancelledBooking(booking.id, provider);

    expect(provider.__revokeCalls[0].knownParticipantUserIds).toEqual(
      expect.arrayContaining([tutor.user.id, student.user.id, parentUser.id])
    );
  });

  it("excludes a REVOKED guardian's user id from the known-participant list", async () => {
    const { booking, session, student } = await setupConfirmedBooking();
    const { parentUser } = await attachGuardian(student.studentProfile.id, "REVOKED");
    const provider = makeFakeProvider();
    await ensureVideoRoomForSession(session.id, provider);

    await revokeVideoAccessForCancelledBooking(booking.id, provider);

    expect(provider.__revokeCalls[0].knownParticipantUserIds).not.toContain(parentUser.id);
  });

  it("writes an AuditLog row on successful revocation", async () => {
    const { booking, session } = await setupConfirmedBooking();
    const provider = makeFakeProvider();
    await ensureVideoRoomForSession(session.id, provider);

    await revokeVideoAccessForCancelledBooking(booking.id, provider);

    const audit = await db.auditLog.findFirst({
      where: { entityId: session.id, action: "video_session.access_revoked_on_cancellation" },
    });
    expect(audit).not.toBeNull();
  });

  it("propagates a provider failure to ITS OWN caller (non-swallowing) — the caller in cancellationPolicy.ts is what makes this non-fatal", async () => {
    const { booking, session } = await setupConfirmedBooking();
    const provider = makeFakeProvider({ onRevoke: () => "throw" });
    await ensureVideoRoomForSession(session.id, provider);

    await expect(revokeVideoAccessForCancelledBooking(booking.id, provider)).rejects.toThrow();
  });

  it("does not mutate Booking, Payment, or TutorEarning state", async () => {
    const { booking, session } = await setupConfirmedBooking();
    const provider = makeFakeProvider();
    await ensureVideoRoomForSession(session.id, provider);

    await revokeVideoAccessForCancelledBooking(booking.id, provider);

    const bookingAfter = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(bookingAfter.status).toBe("CONFIRMED");
    const earning = await db.tutorEarning.findUnique({ where: { bookingId: booking.id } });
    expect(earning?.status).toBe("PENDING_ELIGIBLE");
  });
});

describe("cancelBookingWithRefund — video revocation is best-effort and never blocks cancellation", () => {
  it("calls the video provider's revokeRoomAccess when DAILY_API_KEY is configured and a room exists", async () => {
    process.env.DAILY_API_KEY = "test-key-not-real";
    const { booking, session, student } = await setupConfirmedBooking();
    const provider = makeFakeProvider();
    await ensureVideoRoomForSession(session.id, provider);
    mockCreateDailyVideoProvider.mockReturnValue(provider);

    await cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" });

    const bookingAfter = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(bookingAfter.status).toBe("CANCELLED");
    expect(provider.__revokeCalls).toHaveLength(1);
    expect(provider.__revokeCalls[0].providerRoomId).toBe("ft-fake-room-1");
  });

  it("cancellation still succeeds even when the video provider's revocation throws", async () => {
    process.env.DAILY_API_KEY = "test-key-not-real";
    const { booking, session, student } = await setupConfirmedBooking();
    const provider = makeFakeProvider({ onRevoke: () => "throw" });
    await ensureVideoRoomForSession(session.id, provider);
    mockCreateDailyVideoProvider.mockReturnValue(provider);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" })).resolves.toBeUndefined();

    const bookingAfter = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(bookingAfter.status).toBe("CANCELLED");
    expect(provider.__revokeCalls).toHaveLength(1); // it WAS attempted
    consoleErrorSpy.mockRestore();
  });

  it("never even attempts video revocation when DAILY_API_KEY is unset — cancellation still succeeds", async () => {
    delete process.env.DAILY_API_KEY;
    const { booking, session, student } = await setupConfirmedBooking();
    const provider = makeFakeProvider();
    await ensureVideoRoomForSession(session.id, provider);
    mockCreateDailyVideoProvider.mockReturnValue(provider);

    await cancelBookingWithRefund(booking.id, student.user.id, { actorRole: "STUDENT" });

    const bookingAfter = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(bookingAfter.status).toBe("CANCELLED");
    expect(mockCreateDailyVideoProvider).not.toHaveBeenCalled();
    expect(provider.__revokeCalls).toHaveLength(0);
  });
});
