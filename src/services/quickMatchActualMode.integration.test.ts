import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { randomUUID, createHash } from "crypto";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";

// RW-02 — real-PostgreSQL proof that a Quick Match request carries ONE actual
// session mode end to end (request -> customer quote -> lock -> dispatch /
// payout quote -> acceptance -> booking), and that a legacy request stored
// with tutoringMode=BOTH is never booked, never paid, never converted and
// never rewritten.
//
// Runs the REAL server actions (createTutoringRequestAction,
// confirmTutoringRequestAction, acceptTutorInvitationAction) and the REAL
// dispatch against the verified, isolated local test database. Test-local
// mocks only: the session (auth), translations, cache revalidation, the
// Closed Beta flags (both off here so IN_PERSON and payment confirmation are
// reachable — this does not touch CLOSED_BETA_MODE configuration), Stripe
// (paymentsUseStripe=false -> the existing dev-bypass payment path;
// getStripeClient throws if anything ever reaches it), and the post-commit
// booking-confirmation email dispatch (so no email can be sent).

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; role: string } } }));

vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => session.current) }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn().mockResolvedValue((key: string) => key) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/closedBetaConfig", () => ({
  closedBetaFinancialGateActive: () => false,
  closedBetaOnlineOnlyActive: () => false,
  getClosedBetaMode: () => "inactive",
}));
vi.mock("@/lib/paymentMode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/paymentMode")>()),
  paymentsUseStripe: () => false,
}));
vi.mock("@/lib/stripe", () => ({
  getStripeClient: () => {
    throw new Error("RW-02 integration test: Stripe must never be reached");
  },
}));
vi.mock("@/services/bookingNotifications", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/bookingNotifications")>()),
  dispatchBookingConfirmationEmails: vi.fn(async () => {}),
}));

vi.setConfig({ testTimeout: 60_000 });

let createTutoringRequestAction: typeof import("@/lib/actions/tutoringRequests").createTutoringRequestAction;
let confirmTutoringRequestAction: typeof import("@/lib/actions/tutoringRequests").confirmTutoringRequestAction;
let acceptTutorInvitationAction: typeof import("@/lib/actions/tutorInvitations").acceptTutorInvitationAction;
let advanceDispatch: typeof import("./quickMatchDispatch").advanceDispatch;
let createCustomerPriceQuote: typeof import("./customerPricing").createCustomerPriceQuote;
let createTutorPayoutQuote: typeof import("./tutorPayout").createTutorPayoutQuote;
let reserveBookingPendingPayment: typeof import("./bookingCreation").reserveBookingPendingPayment;
let InvalidActualTutoringModeError: typeof import("@/lib/tutoringModeResolution").InvalidActualTutoringModeError;

let db: PrismaClient;
let subjectId: string;
let academicLevelId: string;
let createdRankingSettingsId: string | null = null;

const createdUserIds: string[] = [];
const createdTutorProfileIds: string[] = [];
const createdStudentProfileIds: string[] = [];

const DAY = 24 * 60 * 60 * 1000;
let slot = 0;
function nextStart(): Date {
  slot += 1;
  const base = Math.ceil((Date.now() + 12 * DAY) / 3_600_000) * 3_600_000;
  return new Date(base + slot * 3 * 3_600_000);
}

