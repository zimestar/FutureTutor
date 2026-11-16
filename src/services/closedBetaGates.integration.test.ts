import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";

// RW-22 — every closed-beta call site, driven under all four combinations of
// the two independent gates, against the REAL src/lib/closedBetaConfig.ts
// (deliberately NOT mocked) and the verified, isolated local test database.
// The gate variables are set on process.env inside this test process only
// and restored after every test — no .env file and no deployed environment
// is touched.
//
// Test-local mocks only: session (auth), translations, cache revalidation,
// Stripe (paymentsUseStripe=false -> the existing dev-bypass path;
// getStripeClient throws if ever reached) and post-commit booking emails.

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; role: string } } }));

vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => session.current) }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn().mockResolvedValue((key: string) => key) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/paymentMode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/paymentMode")>()),
  paymentsUseStripe: () => false,
}));
vi.mock("@/lib/stripe", () => ({
  getStripeClient: () => {
    throw new Error("RW-22 integration test: Stripe must never be reached");
  },
}));
vi.mock("@/services/bookingNotifications", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/bookingNotifications")>()),
  dispatchBookingConfirmationEmails: vi.fn(async () => {}),
}));

vi.setConfig({ testTimeout: 60_000 });

const GATE_ENV_KEYS = [
  "CLOSED_BETA_FINANCIAL_GATE",
  "CLOSED_BETA_ONLINE_ONLY",
  "CLOSED_BETA_MODE",
  "FINANCIAL_E2E_ENABLED",
  "FINANCIAL_E2E_ACTOR_ID",
  "FINANCIAL_E2E_TUTOR_PROFILE_ID",
  "FINANCIAL_E2E_EXPIRES_AT",
] as const;
const ORIGINAL_ENV = Object.fromEntries(GATE_ENV_KEYS.map((k) => [k, process.env[k]])) as Record<string, string | undefined>;

function setGates(values: { financial?: string; onlineOnly?: string; legacy?: string }) {
  // The financial E2E exception is never configured in these tests.
  for (const key of GATE_ENV_KEYS) delete process.env[key];
  if (values.financial !== undefined) process.env.CLOSED_BETA_FINANCIAL_GATE = values.financial;
  if (values.onlineOnly !== undefined) process.env.CLOSED_BETA_ONLINE_ONLY = values.onlineOnly;
  if (values.legacy !== undefined) process.env.CLOSED_BETA_MODE = values.legacy;
}

let createUserForSignup: typeof import("./signup").createUserForSignup;
let createGuardianManagedStudent: typeof import("./familyManagement").createGuardianManagedStudent;
let updateStudentProfileForActor: typeof import("./profileManagement").updateStudentProfileForActor;
let BetaOnlineOnlyModeError: typeof import("./profileManagement").BetaOnlineOnlyModeError;
let createTutoringRequestAction: typeof import("@/lib/actions/tutoringRequests").createTutoringRequestAction;
let confirmTutoringRequestAction: typeof import("@/lib/actions/tutoringRequests").confirmTutoringRequestAction;
let preparePaymentForRequestAction: typeof import("@/lib/actions/tutoringRequests").preparePaymentForRequestAction;
let preparePaymentForBookingQuoteAction: typeof import("@/lib/actions/payments").preparePaymentForBookingQuoteAction;
let createBookingAction: typeof import("@/lib/actions/bookings").createBookingAction;
let createPriceQuoteAction: typeof import("@/lib/actions/pricing").createPriceQuoteAction;

let db: PrismaClient;
let subjectId: string;
let academicLevelId: string;
let createdRankingSettingsId: string | null = null;
const createdUserIds: string[] = [];
const createdStudentProfileIds: string[] = [];
const createdTutorProfileIds: string[] = [];

