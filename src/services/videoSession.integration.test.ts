import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";
import { withSerializableRetry } from "@/lib/serializableRetry";
import type { VideoProviderAdapter } from "./videoProvider";

// VIDEO-1A — room provisioning integration coverage. Mirrors
// sessionNoShowConvergence.integration.test.ts's exact DB-target-redirection
// technique (resolveVerifiedTestDatabase, tracked-id cleanup, ambient
// @/lib/db singleton redirected to futuretutor_test BEFORE any transitively-
// DB-touching module is imported). Never calls a real Daily API — a small
// hand-built fake VideoProviderAdapter is used throughout, mirroring
// stripeConnect.integration.test.ts's own makeFakeStripeClient style.

vi.mock("@/lib/stripe", () => ({ getStripeClient: vi.fn() }));

let createCustomerPriceQuote: typeof import("./customerPricing").createCustomerPriceQuote;
let createTutorPayoutQuote: typeof import("./tutorPayout").createTutorPayoutQuote;
let reserveBookingPendingPayment: typeof import("./bookingCreation").reserveBookingPendingPayment;
let convergeToCaptured: typeof import("./payments").convergeToCaptured;
let ensureVideoRoomForSession: typeof import("./videoSession").ensureVideoRoomForSession;
let sweepDueVideoRoomProvisioning: typeof import("./videoSession").sweepDueVideoRoomProvisioning;
let SessionNotFoundForVideoError: typeof import("./videoSession").SessionNotFoundForVideoError;
let VideoProviderUnavailableError: typeof import("./videoProvider").VideoProviderUnavailableError;

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

// Inside the join/provisioning window (< 15 minutes out) so provisioning
// tests don't need to inject a clock for the sweep's own window query.
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
  ({ ensureVideoRoomForSession, sweepDueVideoRoomProvisioning, SessionNotFoundForVideoError } = await import("./videoSession"));
  ({ VideoProviderUnavailableError } = await import("./videoProvider"));

  const { db: ambientDb } = await import("@/lib/db");
  const [{ current_database: ambientDatabaseName }] = await ambientDb.$queryRaw<
    Array<{ current_database: string }>
  >`SELECT current_database()`;
  if (ambientDatabaseName !== target.databaseName) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton reports current_database() = "${ambientDatabaseName}", but the verified test database is "${target.databaseName}". Refusing to run any video session integration test.`
    );
  }
  const devDatabaseNameForSafetyCheckOnly = devDatabaseUrlForSafetyCheckOnly
    ? new URL(devDatabaseUrlForSafetyCheckOnly).pathname.replace(/^\//, "")
    : null;
  if (devDatabaseNameForSafetyCheckOnly && ambientDatabaseName === devDatabaseNameForSafetyCheckOnly) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton's current_database() ("${ambientDatabaseName}") equals the real development database name. Refusing to run any video session integration test.`
    );
  }

  const subject = await db.subject.create({ data: { slug: `vid-it-subject-${randomUUID()}`, sortOrder: 999 } });
  subjectId = subject.id;
  const level = await db.academicLevel.create({ data: { slug: `vid-it-level-${randomUUID()}`, sortOrder: 999 } });
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
  if (createdBookingIds.length > 0) {
    await db.auditLog.deleteMany({ where: { entityId: { in: createdBookingIds } } });
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
  return `vid-it-${prefix}-${randomUUID()}@futuretutor.test`;
}