beforeAll(async () => {
  const target = resolveVerifiedTestDatabase();
  const devDatabaseUrlForSafetyCheckOnly = process.env.DATABASE_URL;
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: target.connectionString }) });
  process.env.DATABASE_URL = target.connectionString;

  ({ createTutoringRequestAction, confirmTutoringRequestAction } = await import("@/lib/actions/tutoringRequests"));
  ({ acceptTutorInvitationAction } = await import("@/lib/actions/tutorInvitations"));
  ({ advanceDispatch } = await import("./quickMatchDispatch"));
  ({ createCustomerPriceQuote } = await import("./customerPricing"));
  ({ createTutorPayoutQuote } = await import("./tutorPayout"));
  ({ reserveBookingPendingPayment } = await import("./bookingCreation"));
  ({ InvalidActualTutoringModeError } = await import("@/lib/tutoringModeResolution"));

  const { db: ambientDb } = await import("@/lib/db");
  const devName = devDatabaseUrlForSafetyCheckOnly
    ? new URL(devDatabaseUrlForSafetyCheckOnly).pathname.replace(/^\//, "")
    : null;
  for (const [label, client] of [["fixture", db], ["ambient", ambientDb]] as const) {
    const [{ current_database: name }] = await client.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
    if (name !== target.databaseName) throw new Error(`FAIL CLOSED: ${label} client is on "${name}", expected "${target.databaseName}".`);
    if (devName && name === devName) throw new Error(`FAIL CLOSED: ${label} client is on the development database.`);
  }

  subjectId = (await db.subject.create({ data: { slug: `rw02-subject-${randomUUID()}`, sortOrder: 999 } })).id;
  academicLevelId = (await db.academicLevel.create({ data: { slug: `rw02-level-${randomUUID()}`, sortOrder: 999 } })).id;
  if (!(await db.marketplacePricingSettings.findFirst())) await db.marketplacePricingSettings.create({ data: {} });
  if (!(await db.tutorRankingSettings.findFirst())) {
    createdRankingSettingsId = (await db.tutorRankingSettings.create({ data: {} })).id;
  }
  await db.customerBasePriceRule.create({
    data: { subjectId, academicLevelId: null, baseDurationMinutes: 60, basePriceCents: 8000, pricingVersion: "CUSTOMER_PRICING_V1" },
  });
  await db.tutorBasePayoutRule.create({
    data: { tutorTier: "NEW", subjectId, academicLevelId: null, baseDurationMinutes: 60, payoutCents: 5000, payoutVersion: "TUTOR_PAYOUT_V1" },
  });
}, 60_000);

afterAll(async () => {
  await db.tutorBasePayoutRule.deleteMany({ where: { subjectId } });
  await db.customerBasePriceRule.deleteMany({ where: { subjectId } });
  await db.academicLevel.delete({ where: { id: academicLevelId } }).catch(() => {});
  await db.subject.delete({ where: { id: subjectId } }).catch(() => {});
  if (createdRankingSettingsId) await db.tutorRankingSettings.delete({ where: { id: createdRankingSettingsId } }).catch(() => {});
  await db?.$disconnect();
});

afterEach(async () => {
  session.current = null;
  const requests = await db.tutoringRequest.findMany({ where: { studentProfileId: { in: createdStudentProfileIds } }, select: { id: true } });
  const requestIds = requests.map((r) => r.id);
  const bookings = await db.booking.findMany({
    where: { OR: [{ studentProfileId: { in: createdStudentProfileIds } }, { tutorProfileId: { in: createdTutorProfileIds } }] },
    select: { id: true },
  });
  const bookingIds = bookings.map((b) => b.id);
  const invitations = await db.tutorInvitation.findMany({ where: { tutoringRequestId: { in: requestIds } }, select: { id: true } });
  const invitationIds = invitations.map((i) => i.id);

  await db.auditLog.deleteMany({ where: { entityId: { in: [...requestIds, ...bookingIds, ...invitationIds] } } });
  await db.tutorInvitation.deleteMany({ where: { id: { in: invitationIds } } });
  if (bookingIds.length > 0) {
    await db.bookingEmailNotification.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await db.sessionNotification.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await db.tutorEarning.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await db.session_.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await db.payment.updateMany({ where: { bookingId: { in: bookingIds } }, data: { bookingId: null } });
    await db.bookingStatusHistory.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await db.booking.deleteMany({ where: { id: { in: bookingIds } } });
  }
  await db.tutoringRequest.deleteMany({ where: { id: { in: requestIds } } });
  const quotes = await db.customerPriceQuote.findMany({ where: { studentProfileId: { in: createdStudentProfileIds } }, select: { id: true } });
  const quoteIds = quotes.map((q) => q.id);
  const payments = await db.payment.findMany({ where: { customerPriceQuoteId: { in: quoteIds } }, select: { id: true } });
  await db.paymentAttempt.deleteMany({ where: { paymentId: { in: payments.map((p) => p.id) } } });
  await db.payment.deleteMany({ where: { id: { in: payments.map((p) => p.id) } } });
  await db.tutorPayoutQuote.deleteMany({ where: { customerPriceQuoteId: { in: quoteIds } } });
  await db.customerPriceQuote.deleteMany({ where: { id: { in: quoteIds } } });
  await db.tutorProfile.deleteMany({ where: { id: { in: createdTutorProfileIds } } });
  await db.studentProfile.deleteMany({ where: { id: { in: createdStudentProfileIds } } });
  await db.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
  await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
  createdTutorProfileIds.length = 0;
  createdStudentProfileIds.length = 0;
  createdUserIds.length = 0;
});

