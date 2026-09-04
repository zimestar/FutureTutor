import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// PROD-FINANCIAL-E2E1-GATE1 — exhaustive fail-closed coverage for the
// temporary, single-scenario Closed Beta financial gate exception. Every
// dimension is proven to independently fail closed; only the exact,
// complete match succeeds.

const mocks = vi.hoisted(() => ({
  customerPriceQuoteFindUnique: vi.fn(),
  subjectFindUnique: vi.fn(),
  academicLevelFindUnique: vi.fn(),
  tutorPayoutQuoteFindFirst: vi.fn(),
  bookingFindFirst: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    customerPriceQuote: { findUnique: mocks.customerPriceQuoteFindUnique },
    subject: { findUnique: mocks.subjectFindUnique },
    academicLevel: { findUnique: mocks.academicLevelFindUnique },
    tutorPayoutQuote: { findFirst: mocks.tutorPayoutQuoteFindFirst },
    booking: { findFirst: mocks.bookingFindFirst },
  },
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));

import {
  financialE2EEnabled,
  financialE2EWithinExpiration,
  isFinancialE2EExceptionAllowed,
  auditFinancialE2EExceptionUsed,
} from "./financialE2EConfig";

const ACTOR_ID = "user_controlled_actor";
const TUTOR_ID = "tutor_controlled_profile";
const QUOTE_ID = "quote-1";

const ORIGINAL_ENV = { ...process.env };

function futureIso(hoursFromNow = 4): string {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

function setValidEnv(overrides: Partial<Record<string, string | undefined>> = {}) {
  const values: Record<string, string | undefined> = {
    FINANCIAL_E2E_ENABLED: "true",
    FINANCIAL_E2E_ACTOR_ID: ACTOR_ID,
    FINANCIAL_E2E_TUTOR_PROFILE_ID: TUTOR_ID,
    FINANCIAL_E2E_EXPIRES_AT: futureIso(),
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function validQuote(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    createdByUserId: ACTOR_ID,
    subjectId: "subject-math",
    academicLevelId: "level-elementary",
    tutoringMode: "ONLINE",
    durationMinutes: 60,
    totalCents: 3200,
    currency: "CAD",
    status: "ACTIVE",
    ...overrides,
  };
}

function mockFullyValidScenario() {
  mocks.customerPriceQuoteFindUnique.mockResolvedValue(validQuote());
  mocks.subjectFindUnique.mockResolvedValue({ slug: "math" });
  mocks.academicLevelFindUnique.mockResolvedValue({ slug: "elementary" });
  mocks.tutorPayoutQuoteFindFirst.mockResolvedValue({ tutorProfileId: TUTOR_ID, totalPayoutCents: 2200, currency: "CAD" });
  mocks.bookingFindFirst.mockResolvedValue(null);
}

describe("financialE2EEnabled", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("absent -> false", () => {
    delete process.env.FINANCIAL_E2E_ENABLED;
    expect(financialE2EEnabled()).toBe(false);
  });
  it('"false" -> false', () => {
    process.env.FINANCIAL_E2E_ENABLED = "false";
    expect(financialE2EEnabled()).toBe(false);
  });
  it.each(["1", "yes", "TRUE", "True", ""])("malformed value %j -> false", (value) => {
    process.env.FINANCIAL_E2E_ENABLED = value;
    expect(financialE2EEnabled()).toBe(false);
  });
  it('exact literal "true" -> true', () => {
    process.env.FINANCIAL_E2E_ENABLED = "true";
    expect(financialE2EEnabled()).toBe(true);
  });
});

describe("financialE2EWithinExpiration", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("expiration missing -> false", () => {
    delete process.env.FINANCIAL_E2E_EXPIRES_AT;
    expect(financialE2EWithinExpiration()).toBe(false);
  });
  it("expiration malformed -> false", () => {
    process.env.FINANCIAL_E2E_EXPIRES_AT = "not-a-date";
    expect(financialE2EWithinExpiration()).toBe(false);
  });
  it("expiration already passed -> false", () => {
    process.env.FINANCIAL_E2E_EXPIRES_AT = new Date(Date.now() - 60_000).toISOString();
    expect(financialE2EWithinExpiration()).toBe(false);
  });
  it("expiration in the future -> true", () => {
    process.env.FINANCIAL_E2E_EXPIRES_AT = futureIso();
    expect(financialE2EWithinExpiration()).toBe(true);
  });
});