beforeAll(async () => {
  const target = resolveVerifiedTestDatabase();
  const devDatabaseUrlForSafetyCheckOnly = process.env.DATABASE_URL;
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: target.connectionString }) });
  process.env.DATABASE_URL = target.connectionString;

  ({ createUserForSignup } = await import("./signup"));
  ({ createGuardianManagedStudent } = await import("./familyManagement"));
  ({ updateStudentProfileForActor, BetaOnlineOnlyModeError } = await import("./profileManagement"));
  ({ createTutoringRequestAction, confirmTutoringRequestAction, preparePaymentForRequestAction } = await import(
    "@/lib/actions/tutoringRequests"
  ));
  ({ preparePaymentForBookingQuoteAction } = await import("@/lib/actions/payments"));
  ({ createBookingAction } = await import("@/lib/actions/bookings"));
  ({ createPriceQuoteAction } = await import("@/lib/actions/pricing"));

  const { db: ambientDb } = await import("@/lib/db");
  const devName = devDatabaseUrlForSafetyCheckOnly
    ? new URL(devDatabaseUrlForSafetyCheckOnly).pathname.replace(/^\//, "")
    : null;
  for (const [label, client] of [["fixture", db], ["ambient", ambientDb]] as const) {
    const [{ current_database: name }] = await client.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
    if (name !== target.databaseName) throw new Error(`FAIL CLOSED: ${label} client is on "${name}", expected "${target.databaseName}".`);
    if (devName && name === devName) throw new Error(`FAIL CLOSED: ${label} client is on the development database.`);
  }

  subjectId = (await db.subject.create({ data: { slug: `rw22-subject-${randomUUID()}`, sortOrder: 999 } })).id;
  academicLevelId = (await db.academicLevel.create({ data: { slug: `rw22-level-${randomUUID()}`, sortOrder: 999 } })).id;
  if (!(await db.marketplacePricingSettings.findFirst())) await db.marketplacePricingSettings.create({ data: {} });
  if (!(await db.tutorRankingSettings.findFirst())) createdRankingSettingsId = (await db.tutorRankingSettings.create({ data: {} })).id;
  await db.customerBasePriceRule.create({
    data: { subjectId, academicLevelId: null, baseDurationMinutes: 60, basePriceCents: 8000, pricingVersion: "CUSTOMER_PRICING_V1" },
  });
  await db.tutorBasePayoutRule.create({
    data: { tutorTier: "NEW", subjectId, academicLevelId: null, baseDurationMinutes: 60, payoutCents: 5000, payoutVersion: "TUTOR_PAYOUT_V1" },
  });
}, 60_000);

afterAll(async () => {
  for (const key of GATE_ENV_KEYS) {
    if (ORIGINAL_ENV[key] === undefined) delete process.env[key];
    else process.env[key] = ORIGINAL_ENV[key];
  }
  await db.tutorBasePayoutRule.deleteMany({ where: { subjectId } });
  await db.customerBasePriceRule.deleteMany({ where: { subjectId } });
  await db.academicLevel.delete({ where: { id: academicLevelId } }).catch(() => {});
  await db.subject.delete({ where: { id: subjectId } }).catch(() => {});
  if (createdRankingSettingsId) await db.tutorRankingSettings.delete({ where: { id: createdRankingSettingsId } }).catch(() => {});
  await db?.$disconnect();
});