// ---------------------------------------------------------------- fixtures

async function createTutor(learningMode: "ONLINE" | "IN_PERSON" | "BOTH", city = "Ottawa") {
  const user = await db.user.create({ data: { email: `rw02-tutor-${randomUUID()}@futuretutor.test`, role: "TUTOR" } });
  createdUserIds.push(user.id);
  const tutorProfile = await db.tutorProfile.create({
    data: {
      userId: user.id,
      slug: `rw02-tutor-${randomUUID()}`,
      applicationStatus: "APPROVED",
      payoutTier: "NEW",
      learningMode,
      city,
      tutorAgreementAcceptedAt: new Date(),
      tutorAgreementAcceptedVersion: "2026-08-30",
      tutorAgreementAcceptedLocale: "en",
    },
  });
  createdTutorProfileIds.push(tutorProfile.id);
  await db.tutorSubject.create({ data: { tutorProfileId: tutorProfile.id, subjectId } });
  await db.tutorLevel.create({ data: { tutorProfileId: tutorProfile.id, academicLevelId } });
  await db.tutorAvailability.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      tutorProfileId: tutorProfile.id,
      dayOfWeek,
      startTime: "00:00",
      endTime: "23:59",
      timezone: "UTC",
      mode: learningMode,
    })),
  });
  return { user, tutorProfile };
}

async function createStudent() {
  const user = await db.user.create({ data: { email: `rw02-student-${randomUUID()}@futuretutor.test`, role: "STUDENT" } });
  createdUserIds.push(user.id);
  const studentProfile = await db.studentProfile.create({
    data: { userId: user.id, firstName: "Rw", lastName: "Two", managementMode: "SELF_MANAGED" },
  });
  createdStudentProfileIds.push(studentProfile.id);
  return { user, studentProfile };
}

function requestForm(studentProfileId: string, mode: "ONLINE" | "IN_PERSON", startAt: Date) {
  const fd = new FormData();
  fd.set("studentProfileId", studentProfileId);
  fd.set("subjectId", subjectId);
  fd.set("academicLevelId", academicLevelId);
  fd.set("tutoringMode", mode);
  fd.set("durationMinutes", "60");
  fd.set("requestedStartAt", startAt.toISOString());
  if (mode === "IN_PERSON") {
    fd.set("addressLine1", "1 Main St");
    fd.set("city", "Ottawa");
    fd.set("province", "ON");
    fd.set("postalCode", "K1A0A1");
    fd.set("arrivalInstructions", "Side door");
  }
  return fd;
}

/** Same fingerprint formula as customerPricing.ts's computeContextHash. */
function expectedContextHash(c: { subjectId: string; academicLevelId: string | null; mode: string; durationMinutes: number; startAt: Date }) {
  const raw = [c.subjectId, c.academicLevelId ?? "", c.mode, c.durationMinutes, c.startAt.toISOString()].join("|");
  return createHash("sha256").update(raw).digest("hex");
}