async function createTutorUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("tutor"), role: "TUTOR" } });
  createdUserIds.push(user.id);
  const tutorProfile = await db.tutorProfile.create({
    data: { userId: user.id, slug: `vid-it-tutor-${randomUUID()}`, applicationStatus: "APPROVED", payoutTier: "NEW", learningMode: "BOTH" },
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

function makeFakeProvider(
  opts: {
    onCreateRoom?: () => { providerRoomId: string } | "throw";
    onRoomExists?: (providerRoomId: string) => boolean | "throw";
  } = {}
): VideoProviderAdapter & { __createRoomCalls: number; __roomExistsCalls: number } {
  let calls = 0;
  let existsCalls = 0;
  let nextId = 1;
  return {
    name: "DAILY",
    async createRoom() {
      calls++;
      if (opts.onCreateRoom) {
        const result = opts.onCreateRoom();
        if (result === "throw") throw new Error("simulated Daily room creation failure");
        return result;
      }
      return { providerRoomId: `ft-fake-room-${nextId++}` };
    },
    async roomExists(providerRoomId: string) {
      existsCalls++;
      if (opts.onRoomExists) {
        const result = opts.onRoomExists(providerRoomId);
        if (result === "throw") {
          throw new VideoProviderUnavailableError("simulated Daily room existence check failure");
        }
        return result;
      }
      return true; // default: any previously-recorded room is still valid
    },
    async createParticipantToken() {
      return { token: "fake-token", expiresAt: new Date() };
    },
    async revokeRoomAccess() {},
    get __createRoomCalls() {
      return calls;
    },
    get __roomExistsCalls() {
      return existsCalls;
    },
  };
}

describe("ensureVideoRoomForSession", () => {
  it("provisions a room and persists provider/providerRoomId/roomCreatedAt", async () => {
    const { session } = await setupConfirmedBooking();
    const provider = makeFakeProvider();

    const roomId = await ensureVideoRoomForSession(session.id, provider);

    expect(roomId).toBe("ft-fake-room-1");
    expect(provider.__createRoomCalls).toBe(1);
    const updated = await db.session_.findUniqueOrThrow({ where: { id: session.id } });
    expect(updated.providerRoomId).toBe("ft-fake-room-1");
    expect(updated.videoProvider).toBe("DAILY");
    expect(updated.roomCreatedAt).not.toBeNull();
  });

  it("is idempotent: a second call reuses the existing room, never calling the provider again", async () => {
    const { session } = await setupConfirmedBooking();
    const provider = makeFakeProvider();

    const first = await ensureVideoRoomForSession(session.id, provider);
    const second = await ensureVideoRoomForSession(session.id, provider);

    expect(first).toBe(second);
    expect(provider.__createRoomCalls).toBe(1);
  });

  it("never creates a duplicate provider room under real concurrent provisioning attempts", async () => {
    const { session } = await setupConfirmedBooking();
    const provider = makeFakeProvider();

    const results = await Promise.all(
      Array.from({ length: 5 }, () => ensureVideoRoomForSession(session.id, provider))
    );

    // At most one call actually reached the provider; every non-null result
    // (winners + anyone who re-read after the winner converged) agrees on
    // the same single room id.
    expect(provider.__createRoomCalls).toBe(1);
    const nonNullResults = results.filter((r): r is string => r !== null);
    expect(nonNullResults.length).toBeGreaterThan(0);
    for (const roomId of nonNullResults) expect(roomId).toBe("ft-fake-room-1");

    const updated = await db.session_.findUniqueOrThrow({ where: { id: session.id } });
    expect(updated.providerRoomId).toBe("ft-fake-room-1");
  });

  it("safe failure: if the provider call fails, nothing is persisted and a retry can succeed", async () => {
    const { session } = await setupConfirmedBooking();
    const failingProvider = makeFakeProvider({ onCreateRoom: () => "throw" });

    await expect(ensureVideoRoomForSession(session.id, failingProvider)).rejects.toThrow(VideoProviderUnavailableError);

    const afterFailure = await db.session_.findUniqueOrThrow({ where: { id: session.id } });
    expect(afterFailure.providerRoomId).toBeNull();
    expect(afterFailure.videoProvider).toBeNull();

    // Retry with a healthy provider succeeds — the claim was correctly
    // released on failure, not left stuck on a placeholder.
    const workingProvider = makeFakeProvider();
    const roomId = await ensureVideoRoomForSession(session.id, workingProvider);
    expect(roomId).toBe("ft-fake-room-1");
  });

  it("throws SessionNotFoundForVideoError for an unknown session id", async () => {
    const provider = makeFakeProvider();
    await expect(ensureVideoRoomForSession("nonexistent-session-id", provider)).rejects.toThrow(
      SessionNotFoundForVideoError
    );
  });

  it("does not mutate Booking.status, Payment.status, or TutorEarning as a side effect of provisioning", async () => {
    const { session, booking } = await setupConfirmedBooking();
    const provider = makeFakeProvider();

    await ensureVideoRoomForSession(session.id, provider);

    const bookingAfter = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(bookingAfter.status).toBe("CONFIRMED");
    const sessionAfter = await db.session_.findUniqueOrThrow({ where: { id: session.id } });
    expect(sessionAfter.status).toBe("SCHEDULED"); // provisioning a room is not attendance/completion
    const earning = await db.tutorEarning.findUnique({ where: { bookingId: booking.id } });
    expect(earning?.status).toBe("PENDING_ELIGIBLE"); // unchanged by video provisioning
  });

  describe("stale provider room detection", () => {
    it("existing room still exists at the provider — reused, no re-provisioning", async () => {
      const { session } = await setupConfirmedBooking();
      const provider = makeFakeProvider();
      await ensureVideoRoomForSession(session.id, provider); // first-time provisioning
      expect(provider.__createRoomCalls).toBe(1);

      const roomId = await ensureVideoRoomForSession(session.id, provider);

      expect(roomId).toBe("ft-fake-room-1");
      expect(provider.__roomExistsCalls).toBe(1);
      expect(provider.__createRoomCalls).toBe(1); // still just the one, original create
    });

    it("existing room is authoritatively gone at the provider — reclaimed and re-provisioned", async () => {
      const { session } = await setupConfirmedBooking();
      await db.session_.update({ where: { id: session.id }, data: { videoProvider: "DAILY", providerRoomId: "ft-stale-dead-room", roomCreatedAt: new Date(0) } });
      const provider = makeFakeProvider({ onRoomExists: () => false });

      const roomId = await ensureVideoRoomForSession(session.id, provider);

      expect(roomId).toBe("ft-fake-room-1");
      expect(provider.__createRoomCalls).toBe(1);
      const updated = await db.session_.findUniqueOrThrow({ where: { id: session.id } });
      expect(updated.providerRoomId).toBe("ft-fake-room-1");
      expect(updated.providerRoomId).not.toBe("ft-stale-dead-room");
      const audit = await db.auditLog.findFirst({
        where: { entityId: session.id, action: "video_session.stale_provider_room_reclaimed" },
      });
      expect(audit).not.toBeNull();
      expect((audit?.metadata as { staleProviderRoomId?: string } | null)?.staleProviderRoomId).toBe("ft-stale-dead-room");
    });

    it("stale reference re-provisioning converges providerRoomId/roomCreatedAt and leaves everything else untouched (no attendance, Session_/Booking status, financial rows)", async () => {
      const { session, booking } = await setupConfirmedBooking();
      const originalRoomCreatedAt = new Date(0);
      await db.session_.update({ where: { id: session.id }, data: { videoProvider: "DAILY", providerRoomId: "ft-stale-dead-room", roomCreatedAt: originalRoomCreatedAt } });
      const provider = makeFakeProvider({ onRoomExists: () => false });

      await ensureVideoRoomForSession(session.id, provider);

      const sessionAfter = await db.session_.findUniqueOrThrow({ where: { id: session.id } });
      expect(sessionAfter.providerRoomId).toBe("ft-fake-room-1");
      expect(sessionAfter.roomCreatedAt?.getTime()).toBeGreaterThan(originalRoomCreatedAt.getTime());
      expect(sessionAfter.status).toBe("SCHEDULED");

      const bookingAfter = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(bookingAfter.status).toBe("CONFIRMED");

      const attendanceCount = await db.sessionAttendanceEvent.count({ where: { sessionId: session.id } });
      expect(attendanceCount).toBe(0);

      const earning = await db.tutorEarning.findUnique({ where: { bookingId: booking.id } });
      expect(earning?.status).toBe("PENDING_ELIGIBLE");
    });

    it("re-provisioning reuses whatever the provider's own createRoom returns, even if it's the same deterministic name recreated concurrently", async () => {
      const { session } = await setupConfirmedBooking();
      await db.session_.update({ where: { id: session.id }, data: { videoProvider: "DAILY", providerRoomId: "ft-stale-dead-room" } });
      // Simulates dailyVideoProvider.ts's own check-then-create discovering
      // that a concurrent process already recreated the SAME deterministic
      // room name — createRoom legitimately returns it without minting a
      // new one.
      const provider = makeFakeProvider({ onRoomExists: () => false, onCreateRoom: () => ({ providerRoomId: "ft-deterministic-recreated" }) });

      const roomId = await ensureVideoRoomForSession(session.id, provider);

      expect(roomId).toBe("ft-deterministic-recreated");
      const updated = await db.session_.findUniqueOrThrow({ where: { id: session.id } });
      expect(updated.providerRoomId).toBe("ft-deterministic-recreated");
    });

    it("provider existence-check failure (transient/unavailable) does NOT clear or re-provision — preserves the existing reference", async () => {
      const { session } = await setupConfirmedBooking();
      await db.session_.update({ where: { id: session.id }, data: { videoProvider: "DAILY", providerRoomId: "ft-maybe-still-there" } });
      const provider = makeFakeProvider({ onRoomExists: () => "throw" });

      await expect(ensureVideoRoomForSession(session.id, provider)).rejects.toThrow(VideoProviderUnavailableError);

      expect(provider.__createRoomCalls).toBe(0);
      const unchanged = await db.session_.findUniqueOrThrow({ where: { id: session.id } });
      expect(unchanged.providerRoomId).toBe("ft-maybe-still-there"); // untouched — never cleared on an ambiguous failure
    });

    it("concurrent stale-reference recovery: only one worker re-provisions, producing exactly one logical room", async () => {
      const { session } = await setupConfirmedBooking();
      await db.session_.update({ where: { id: session.id }, data: { videoProvider: "DAILY", providerRoomId: "ft-stale-dead-room" } });
      const provider = makeFakeProvider({ onRoomExists: () => false });

      const results = await Promise.all(Array.from({ length: 5 }, () => ensureVideoRoomForSession(session.id, provider)));

      expect(provider.__createRoomCalls).toBe(1); // exactly one real re-provision, never a duplicate
      const nonNullResults = results.filter((r): r is string => r !== null);
      expect(nonNullResults.length).toBeGreaterThan(0);
      for (const roomId of nonNullResults) expect(roomId).toBe("ft-fake-room-1");
      const updated = await db.session_.findUniqueOrThrow({ where: { id: session.id } });
      expect(updated.providerRoomId).toBe("ft-fake-room-1");
    });
  });

  describe("stale claim recovery", () => {
    it("does NOT reclaim a fresh (non-stale) placeholder claim — a genuinely concurrent attempt is left alone", async () => {
      const { session } = await setupConfirmedBooking();
      const freshClaim = `pending:${Date.now()}:${randomUUID()}`;
      await db.session_.update({ where: { id: session.id }, data: { providerRoomId: freshClaim } });
      const provider = makeFakeProvider();

      const result = await ensureVideoRoomForSession(session.id, provider);

      expect(result).toBeNull();
      expect(provider.__createRoomCalls).toBe(0);
      const unchanged = await db.session_.findUniqueOrThrow({ where: { id: session.id } });
      expect(unchanged.providerRoomId).toBe(freshClaim);
    });

    it("reclaims a stale placeholder claim (simulating a process crash between claim and converge) and successfully provisions", async () => {
      const { session } = await setupConfirmedBooking();
      const staleClaim = `pending:${Date.now() - 10 * 60 * 1000}:${randomUUID()}`; // 10 min old, > CLAIM_STALE_MS
      await db.session_.update({ where: { id: session.id }, data: { providerRoomId: staleClaim } });
      const provider = makeFakeProvider();

      const roomId = await ensureVideoRoomForSession(session.id, provider);

      expect(roomId).toBe("ft-fake-room-1");
      expect(provider.__createRoomCalls).toBe(1);
      const updated = await db.session_.findUniqueOrThrow({ where: { id: session.id } });
      expect(updated.providerRoomId).toBe("ft-fake-room-1");
      const audit = await db.auditLog.findFirst({ where: { entityId: session.id, action: "video_session.stale_claim_reclaimed" } });
      expect(audit).not.toBeNull();
    });

    it("reclaims a malformed/legacy placeholder (no parseable timestamp) as stale", async () => {
      const { session } = await setupConfirmedBooking();
      await db.session_.update({ where: { id: session.id }, data: { providerRoomId: "pending:not-a-number" } });
      const provider = makeFakeProvider();

      const roomId = await ensureVideoRoomForSession(session.id, provider);

      expect(roomId).toBe("ft-fake-room-1");
    });

    it("sweepDueVideoRoomProvisioning discovers and recovers a stale claim on its own, without direct ensureVideoRoomForSession invocation", async () => {
      const { session } = await setupConfirmedBooking();
      const staleClaim = `pending:${Date.now() - 10 * 60 * 1000}:${randomUUID()}`;
      await db.session_.update({ where: { id: session.id }, data: { providerRoomId: staleClaim } });
      const provider = makeFakeProvider();

      const result = await sweepDueVideoRoomProvisioning(provider);

      expect(result.provisioned).toBeGreaterThanOrEqual(1);
      const updated = await db.session_.findUniqueOrThrow({ where: { id: session.id } });
      expect(updated.providerRoomId).not.toBeNull();
      expect(updated.providerRoomId?.startsWith("pending:")).toBe(false);
    });

    it("sweepDueVideoRoomProvisioning does not disturb a fresh in-flight claim from a concurrent worker", async () => {
      const { session } = await setupConfirmedBooking();
      const freshClaim = `pending:${Date.now()}:${randomUUID()}`;
      await db.session_.update({ where: { id: session.id }, data: { providerRoomId: freshClaim } });
      const provider = makeFakeProvider();

      const result = await sweepDueVideoRoomProvisioning(provider);

      expect(result.provisioned).toBe(0);
      expect(provider.__createRoomCalls).toBe(0);
      const unchanged = await db.session_.findUniqueOrThrow({ where: { id: session.id } });
      expect(unchanged.providerRoomId).toBe(freshClaim);
    });
  });
});

describe("sweepDueVideoRoomProvisioning", () => {
  it("provisions rooms for CONFIRMED ONLINE bookings whose join window has opened", async () => {
    const { session } = await setupConfirmedBooking();
    const provider = makeFakeProvider();

    const result = await sweepDueVideoRoomProvisioning(provider);

    expect(result.provisioned).toBeGreaterThanOrEqual(1);
    const updated = await db.session_.findUniqueOrThrow({ where: { id: session.id } });
    expect(updated.providerRoomId).not.toBeNull();
  });

  it("skips a booking whose join window has not opened yet", async () => {
    const farFuture = new Date(Date.now() + 3 * 60 * 60 * 1000); // 3 hours out — outside the 15-minute window
    const { session } = await setupConfirmedBooking({ startAt: farFuture });
    const provider = makeFakeProvider();

    await sweepDueVideoRoomProvisioning(provider);

    const unchanged = await db.session_.findUniqueOrThrow({ where: { id: session.id } });
    expect(unchanged.providerRoomId).toBeNull();
  });

  it("isolates a per-candidate provider failure — one failure does not abort the rest of the batch", async () => {
    const { session: sessionA } = await setupConfirmedBooking();
    const { session: sessionB } = await setupConfirmedBooking();
    let calls = 0;
    const flaky = makeFakeProvider({
      onCreateRoom: () => {
        calls++;
        return calls === 1 ? "throw" : { providerRoomId: `ft-flaky-room-${calls}` };
      },
    });

    const result = await sweepDueVideoRoomProvisioning(flaky);

    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(result.provisioned).toBeGreaterThanOrEqual(1);
    const rooms = await db.session_.findMany({ where: { id: { in: [sessionA.id, sessionB.id] } }, select: { providerRoomId: true } });
    const provisionedCount = rooms.filter((r) => r.providerRoomId !== null).length;
    expect(provisionedCount).toBe(1);
  });
});