afterEach(async () => {
  session.current = null;
  for (const key of GATE_ENV_KEYS) {
    if (ORIGINAL_ENV[key] === undefined) delete process.env[key];
    else process.env[key] = ORIGINAL_ENV[key];
  }
  const relationships = await db.parentStudentRelationship.findMany({
    where: { studentProfileId: { in: createdStudentProfileIds } },
    select: { id: true },
  });
  const requests = await db.tutoringRequest.findMany({ where: { studentProfileId: { in: createdStudentProfileIds } }, select: { id: true } });
  const requestIds = requests.map((r) => r.id);
  const quotes = await db.customerPriceQuote.findMany({ where: { studentProfileId: { in: createdStudentProfileIds } }, select: { id: true } });
  const quoteIds = quotes.map((q) => q.id);
  await db.auditLog.deleteMany({ where: { entityId: { in: [...requestIds, ...createdStudentProfileIds, ...relationships.map((r) => r.id)] } } });
  await db.tutorInvitation.deleteMany({ where: { tutoringRequestId: { in: requestIds } } });
  await db.tutoringRequest.deleteMany({ where: { id: { in: requestIds } } });
  const payments = await db.payment.findMany({ where: { customerPriceQuoteId: { in: quoteIds } }, select: { id: true } });
  await db.paymentAttempt.deleteMany({ where: { paymentId: { in: payments.map((p) => p.id) } } });
  await db.payment.deleteMany({ where: { id: { in: payments.map((p) => p.id) } } });
  await db.tutorPayoutQuote.deleteMany({ where: { customerPriceQuoteId: { in: quoteIds } } });
  await db.customerPriceQuote.deleteMany({ where: { id: { in: quoteIds } } });
  await db.parentStudentRelationship.deleteMany({ where: { id: { in: relationships.map((r) => r.id) } } });
  await db.tutorProfile.deleteMany({ where: { id: { in: createdTutorProfileIds } } });
  await db.studentProfile.deleteMany({ where: { id: { in: createdStudentProfileIds } } });
  await db.parentProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
  await db.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
  await db.auditLog.deleteMany({ where: { actorUserId: { in: createdUserIds } } });
  await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
  createdUserIds.length = 0;
  createdStudentProfileIds.length = 0;
  createdTutorProfileIds.length = 0;
});

// ---------------------------------------------------------------- fixtures

async function signupStudent() {
  const user = await createUserForSignup(db, {
    firstName: "Rw",
    lastName: "TwentyTwo",
    email: `rw22-student-${randomUUID()}@futuretutor.test`,
    passwordHash: "not-a-real-hash",
    role: "STUDENT",
    dateOfBirth: new Date("2008-05-01T00:00:00.000Z"),
    province: "ON",
  });
  createdUserIds.push(user.id);
  const studentProfile = await db.studentProfile.findUniqueOrThrow({ where: { userId: user.id } });
  createdStudentProfileIds.push(studentProfile.id);
  return { user, studentProfile };
}

async function createParent() {
  const user = await db.user.create({ data: { email: `rw22-parent-${randomUUID()}@futuretutor.test`, role: "PARENT" } });
  createdUserIds.push(user.id);
  await db.parentProfile.create({ data: { userId: user.id, firstName: "Rw", lastName: "Parent" } });
  return user;
}

async function createBothCapableTutor() {
  const user = await db.user.create({ data: { email: `rw22-tutor-${randomUUID()}@futuretutor.test`, role: "TUTOR" } });
  createdUserIds.push(user.id);
  const tutorProfile = await db.tutorProfile.create({
    data: {
      userId: user.id,
      slug: `rw22-tutor-${randomUUID()}`,
      applicationStatus: "APPROVED",
      payoutTier: "NEW",
      learningMode: "BOTH",
      tutorAgreementAcceptedAt: new Date(),
      tutorAgreementAcceptedVersion: "2026-08-30",
      tutorAgreementAcceptedLocale: "en",
    },
  });
  createdTutorProfileIds.push(tutorProfile.id);
  return tutorProfile;
}

let slot = 0;
function requestForm(studentProfileId: string, mode: "ONLINE" | "IN_PERSON") {
  slot += 1;
  const fd = new FormData();
  fd.set("studentProfileId", studentProfileId);
  fd.set("subjectId", subjectId);
  fd.set("academicLevelId", academicLevelId);
  fd.set("tutoringMode", mode);
  fd.set("durationMinutes", "60");
  fd.set("requestedStartAt", new Date(Math.ceil((Date.now() + 15 * 86_400_000) / 3_600_000) * 3_600_000 + slot * 7_200_000).toISOString());
  if (mode === "IN_PERSON") {
    fd.set("addressLine1", "1 Main St");
    fd.set("city", "Ottawa");
    fd.set("province", "ON");
    fd.set("postalCode", "K1A0A1");
  }
  return fd;
}

// --------------------------------------------------------- the four combos