/** Drives the real actions: create -> confirm (lock + dispatch round 1). */
async function createAndConfirm(mode: "ONLINE" | "IN_PERSON") {
  const student = await createStudent();
  const startAt = nextStart();
  session.current = { user: { id: student.user.id, role: "STUDENT" } };
  const created = await createTutoringRequestAction(undefined, requestForm(student.studentProfile.id, mode, startAt));
  if (!created || created.success !== true) {
    throw new Error(`createTutoringRequestAction failed: ${created && "error" in created ? created.error : "no state"}`);
  }

  const confirmForm = new FormData();
  confirmForm.set("tutoringRequestId", created.tutoringRequestId);
  confirmForm.set("customerPriceQuoteId", created.customerPriceQuoteId);
  const confirmed = await confirmTutoringRequestAction(undefined, confirmForm);
  expect(confirmed).toEqual({ success: true });
  return { student, startAt, requestId: created.tutoringRequestId, quoteId: created.customerPriceQuoteId };
}

async function acceptAs(tutorUserId: string, invitationId: string) {
  session.current = { user: { id: tutorUserId, role: "TUTOR" } };
  const fd = new FormData();
  fd.set("tutorInvitationId", invitationId);
  return acceptTutorInvitationAction(undefined, fd);
}

// ------------------------------------------------------- full actual flows

describe("Quick Match end to end — one actual mode across request, quotes, lock and booking", () => {
  it.each(["ONLINE", "IN_PERSON"] as const)("%s: every persisted actual-mode field agrees, and the context hash binds it", async (mode) => {
    // A BOTH-capable tutor must match either actual mode; a single-mode tutor
    // of the OTHER mode must never be invited.
    const bothCapable = await createTutor("BOTH");
    const wrongMode = await createTutor(mode === "ONLINE" ? "IN_PERSON" : "ONLINE");

    const { startAt, requestId, quoteId } = await createAndConfirm(mode);

    const invitations = await db.tutorInvitation.findMany({ where: { tutoringRequestId: requestId } });
    expect(invitations.map((i) => i.tutorProfileId)).toEqual([bothCapable.tutorProfile.id]);
    expect(invitations.some((i) => i.tutorProfileId === wrongMode.tutorProfile.id)).toBe(false);

    const accepted = await acceptAs(bothCapable.user.id, invitations[0].id);
    expect(accepted).toEqual({ success: true });

    const request = await db.tutoringRequest.findUniqueOrThrow({ where: { id: requestId } });
    const quote = await db.customerPriceQuote.findUniqueOrThrow({ where: { id: quoteId } });
    const payoutQuote = await db.tutorPayoutQuote.findUniqueOrThrow({ where: { id: invitations[0].tutorPayoutQuoteId! } });
    const booking = await db.booking.findFirstOrThrow({ where: { tutoringRequestId: requestId } });

    expect(request.tutoringMode).toBe(mode);
    expect(quote.tutoringMode).toBe(mode);
    expect((quote.contextSnapshot as { tutoringMode: string }).tutoringMode).toBe(mode);
    expect(payoutQuote.tutoringMode).toBe(mode);
    expect(booking.mode).toBe(mode);

    // The quote's immutable fingerprint is exactly the booking's own context.
    expect(quote.contextHash).toBe(
      expectedContextHash({ subjectId, academicLevelId, mode: booking.mode, durationMinutes: 60, startAt: booking.startAt })
    );
    expect(booking.startAt.getTime()).toBe(startAt.getTime());
    expect(quote.status).toBe("CONSUMED");
    expect(booking.status).toBe("CONFIRMED");
    expect(booking.customerPriceQuoteId).toBe(quote.id);
    expect(booking.tutorPayoutQuoteId).toBe(payoutQuote.id);
    expect(booking.totalCents).toBe(quote.totalCents);
    expect(booking.tutorPayoutCents).toBe(payoutQuote.totalPayoutCents);

    if (mode === "IN_PERSON") {
      expect(booking.bookingAddressLine1).toBe("1 Main St");
      expect(booking.bookingCity).toBe("Ottawa");
      expect(booking.bookingPostalCode).toBe("K1A0A1");
      expect(booking.bookingArrivalInstructions).toBe("Side door");
    } else {
      expect(booking.bookingAddressLine1).toBeNull();
      expect(booking.bookingCity).toBeNull();
    }
  });

  it("travel pricing: applied only to IN_PERSON quotes that carry a distance (unchanged rule); Quick Match supplies none today", async () => {
    const student = await createStudent();
    const ctx = {
      createdByUserId: student.user.id,
      studentProfileId: student.studentProfile.id,
      subjectId,
      academicLevelId,
      durationMinutes: 60,
      requestedStartAt: nextStart(),
    };
    const inPersonWithDistance = await createCustomerPriceQuote({ ...ctx, tutoringMode: "IN_PERSON", distanceKm: 12 }, db);
    const onlineWithDistance = await createCustomerPriceQuote({ ...ctx, tutoringMode: "ONLINE", distanceKm: 12 }, db);
    const inPersonNoDistance = await createCustomerPriceQuote({ ...ctx, tutoringMode: "IN_PERSON" }, db);

    type Adj = { type: string; amountCents: number };
    const travel = (q: { breakdown: unknown }) => (q.breakdown as Adj[]).filter((a) => a.type === "TRAVEL");
    expect(travel(inPersonWithDistance)).toEqual([expect.objectContaining({ type: "TRAVEL", amountCents: 1200 })]);
    expect(inPersonWithDistance.subtotalCents - onlineWithDistance.subtotalCents).toBe(1200);
    expect(travel(onlineWithDistance)).toEqual([]);
    expect(travel(inPersonNoDistance)).toEqual([]);
  });
});