describe("isFinancialE2EExceptionAllowed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("succeeds only when EVERY condition matches exactly", async () => {
    setValidEnv();
    mockFullyValidScenario();
    await expect(isFinancialE2EExceptionAllowed({ actorUserId: ACTOR_ID, customerPriceQuoteId: QUOTE_ID })).resolves.toBe(true);
  });

  it("E2E flag absent -> false, no DB call at all", async () => {
    setValidEnv({ FINANCIAL_E2E_ENABLED: undefined });
    await expect(isFinancialE2EExceptionAllowed({ actorUserId: ACTOR_ID, customerPriceQuoteId: QUOTE_ID })).resolves.toBe(false);
    expect(mocks.customerPriceQuoteFindUnique).not.toHaveBeenCalled();
  });

  it("E2E flag false -> false", async () => {
    setValidEnv({ FINANCIAL_E2E_ENABLED: "false" });
    await expect(isFinancialE2EExceptionAllowed({ actorUserId: ACTOR_ID, customerPriceQuoteId: QUOTE_ID })).resolves.toBe(false);
  });

  it("actor ID env missing -> false", async () => {
    setValidEnv({ FINANCIAL_E2E_ACTOR_ID: undefined });
    mockFullyValidScenario();
    await expect(isFinancialE2EExceptionAllowed({ actorUserId: ACTOR_ID, customerPriceQuoteId: QUOTE_ID })).resolves.toBe(false);
  });

  it("actor ID wrong (another production user) -> false", async () => {
    setValidEnv();
    mockFullyValidScenario();
    await expect(isFinancialE2EExceptionAllowed({ actorUserId: "some-other-user", customerPriceQuoteId: QUOTE_ID })).resolves.toBe(false);
  });

  it("quote.createdByUserId does not match actor -> false (defense-in-depth against a stolen quote id)", async () => {
    setValidEnv();
    mocks.customerPriceQuoteFindUnique.mockResolvedValue(validQuote({ createdByUserId: "different-user" }));
    await expect(isFinancialE2EExceptionAllowed({ actorUserId: ACTOR_ID, customerPriceQuoteId: QUOTE_ID })).resolves.toBe(false);
  });

  it("tutor ID env missing -> false", async () => {
    setValidEnv({ FINANCIAL_E2E_TUTOR_PROFILE_ID: undefined });
    mockFullyValidScenario();
    await expect(isFinancialE2EExceptionAllowed({ actorUserId: ACTOR_ID, customerPriceQuoteId: QUOTE_ID })).resolves.toBe(false);
  });

  it("tutor ID wrong (another tutor) -> false", async () => {
    setValidEnv();
    mocks.customerPriceQuoteFindUnique.mockResolvedValue(validQuote());
    mocks.subjectFindUnique.mockResolvedValue({ slug: "math" });
    mocks.academicLevelFindUnique.mockResolvedValue({ slug: "elementary" });
    mocks.tutorPayoutQuoteFindFirst.mockResolvedValue({ tutorProfileId: "a-different-tutor", totalPayoutCents: 2200, currency: "CAD" });
    await expect(isFinancialE2EExceptionAllowed({ actorUserId: ACTOR_ID, customerPriceQuoteId: QUOTE_ID })).resolves.toBe(false);
  });

  it("expiration missing -> false", async () => {
    setValidEnv({ FINANCIAL_E2E_EXPIRES_AT: undefined });
    mockFullyValidScenario();
    await expect(isFinancialE2EExceptionAllowed({ actorUserId: ACTOR_ID, customerPriceQuoteId: QUOTE_ID })).resolves.toBe(false);
  });

  it("expiration malformed -> false", async () => {
    setValidEnv({ FINANCIAL_E2E_EXPIRES_AT: "not-a-real-timestamp" });
    mockFullyValidScenario();
    await expect(isFinancialE2EExceptionAllowed({ actorUserId: ACTOR_ID, customerPriceQuoteId: QUOTE_ID })).resolves.toBe(false);
  });

  it("expiration already passed -> false", async () => {
    setValidEnv({ FINANCIAL_E2E_EXPIRES_AT: new Date(Date.now() - 60_000).toISOString() });
    mockFullyValidScenario();
    await expect(isFinancialE2EExceptionAllowed({ actorUserId: ACTOR_ID, customerPriceQuoteId: QUOTE_ID })).resolves.toBe(false);
  });

  it("subject != math -> false", async () => {
    setValidEnv();
    mocks.customerPriceQuoteFindUnique.mockResolvedValue(validQuote());
    mocks.subjectFindUnique.mockResolvedValue({ slug: "physics" });
    mocks.academicLevelFindUnique.mockResolvedValue({ slug: "elementary" });
    await expect(isFinancialE2EExceptionAllowed({ actorUserId: ACTOR_ID, customerPriceQuoteId: QUOTE_ID })).resolves.toBe(false);
  });

  it("academic level != elementary -> false", async () => {
    setValidEnv();
    mocks.customerPriceQuoteFindUnique.mockResolvedValue(validQuote());
    mocks.subjectFindUnique.mockResolvedValue({ slug: "math" });
    mocks.academicLevelFindUnique.mockResolvedValue({ slug: "highSchool" });
    await expect(isFinancialE2EExceptionAllowed({ actorUserId: ACTOR_ID, customerPriceQuoteId: QUOTE_ID })).resolves.toBe(false);
  });

  it("academic level null on the quote -> false (must be exactly Elementary, not wildcard)", async () => {
    setValidEnv();
    mocks.customerPriceQuoteFindUnique.mockResolvedValue(validQuote({ academicLevelId: null }));
    mocks.subjectFindUnique.mockResolvedValue({ slug: "math" });
    await expect(isFinancialE2EExceptionAllowed({ actorUserId: ACTOR_ID, customerPriceQuoteId: QUOTE_ID })).resolves.toBe(false);
  });

  it("duration != 60 -> false", async () => {
    setValidEnv();
    mocks.customerPriceQuoteFindUnique.mockResolvedValue(validQuote({ durationMinutes: 90 }));
    mocks.subjectFindUnique.mockResolvedValue({ slug: "math" });
    mocks.academicLevelFindUnique.mockResolvedValue({ slug: "elementary" });
    await expect(isFinancialE2EExceptionAllowed({ actorUserId: ACTOR_ID, customerPriceQuoteId: QUOTE_ID })).resolves.toBe(false);
  });

  it("mode != ONLINE -> false", async () => {
    setValidEnv();
    mocks.customerPriceQuoteFindUnique.mockResolvedValue(validQuote({ tutoringMode: "IN_PERSON" }));
    mocks.subjectFindUnique.mockResolvedValue({ slug: "math" });
    mocks.academicLevelFindUnique.mockResolvedValue({ slug: "elementary" });
    await expect(isFinancialE2EExceptionAllowed({ actorUserId: ACTOR_ID, customerPriceQuoteId: QUOTE_ID })).resolves.toBe(false);
  });

  it("customer price != CAD 32.00 -> false (never trusts a client-submitted amount, only the quote's own authoritative totalCents)", async () => {
    setValidEnv();
    mocks.customerPriceQuoteFindUnique.mockResolvedValue(validQuote({ totalCents: 4000 }));
    mocks.subjectFindUnique.mockResolvedValue({ slug: "math" });
    mocks.academicLevelFindUnique.mockResolvedValue({ slug: "elementary" });
    await expect(isFinancialE2EExceptionAllowed({ actorUserId: ACTOR_ID, customerPriceQuoteId: QUOTE_ID })).resolves.toBe(false);
  });

  it("tutor payout != CAD 22.00 -> false", async () => {
    setValidEnv();
    mocks.customerPriceQuoteFindUnique.mockResolvedValue(validQuote());
    mocks.subjectFindUnique.mockResolvedValue({ slug: "math" });
    mocks.academicLevelFindUnique.mockResolvedValue({ slug: "elementary" });
    mocks.tutorPayoutQuoteFindFirst.mockResolvedValue({ tutorProfileId: TUTOR_ID, totalPayoutCents: 1800, currency: "CAD" });
    await expect(isFinancialE2EExceptionAllowed({ actorUserId: ACTOR_ID, customerPriceQuoteId: QUOTE_ID })).resolves.toBe(false);
  });

  it("quote not found -> false", async () => {
    setValidEnv();
    mocks.customerPriceQuoteFindUnique.mockResolvedValue(null);
    await expect(isFinancialE2EExceptionAllowed({ actorUserId: ACTOR_ID, customerPriceQuoteId: QUOTE_ID })).resolves.toBe(false);
  });

  it("quote status not ACTIVE -> false", async () => {
    setValidEnv();
    mocks.customerPriceQuoteFindUnique.mockResolvedValue(validQuote({ status: "CONSUMED" }));
    await expect(isFinancialE2EExceptionAllowed({ actorUserId: ACTOR_ID, customerPriceQuoteId: QUOTE_ID })).resolves.toBe(false);
  });

  it("no ACTIVE TutorPayoutQuote linked to this customer quote -> false", async () => {
    setValidEnv();
    mocks.customerPriceQuoteFindUnique.mockResolvedValue(validQuote());
    mocks.subjectFindUnique.mockResolvedValue({ slug: "math" });
    mocks.academicLevelFindUnique.mockResolvedValue({ slug: "elementary" });
    mocks.tutorPayoutQuoteFindFirst.mockResolvedValue(null);
    await expect(isFinancialE2EExceptionAllowed({ actorUserId: ACTOR_ID, customerPriceQuoteId: QUOTE_ID })).resolves.toBe(false);
  });

  it("one-scenario boundary: a Booking already exists for the controlled tutor -> false", async () => {
    setValidEnv();
    mockFullyValidScenario();
    mocks.bookingFindFirst.mockResolvedValue({ id: "already-booked" });
    await expect(isFinancialE2EExceptionAllowed({ actorUserId: ACTOR_ID, customerPriceQuoteId: QUOTE_ID })).resolves.toBe(false);
  });
});

describe("auditFinancialE2EExceptionUsed", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes exactly one AuditLog row with only safe, non-financial-secret metadata", async () => {
    await auditFinancialE2EExceptionUsed({ actorUserId: ACTOR_ID, tutorProfileId: TUTOR_ID });
    expect(mocks.writeAuditLog).toHaveBeenCalledTimes(1);
    const call = mocks.writeAuditLog.mock.calls[0][0];
    expect(call.action).toBe("financial_e2e_exception_used");
    expect(call.actorUserId).toBe(ACTOR_ID);
    expect(call.entityId).toBe(TUTOR_ID);
    expect(JSON.stringify(call.metadata)).not.toMatch(/card|cvc|bank|secret|whsec_|sk_live_/i);
  });
});