const COMBOS = [
  { financial: "active", onlineOnly: "active", label: "financial ACTIVE / online-only ACTIVE (today)" },
  { financial: "inactive", onlineOnly: "active", label: "financial INACTIVE / online-only ACTIVE (first paid launch)" },
  { financial: "active", onlineOnly: "inactive", label: "financial ACTIVE / online-only INACTIVE" },
  { financial: "inactive", onlineOnly: "inactive", label: "financial INACTIVE / online-only INACTIVE" },
] as const;

describe.each(COMBOS)("RW-22 call sites — $label", ({ financial, onlineOnly }) => {
  const financialActive = financial === "active";
  const onlineOnlyActive = onlineOnly === "active";

  it("signup: a new Student's default preference follows ONLINE-ONLY only", async () => {
    setGates({ financial, onlineOnly });
    const { studentProfile } = await signupStudent();
    expect(studentProfile.tutoringMode).toBe(onlineOnlyActive ? "ONLINE" : "BOTH");
  });

  it("family: a new guardian-managed child's default preference follows ONLINE-ONLY only", async () => {
    setGates({ financial, onlineOnly });
    const parent = await createParent();
    const { studentProfile } = await createGuardianManagedStudent(db, parent.id, {
      firstName: "Kid",
      lastName: "RwTwentyTwo",
      dateOfBirth: new Date("2015-01-01T00:00:00.000Z"),
    });
    createdStudentProfileIds.push(studentProfile.id);
    expect(studentProfile.tutoringMode).toBe(onlineOnlyActive ? "ONLINE" : "BOTH");
  });

  it("profile: changing a preference to IN_PERSON is refused iff ONLINE-ONLY is active", async () => {
    setGates({ financial, onlineOnly });
    const { user, studentProfile } = await signupStudent();
    await db.studentProfile.update({ where: { id: studentProfile.id }, data: { tutoringMode: "ONLINE" } });
    const attempt = updateStudentProfileForActor(db, user.id, studentProfile.id, { tutoringMode: "IN_PERSON" });
    if (onlineOnlyActive) await expect(attempt).rejects.toBeInstanceOf(BetaOnlineOnlyModeError);
    else expect((await attempt).tutoringMode).toBe("IN_PERSON");
  });

  it("Quick Match request creation: IN_PERSON refused iff ONLINE-ONLY active; ONLINE always created (financial gate irrelevant here)", async () => {
    setGates({ financial, onlineOnly });
    const { user, studentProfile } = await signupStudent();
    session.current = { user: { id: user.id, role: "STUDENT" } };

    const inPerson = await createTutoringRequestAction(undefined, requestForm(studentProfile.id, "IN_PERSON"));
    if (onlineOnlyActive) {
      expect(inPerson).toEqual({ success: false, error: "betaOnlineOnly" });
      expect(await db.tutoringRequest.count({ where: { studentProfileId: studentProfile.id } })).toBe(0);
    } else {
      expect(inPerson?.success).toBe(true);
      await db.tutoringRequest.updateMany({ where: { studentProfileId: studentProfile.id }, data: { status: "CANCELLED" } });
    }

    const online = await createTutoringRequestAction(undefined, requestForm(studentProfile.id, "ONLINE"));
    expect(online?.success).toBe(true);
  });

  it("Quick Match payment preparation and confirmation: refused iff the FINANCIAL gate is active", async () => {
    setGates({ financial, onlineOnly });
    const { user, studentProfile } = await signupStudent();
    session.current = { user: { id: user.id, role: "STUDENT" } };
    const created = await createTutoringRequestAction(undefined, requestForm(studentProfile.id, "ONLINE"));
    if (!created || created.success !== true) throw new Error("request creation failed");

    const prepared = await preparePaymentForRequestAction(created.tutoringRequestId);
    const fd = new FormData();
    fd.set("tutoringRequestId", created.tutoringRequestId);
    fd.set("customerPriceQuoteId", created.customerPriceQuoteId);
    const confirmed = await confirmTutoringRequestAction(undefined, fd);

    if (financialActive) {
      expect(prepared).toMatchObject({ success: false, reason: "beta_gate" });
      expect(confirmed).toEqual({ error: "betaBookingsUnavailable" });
      expect(await db.payment.count({ where: { customerPriceQuoteId: created.customerPriceQuoteId } })).toBe(0);
      expect((await db.tutoringRequest.findUniqueOrThrow({ where: { id: created.tutoringRequestId } })).status).toBe("PRICED");
    } else {
      expect(prepared.success).toBe(true);
      expect(confirmed).toEqual({ success: true });
      expect((await db.customerPriceQuote.findUniqueOrThrow({ where: { id: created.customerPriceQuoteId } })).status).not.toBe("ACTIVE");
    }
  });

  it("direct-booking payment preparation: beta_gate iff the FINANCIAL gate is active", async () => {
    setGates({ financial, onlineOnly });
    const { user } = await signupStudent();
    session.current = { user: { id: user.id, role: "STUDENT" } };
    const result = await preparePaymentForBookingQuoteAction(`missing-${randomUUID()}`);
    if (financialActive) expect(result).toMatchObject({ success: false, reason: "beta_gate" });
    else expect((result as { reason?: string }).reason).not.toBe("beta_gate");
  });

  it("direct booking: refused by the FINANCIAL gate when active; IN_PERSON stays refused unconditionally (no location capture)", async () => {
    setGates({ financial, onlineOnly });
    const { user, studentProfile } = await signupStudent();
    const tutor = await createBothCapableTutor();
    session.current = { user: { id: user.id, role: "STUDENT" } };
    const fd = new FormData();
    fd.set("studentProfileId", studentProfile.id);
    fd.set("tutorProfileId", tutor.id);
    fd.set("subjectId", subjectId);
    fd.set("academicLevelId", academicLevelId);
    fd.set("startAt", new Date(Date.now() + 5 * 86_400_000).toISOString());
    fd.set("tutoringMode", "IN_PERSON");
    fd.set("customerPriceQuoteId", "quote-placeholder");
    fd.set("tutorPayoutQuoteId", "payout-placeholder");

    const booking = await createBookingAction(undefined, fd);
    expect(booking).toEqual({ error: financialActive ? "betaBookingsUnavailable" : "directInPersonUnavailable" });

    // The quote step has no financial gate: IN_PERSON is refused there in every combination.
    const quote = await createPriceQuoteAction({
      studentProfileId: studentProfile.id,
      tutorProfileId: tutor.id,
      subjectId,
      academicLevelId,
      startAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      tutoringMode: "IN_PERSON",
    });
    expect(quote).toEqual({ success: false, error: "directInPersonUnavailable" });
    expect(await db.booking.count({ where: { studentProfileId: studentProfile.id } })).toBe(0);
  });
});