// ---------------------------------------------------- legacy BOTH requests

describe("legacy TutoringRequest stored with tutoringMode=BOTH (inserted directly into the isolated test DB)", () => {
  /** Reproduces a pre-RW-02 row set: the real services can no longer write
   * BOTH, so ONLINE rows are created through them and then rewritten to BOTH
   * directly in the test database. */
  async function createLegacyBothRequest(status: "PRICED" | "MATCHING") {
    const tutor = await createTutor("BOTH");
    const student = await createStudent();
    const startAt = nextStart();
    const quote = await createCustomerPriceQuote(
      {
        createdByUserId: student.user.id,
        studentProfileId: student.studentProfile.id,
        subjectId,
        academicLevelId,
        tutoringMode: "ONLINE",
        durationMinutes: 60,
        requestedStartAt: startAt,
      },
      db
    );
    const legacyHash = expectedContextHash({ subjectId, academicLevelId, mode: "BOTH", durationMinutes: 60, startAt });
    await db.customerPriceQuote.update({
      where: { id: quote.id },
      data: { tutoringMode: "BOTH", contextHash: legacyHash, status: status === "MATCHING" ? "LOCKED" : "ACTIVE", lockedAt: status === "MATCHING" ? new Date() : null },
    });
    const request = await db.tutoringRequest.create({
      data: {
        createdByUserId: student.user.id,
        studentProfileId: student.studentProfile.id,
        subjectId,
        academicLevelId,
        tutoringMode: "BOTH",
        durationMinutes: 60,
        requestedStartAt: startAt,
        currency: "CAD",
        customerPriceQuoteId: quote.id,
        status,
        dispatchRound: status === "MATCHING" ? 1 : 0,
      },
    });
    return { tutor, student, quote, request, startAt };
  }

  it("dispatch: advanceDispatch is a complete no-op — no invitation, no payout quote, request byte-for-byte unchanged", async () => {
    const { request, quote } = await createLegacyBothRequest("MATCHING");
    const before = await db.tutoringRequest.findUniqueOrThrow({ where: { id: request.id } });

    await advanceDispatch(request.id);

    expect(await db.tutorInvitation.count({ where: { tutoringRequestId: request.id } })).toBe(0);
    expect(await db.tutorPayoutQuote.count({ where: { customerPriceQuoteId: quote.id } })).toBe(0);
    expect(await db.tutoringRequest.findUniqueOrThrow({ where: { id: request.id } })).toEqual(before);
  });

  it("acceptance: refused with invitationNoLongerAvailable — no booking, no capture, nothing rewritten", async () => {
    const { tutor, student, quote, request, startAt } = await createLegacyBothRequest("MATCHING");
    // A pre-RW-02 invitation + payout quote + authorized payment for it.
    const payoutQuote = await createTutorPayoutQuote(
      { tutorProfileId: tutor.tutorProfile.id, subjectId, academicLevelId, tutoringMode: "ONLINE", durationMinutes: 60, requestedStartAt: startAt },
      quote.id,
      db
    );
    await db.tutorPayoutQuote.update({ where: { id: payoutQuote.id }, data: { tutoringMode: "BOTH" } });
    const invitation = await db.tutorInvitation.create({
      data: {
        tutoringRequestId: request.id,
        tutorProfileId: tutor.tutorProfile.id,
        tutorPayoutQuoteId: payoutQuote.id,
        dispatchRound: 1,
        status: "PENDING",
        rankScore: 1,
        rankBreakdown: {},
        rankingVersion: "RW02_TEST",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
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

    const snapshot = async () => ({
      request: await db.tutoringRequest.findUniqueOrThrow({ where: { id: request.id } }),
      quote: await db.customerPriceQuote.findUniqueOrThrow({ where: { id: quote.id } }),
      payoutQuote: await db.tutorPayoutQuote.findUniqueOrThrow({ where: { id: payoutQuote.id } }),
      invitation: await db.tutorInvitation.findUniqueOrThrow({ where: { id: invitation.id } }),
      payment: await db.payment.findUniqueOrThrow({ where: { id: payment.id } }),
    });
    const before = await snapshot();

    const result = await acceptAs(tutor.user.id, invitation.id);

    expect(result).toEqual({ error: "invitationNoLongerAvailable" });
    expect(await db.booking.count({ where: { tutoringRequestId: request.id } })).toBe(0);
    expect(await db.auditLog.count({ where: { entityId: invitation.id, action: "quickmatch.invitation.accepted" } })).toBe(0);
    const after = await snapshot();
    expect(after).toEqual(before); // request, quotes, invitation and payment all exactly as stored
    expect(after.payment.status).toBe("AUTHORIZED"); // never captured
    expect(after.payment.bookingId).toBeNull();
    expect(after.request.tutoringMode).toBe("BOTH"); // never converted
  });

  it("confirmation: a legacy PRICED BOTH request is refused before any payment is created or the quote is locked", async () => {
    const { student, quote, request } = await createLegacyBothRequest("PRICED");
    session.current = { user: { id: student.user.id, role: "STUDENT" } };
    const fd = new FormData();
    fd.set("tutoringRequestId", request.id);
    fd.set("customerPriceQuoteId", quote.id);

    expect(await confirmTutoringRequestAction(undefined, fd)).toEqual({ error: "invalidState" });

    expect(await db.payment.count({ where: { customerPriceQuoteId: quote.id } })).toBe(0);
    expect((await db.customerPriceQuote.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe("ACTIVE");
    expect((await db.tutoringRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("PRICED");
  });

  it("reservation: reserveBookingPendingPayment with mode BOTH throws before writing anything", async () => {
    const { tutor, student, quote, startAt } = await createLegacyBothRequest("MATCHING");
    const { db: ambientDb } = await import("@/lib/db");
    await expect(
      ambientDb.$transaction((tx) =>
        reserveBookingPendingPayment(tx, {
          actorUserId: student.user.id,
          studentProfileId: student.studentProfile.id,
          tutorProfileId: tutor.tutorProfile.id,
          subjectId,
          academicLevelId,
          startAt,
          endAt: new Date(startAt.getTime() + 3600_000),
          timezone: "UTC",
          mode: "BOTH" as never,
          paymentId: "nonexistent",
          customerPriceQuoteId: quote.id,
          tutorPayoutQuoteId: "nonexistent",
        })
      )
    ).rejects.toBeInstanceOf(InvalidActualTutoringModeError);
    expect(await db.booking.count({ where: { studentProfileId: student.studentProfile.id } })).toBe(0);
    expect((await db.customerPriceQuote.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe("LOCKED");
  });
});
