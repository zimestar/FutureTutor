import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { createHmac } from "crypto";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";
import { withSerializableRetry } from "@/lib/serializableRetry";

// VIDEO-1B — route-level integration coverage for the Daily probe-
// compatibility fix (Section 1 of the mission). Mirrors the exact DB-
// target-redirection technique used throughout this codebase's other
// integration tests. Calls the route's own exported POST handler directly
// with a constructed Web-standard Request — Next.js App Router route
// handlers are plain functions over Request/Response, so no Next dev
// server is needed. Never calls a real Daily API.

vi.mock("@/lib/stripe", () => ({ getStripeClient: vi.fn() }));

const TEST_SECRET_BASE64 = Buffer.from("route-test-daily-webhook-secret-32b").toString("base64");
const originalSecret = process.env.DAILY_WEBHOOK_SECRET;

let createCustomerPriceQuote: typeof import("@/services/customerPricing").createCustomerPriceQuote;
let createTutorPayoutQuote: typeof import("@/services/tutorPayout").createTutorPayoutQuote;
let reserveBookingPendingPayment: typeof import("@/services/bookingCreation").reserveBookingPendingPayment;
let convergeToCaptured: typeof import("@/services/payments").convergeToCaptured;
let POST: typeof import("./route").POST;

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
const REAL_ROOM_NAME = `ft-routetest-${randomUUID().slice(0, 8)}`;

beforeAll(async () => {
  process.env.DAILY_WEBHOOK_SECRET = TEST_SECRET_BASE64;

  const target = resolveVerifiedTestDatabase();
  const devDatabaseUrlForSafetyCheckOnly = process.env.DATABASE_URL;
  const adapter = new PrismaPg({ connectionString: target.connectionString });
  db = new PrismaClient({ adapter });

  process.env.DATABASE_URL = target.connectionString;

  ({ createCustomerPriceQuote } = await import("@/services/customerPricing"));
  ({ createTutorPayoutQuote } = await import("@/services/tutorPayout"));
  ({ reserveBookingPendingPayment } = await import("@/services/bookingCreation"));
  ({ convergeToCaptured } = await import("@/services/payments"));
  ({ POST } = await import("./route"));

  const { db: ambientDb } = await import("@/lib/db");
  const [{ current_database: ambientDatabaseName }] = await ambientDb.$queryRaw<
    Array<{ current_database: string }>
  >`SELECT current_database()`;
  if (ambientDatabaseName !== target.databaseName) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton reports current_database() = "${ambientDatabaseName}", but the verified test database is "${target.databaseName}". Refusing to run any Daily webhook route integration test.`
    );
  }
  const devDatabaseNameForSafetyCheckOnly = devDatabaseUrlForSafetyCheckOnly
    ? new URL(devDatabaseUrlForSafetyCheckOnly).pathname.replace(/^\//, "")
    : null;
  if (devDatabaseNameForSafetyCheckOnly && ambientDatabaseName === devDatabaseNameForSafetyCheckOnly) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton's current_database() ("${ambientDatabaseName}") equals the real development database name. Refusing to run any Daily webhook route integration test.`
    );
  }

  const subject = await db.subject.create({ data: { slug: `dailywh-route-it-subject-${randomUUID()}`, sortOrder: 999 } });
  subjectId = subject.id;
  const level = await db.academicLevel.create({ data: { slug: `dailywh-route-it-level-${randomUUID()}`, sortOrder: 999 } });
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
  if (originalSecret === undefined) delete process.env.DAILY_WEBHOOK_SECRET;
  else process.env.DAILY_WEBHOOK_SECRET = originalSecret;

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
  return `dailywh-route-it-${prefix}-${randomUUID()}@futuretutor.test`;
}