describe("RW-22 backward compatibility and fail-closed resolution at real call sites", () => {
  it("legacy-only CLOSED_BETA_MODE=inactive (new variables unset) opens both gates exactly as before RW-22", async () => {
    setGates({ legacy: "inactive" });
    const { user, studentProfile } = await signupStudent();
    expect(studentProfile.tutoringMode).toBe("BOTH");
    session.current = { user: { id: user.id, role: "STUDENT" } };
    expect((await preparePaymentForBookingQuoteAction(`missing-${randomUUID()}`) as { reason?: string }).reason).not.toBe("beta_gate");
  });

  it("an invalid explicit value fails closed even when the legacy value is inactive", async () => {
    setGates({ legacy: "inactive", financial: "Inactive", onlineOnly: " inactive" });
    const { user, studentProfile } = await signupStudent();
    expect(studentProfile.tutoringMode).toBe("ONLINE");
    session.current = { user: { id: user.id, role: "STUDENT" } };
    expect(await preparePaymentForBookingQuoteAction(`missing-${randomUUID()}`)).toMatchObject({ success: false, reason: "beta_gate" });
  });

  it("nothing set at all: both gates active", async () => {
    setGates({});
    const { user, studentProfile } = await signupStudent();
    expect(studentProfile.tutoringMode).toBe("ONLINE");
    session.current = { user: { id: user.id, role: "STUDENT" } };
    expect(await preparePaymentForBookingQuoteAction(`missing-${randomUUID()}`)).toMatchObject({ success: false, reason: "beta_gate" });
  });
});