async function setupConfirmedBookingWithRoom() {
  const startAt = DEFAULT_TEST_START_AT;
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

  const tutorUser = await db.user.create({ data: { email: uniqueEmail("tutor"), role: "TUTOR" } });
  createdUserIds.push(tutorUser.id);
  const tutorProfile = await db.tutorProfile.create({
    data: { userId: tutorUser.id, slug: `dailywh-route-it-tutor-${randomUUID()}`, applicationStatus: "APPROVED", payoutTier: "NEW", learningMode: "BOTH" },
  });
  createdTutorProfileIds.push(tutorProfile.id);

  const studentUser = await db.user.create({ data: { email: uniqueEmail("self"), role: "STUDENT" } });
  createdUserIds.push(studentUser.id);
  const studentProfile = await db.studentProfile.create({
    data: { userId: studentUser.id, firstName: "Adult", lastName: "Student", managementMode: "SELF_MANAGED" },
  });
  createdStudentProfileIds.push(studentProfile.id);

  const quote = await createCustomerPriceQuote(
    { createdByUserId: studentUser.id, studentProfileId: studentProfile.id, subjectId, academicLevelId, tutoringMode: "ONLINE", durationMinutes: 60, requestedStartAt: startAt },
    db
  );
  createdCustomerQuoteIds.push(quote.id);
  const payoutQuote = await createTutorPayoutQuote(
    { tutorProfileId: tutorProfile.id, subjectId, academicLevelId, tutoringMode: "ONLINE", durationMinutes: 60, requestedStartAt: startAt },
    quote.id,
    db
  );
  createdTutorPayoutQuoteIds.push(payoutQuote.id);
  const payment = await db.payment.create({
    data: { id: randomUUID(), customerPriceQuoteId: quote.id, payerUserId: studentUser.id, amountCents: quote.totalCents, currency: quote.currency, status: "PENDING" },
  });
  createdPaymentIds.push(payment.id);

  const booking = await withSerializableRetry(() =>
    db.$transaction(
      (tx) =>
        reserveBookingPendingPayment(tx, {
          actorUserId: studentUser.id,
          studentProfileId: studentProfile.id,
          tutorProfileId: tutorProfile.id,
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
  // Directly persist a real (non-pending) providerRoomId — this file tests
  // the route's classification/correlation behavior, not room provisioning
  // (already covered elsewhere), so no real Daily call is made here.
  await db.session_.update({ where: { id: session.id }, data: { providerRoomId: REAL_ROOM_NAME, videoProvider: "DAILY", roomCreatedAt: new Date() } });

  return { tutorUser, studentUser, booking, session };
}

function sign(timestampHeader: string, rawBody: string): string {
  return createHmac("sha256", Buffer.from(TEST_SECRET_BASE64, "base64")).update(`${timestampHeader}.${rawBody}`).digest("base64");
}

function buildRequest(opts: { body: string; signatureHeader?: string | null; timestampHeader?: string | null }): Request {
  const headers = new Headers();
  if (opts.signatureHeader !== null && opts.signatureHeader !== undefined) headers.set("x-webhook-signature", opts.signatureHeader);
  if (opts.timestampHeader !== null && opts.timestampHeader !== undefined) headers.set("x-webhook-timestamp", opts.timestampHeader);
  return new Request("https://staging.futuretutor.ca/api/webhooks/daily", { method: "POST", headers, body: opts.body });
}

describe("POST /api/webhooks/daily — final liveness-probe compatibility classification", () => {
  // 1. no signature + no timestamp -> 200 no-op
  it("1. no signature + no timestamp: 200, zero DB mutation, even with a participant.joined-shaped body targeting a real room", async () => {
    const { session, studentUser } = await setupConfirmedBookingWithRoom();
    const attackerBody = JSON.stringify({
      type: "participant.joined",
      payload: { room: REAL_ROOM_NAME, user_id: studentUser.id, session_id: randomUUID() },
    });

    const response = await POST(buildRequest({ body: attackerBody, signatureHeader: null, timestampHeader: null }));

    expect(response.status).toBe(200);
    const responseBody = await response.json();
    expect(responseBody).toEqual({ received: true });
    const events = await db.sessionAttendanceEvent.findMany({ where: { sessionId: session.id } });
    expect(events).toHaveLength(0);
    const sessionAfter = await db.session_.findUniqueOrThrow({ where: { id: session.id } });
    expect(sessionAfter.status).toBe("SCHEDULED");
  });

  // 2. both headers + plausible current Unix milliseconds -> 200 no-op
  it("2. both headers present, plausible current Unix milliseconds: 200 no-op", async () => {
    const response = await POST(
      buildRequest({ body: "{}", signatureHeader: "some-signature-value", timestampHeader: String(Date.now()) })
    );
    expect(response.status).toBe(200);
    const responseBody = await response.json();
    expect(responseBody).toEqual({ received: true });
  });

  // 3. both headers + plausible millisecond timestamp + participant.joined-shaped
  //    malicious body targeting a REAL fixture -> 200, zero attendance/session/financial mutation
  it("3. milliseconds probe with an attacker-shaped body targeting a REAL fixture: 200, zero attendance, zero Session_ mutation, zero financial mutation", async () => {
    const { session, booking, tutorUser } = await setupConfirmedBookingWithRoom();
    const maliciousBody = JSON.stringify({
      type: "participant.joined",
      payload: { room: REAL_ROOM_NAME, user_id: tutorUser.id, session_id: randomUUID() },
    });

    const response = await POST(
      buildRequest({ body: maliciousBody, signatureHeader: "attacker-controlled-signature", timestampHeader: String(Date.now()) })
    );

    expect(response.status).toBe(200);
    const events = await db.sessionAttendanceEvent.findMany({ where: { sessionId: session.id } });
    expect(events).toHaveLength(0);
    const sessionAfter = await db.session_.findUniqueOrThrow({ where: { id: session.id } });
    expect(sessionAfter.status).toBe("SCHEDULED");
    const bookingAfter = await db.booking.findUniqueOrThrow({ where: { id: booking.id }, include: { payment: true } });
    expect(bookingAfter.status).toBe("CONFIRMED");
    expect(bookingAfter.payment?.status).toBe("CAPTURED"); // unchanged
    const earning = await db.tutorEarning.findUnique({ where: { bookingId: booking.id } });
    expect(earning?.status).toBe("PENDING_ELIGIBLE"); // unchanged
  });

  // 4. signature only -> 400
  it("4. signature header only (timestamp absent): 400, no processing", async () => {
    const response = await POST(buildRequest({ body: "{}", signatureHeader: "some-signature", timestampHeader: null }));
    expect(response.status).toBe(400);
  });

  // 5. timestamp only -> 400
  it("5. timestamp header only (signature absent): 400, no processing", async () => {
    const response = await POST(buildRequest({ body: "{}", signatureHeader: null, timestampHeader: String(Math.floor(Date.now() / 1000)) }));
    expect(response.status).toBe(400);
  });

  // 6. empty timestamp -> 400
  it("6. both headers present, empty-string timestamp: 400, no processing", async () => {
    const response = await POST(buildRequest({ body: "{}", signatureHeader: "some-signature", timestampHeader: "" }));
    expect(response.status).toBe(400);
  });

  // 7. non-numeric timestamp -> 400
  it("7. both headers present, non-numeric timestamp: 400, no processing", async () => {
    const response = await POST(buildRequest({ body: "{}", signatureHeader: "some-signature", timestampHeader: "not-a-real-timestamp" }));
    expect(response.status).toBe(400);
  });

  // 8. fractional numeric timestamp -> 400
  it("8. both headers present, fractional numeric timestamp (even at millisecond magnitude): 400, no processing", async () => {
    const response = await POST(
      buildRequest({ body: "{}", signatureHeader: "some-signature", timestampHeader: String(Date.now() + 0.5) })
    );
    expect(response.status).toBe(400);
  });

  // 9. numeric garbage that is neither plausible seconds nor milliseconds -> 400
  it("9. both headers present, numeric garbage matching neither plausible range: 400, no processing", async () => {
    const response = await POST(buildRequest({ body: "{}", signatureHeader: "some-signature", timestampHeader: "42" }));
    expect(response.status).toBe(400);
  });

  // 10. current seconds timestamp + invalid signature -> 400
  it("10. current plausible Unix SECONDS timestamp with an invalid signature: 400, never classified as liveness", async () => {
    const timestampHeader = String(Math.floor(Date.now() / 1000));
    const response = await POST(buildRequest({ body: "{}", signatureHeader: "not-a-valid-signature", timestampHeader }));
    expect(response.status).toBe(400);
  });

  // 11. stale seconds timestamp even with correctly-computed signature -> 400
  it("11. stale plausible Unix SECONDS timestamp, even with a correctly-computed signature for that timestamp: 400", async () => {
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 10 * 60); // 10 min old, beyond the 5-min tolerance
    const body = "{}";
    const signatureHeader = sign(staleTimestamp, body);
    const response = await POST(buildRequest({ body, signatureHeader, timestampHeader: staleTimestamp }));
    expect(response.status).toBe(400);
  });

  // 12. current seconds timestamp + valid signature -> normal signed-event processing
  // 13. valid signed participant.joined -> ONLINE_ACTIVITY still works
  it("12+13. current plausible Unix SECONDS timestamp with a VALID signature: normal signed-event processing, ONLINE_ACTIVITY recorded", async () => {
    const { session, tutorUser } = await setupConfirmedBookingWithRoom();
    const body = JSON.stringify({
      type: "participant.joined",
      payload: { room: REAL_ROOM_NAME, user_id: tutorUser.id, session_id: randomUUID() },
    });
    const timestampHeader = String(Math.floor(Date.now() / 1000));
    const signatureHeader = sign(timestampHeader, body);

    const response = await POST(buildRequest({ body, signatureHeader, timestampHeader }));

    expect(response.status).toBe(200);
    const responseBody = await response.json();
    expect(responseBody).toEqual({ received: true, handled: true });
    const events = await db.sessionAttendanceEvent.findMany({ where: { sessionId: session.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ participantRole: "TUTOR", source: "ONLINE_ACTIVITY" });
  });

  // 14. duplicate signed event -> existing idempotency unchanged
  it("14. a duplicate valid signed event does not create a second attendance row (existing idempotency unchanged)", async () => {
    const { session, tutorUser } = await setupConfirmedBookingWithRoom();
    const body = JSON.stringify({
      type: "participant.joined",
      payload: { room: REAL_ROOM_NAME, user_id: tutorUser.id, session_id: randomUUID() },
    });
    const timestampHeader = String(Math.floor(Date.now() / 1000));
    const signatureHeader = sign(timestampHeader, body);

    await POST(buildRequest({ body, signatureHeader, timestampHeader }));
    await POST(buildRequest({ body, signatureHeader, timestampHeader })); // exact redelivery

    const events = await db.sessionAttendanceEvent.findMany({ where: { sessionId: session.id, participantRole: "TUTOR" } });
    expect(events).toHaveLength(1);
  });

  // 15. financial firewall -> unchanged
  it("15. financial firewall: the real signed-processing path never mutates Booking/Payment/TutorEarning", async () => {
    const { session, booking, studentUser } = await setupConfirmedBookingWithRoom();
    const body = JSON.stringify({
      type: "participant.joined",
      payload: { room: REAL_ROOM_NAME, user_id: studentUser.id, session_id: randomUUID() },
    });
    const timestampHeader = String(Math.floor(Date.now() / 1000));
    const signatureHeader = sign(timestampHeader, body);

    await POST(buildRequest({ body, signatureHeader, timestampHeader }));

    const bookingAfter = await db.booking.findUniqueOrThrow({ where: { id: booking.id }, include: { payment: true } });
    expect(bookingAfter.status).toBe("CONFIRMED");
    expect(bookingAfter.payment?.status).toBe("CAPTURED");
    const earning = await db.tutorEarning.findUnique({ where: { bookingId: booking.id } });
    expect(earning?.status).toBe("PENDING_ELIGIBLE");
    const sessionAfter = await db.session_.findUniqueOrThrow({ where: { id: session.id } });
    expect(sessionAfter.status).toBe("SCHEDULED"); // one-sided join — not IN_PROGRESS yet
  });

  // 16. parent observer behavior -> unchanged (full guardian-authorization
  // matrix, including REVOKED/unrelated/ADMIN, is exhaustively covered at
  // the service layer by dailyWebhooks.integration.test.ts and
  // videoJoin.integration.test.ts — not duplicated here; this route-level
  // file's job is the classification behavior itself).
  it("16. a milliseconds-shaped liveness probe never reaches guardian/observer logic at all — 200 before any authorization resolution", async () => {
    const { session } = await setupConfirmedBookingWithRoom();
    const body = JSON.stringify({ type: "participant.joined", payload: { room: REAL_ROOM_NAME, user_id: "any-user-id" } });

    const response = await POST(buildRequest({ body, signatureHeader: "sig", timestampHeader: String(Date.now()) }));

    expect(response.status).toBe(200);
    const events = await db.sessionAttendanceEvent.findMany({ where: { sessionId: session.id } });
    expect(events).toHaveLength(0);
  });

  // 17. DAILY_WEBHOOK_SECRET unset vs. configured — the milliseconds
  // liveness path must behave identically either way (Section 6).
  it("17. the milliseconds liveness path behaves identically whether DAILY_WEBHOOK_SECRET is unset or configured", async () => {
    const savedSecret = process.env.DAILY_WEBHOOK_SECRET;
    delete process.env.DAILY_WEBHOOK_SECRET;
    try {
      const responseUnset = await POST(
        buildRequest({ body: "{}", signatureHeader: "some-signature", timestampHeader: String(Date.now()) })
      );
      expect(responseUnset.status).toBe(200);
      expect(await responseUnset.json()).toEqual({ received: true });
    } finally {
      process.env.DAILY_WEBHOOK_SECRET = savedSecret;
    }

    const responseConfigured = await POST(
      buildRequest({ body: "{}", signatureHeader: "some-signature", timestampHeader: String(Date.now()) })
    );
    expect(responseConfigured.status).toBe(200);
    expect(await responseConfigured.json()).toEqual({ received: true });
  });
});

// TEMPORARY — VIDEO-1B route-level diagnostic coverage. Proves exactly one
// atomic "VIDEO-1B ROUTE DIAGNOSTIC" line is emitted per request, its
// livenessProbe field matches the route's own classification decision (never
// a separate/divergent computation), no raw header value or body ever
// appears in the logged line, and existing route behavior (status codes,
// response bodies) is unchanged. Remove this block along with the diagnostic
// itself once root cause is confirmed.
describe("TEMPORARY VIDEO-1B route liveness diagnostic logging", () => {
  function diagnosticLines(logSpy: { mock: { calls: unknown[][] } }): unknown[] {
    return logSpy.mock.calls
      .filter((c: unknown[]) => typeof c[0] === "string" && (c[0] as string).startsWith("VIDEO-1B ROUTE DIAGNOSTIC"))
      .map((c: unknown[]) => JSON.parse((c[0] as string).replace("VIDEO-1B ROUTE DIAGNOSTIC ", "")));
  }

  it("no headers at all: one diagnostic line, livenessProbe=true, timestampShape=unknown, behavior unchanged (200)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const response = await POST(buildRequest({ body: "{}", signatureHeader: null, timestampHeader: null }));

    expect(response.status).toBe(200);
    const lines = diagnosticLines(logSpy);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({ hasSignatureHeader: false, hasTimestampHeader: false, livenessProbe: true, timestampShape: "unknown" });
    logSpy.mockRestore();
  });

  it("milliseconds-shaped probe: one diagnostic line, livenessProbe=true, timestampShape=milliseconds, behavior unchanged (200)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const timestampHeader = String(Date.now());
    const response = await POST(buildRequest({ body: "{}", signatureHeader: "some-signature", timestampHeader }));

    expect(response.status).toBe(200);
    const lines = diagnosticLines(logSpy);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({ hasSignatureHeader: true, hasTimestampHeader: true, livenessProbe: true, timestampShape: "milliseconds" });
    const rawLine = logSpy.mock.calls.find((c) => typeof c[0] === "string" && (c[0] as string).startsWith("VIDEO-1B ROUTE DIAGNOSTIC"))?.[0] as string;
    expect(rawLine).not.toContain(timestampHeader); // raw timestamp value never logged
    expect(rawLine).not.toContain("some-signature"); // raw signature value never logged
    logSpy.mockRestore();
  });

  it("current seconds timestamp + VALID signature (a real signed event): one diagnostic line, livenessProbe=false, timestampShape=seconds, normal processing unaffected", async () => {
    const { session, tutorUser } = await setupConfirmedBookingWithRoom();
    const body = JSON.stringify({ type: "participant.joined", payload: { room: REAL_ROOM_NAME, user_id: tutorUser.id, session_id: randomUUID() } });
    const timestampHeader = String(Math.floor(Date.now() / 1000));
    const signatureHeader = sign(timestampHeader, body);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const response = await POST(buildRequest({ body, signatureHeader, timestampHeader }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, handled: true });
    const lines = diagnosticLines(logSpy);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({ hasSignatureHeader: true, hasTimestampHeader: true, livenessProbe: false, timestampShape: "seconds" });
    const events = await db.sessionAttendanceEvent.findMany({ where: { sessionId: session.id } });
    expect(events).toHaveLength(1); // real processing still happened, diagnostic didn't interfere
    logSpy.mockRestore();
  });

  it("diagnostic line contains only the four allowed fields — no room/user_id/body/token/secret ever appears", async () => {
    const { tutorUser } = await setupConfirmedBookingWithRoom();
    const body = JSON.stringify({ type: "participant.joined", payload: { room: REAL_ROOM_NAME, user_id: tutorUser.id, session_id: randomUUID() } });
    const timestampHeader = String(Math.floor(Date.now() / 1000));
    const signatureHeader = sign(timestampHeader, body);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await POST(buildRequest({ body, signatureHeader, timestampHeader }));

    const lines = diagnosticLines(logSpy) as Array<Record<string, unknown>>;
    expect(Object.keys(lines[0]).sort()).toEqual(["hasSignatureHeader", "hasTimestampHeader", "livenessProbe", "timestampShape"].sort());
    const rawLine = logSpy.mock.calls.find((c) => typeof c[0] === "string" && (c[0] as string).startsWith("VIDEO-1B ROUTE DIAGNOSTIC"))?.[0] as string;
    expect(rawLine).not.toContain(REAL_ROOM_NAME);
    expect(rawLine).not.toContain(tutorUser.id);
    expect(rawLine).not.toContain(TEST_SECRET_BASE64);
    expect(rawLine).not.toContain(signatureHeader);
    logSpy.mockRestore();
  });
});
