import { beforeEach, describe, expect, it, vi } from "vitest";

// BETA-PRICINGFIX1 — permanent regression coverage for createPriceQuoteAction's
// (Direct Booking) server-side academic-level guard: a request with a
// missing/blank academicLevelId must be rejected by Zod validation BEFORE
// any authorization check, database read, or quote-generation call — the
// server-authoritative backstop behind the UI's own quoteKey gating (see
// FutureTutor_BETA_PRICINGGAP_AUDIT1_REPORT.md /
// FutureTutor_BETA_PRICINGFIX1_REPORT.md). Does not re-test the pricing
// engine itself (see customerPricing's own coverage) or the beta financial
// gate (see betaFinancialGate.test.ts) — scoped narrowly to this one guard.

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  dbStudentProfileFindUnique: vi.fn(),
  dbTutorProfileFindUnique: vi.fn(),
  canInitiatePaidBooking: vi.fn(),
  createCustomerPriceQuote: vi.fn(),
  createTutorPayoutQuote: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  db: {
    studentProfile: { findUnique: mocks.dbStudentProfileFindUnique },
    tutorProfile: { findUnique: mocks.dbTutorProfileFindUnique },
  },
}));
vi.mock("@/services/studentAuthorization", () => ({
  canInitiatePaidBooking: mocks.canInitiatePaidBooking,
}));
vi.mock("@/services/customerPricing", () => ({
  createCustomerPriceQuote: mocks.createCustomerPriceQuote,
  PricingRuleNotFoundError: class PricingRuleNotFoundError extends Error {},
}));
vi.mock("@/services/tutorPayout", () => ({
  createTutorPayoutQuote: mocks.createTutorPayoutQuote,
  TutorPayoutRuleNotFoundError: class TutorPayoutRuleNotFoundError extends Error {},
  NegativeSpreadError: class NegativeSpreadError extends Error {},
}));

import { createPriceQuoteAction } from "./pricing";

function baseInput(overrides: Partial<Parameters<typeof createPriceQuoteAction>[0]> = {}) {
  return {
    studentProfileId: "student-1",
    tutorProfileId: "tutor-1",
    subjectId: "subject-1",
    academicLevelId: "level-1",
    startAt: new Date(Date.now() + 3600_000).toISOString(),
    ...overrides,
  };
}

describe("createPriceQuoteAction — BETA-PRICINGFIX1 academic-level guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user-1", role: "STUDENT" } });
    mocks.dbStudentProfileFindUnique.mockResolvedValue({ id: "student-1" });
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", learningMode: "ONLINE" });
    mocks.canInitiatePaidBooking.mockResolvedValue(true);
    mocks.createCustomerPriceQuote.mockResolvedValue({
      id: "quote-1",
      basePriceCents: 3200,
      breakdown: [],
      subtotalCents: 3200,
      taxCents: 0,
      taxConfigured: false,
      totalCents: 3200,
      currency: "CAD",
      expiresAt: new Date(),
    });
    mocks.createTutorPayoutQuote.mockResolvedValue({ id: "payout-quote-1" });
  });

  it("rejects a missing academicLevelId before any DB read or quote generation", async () => {
    const result = await createPriceQuoteAction(baseInput({ academicLevelId: undefined }));
    expect(result).toMatchObject({ success: false, error: "invalidInput" });
    expect(mocks.dbStudentProfileFindUnique).not.toHaveBeenCalled();
    expect(mocks.createCustomerPriceQuote).not.toHaveBeenCalled();
    expect(mocks.createTutorPayoutQuote).not.toHaveBeenCalled();
  });

  it("rejects a blank-string academicLevelId before any DB read or quote generation", async () => {
    const result = await createPriceQuoteAction(baseInput({ academicLevelId: "" }));
    expect(result).toMatchObject({ success: false, error: "invalidInput" });
    expect(mocks.createCustomerPriceQuote).not.toHaveBeenCalled();
  });

  it("proceeds to quote generation once a real, non-empty academicLevelId is supplied", async () => {
    const result = await createPriceQuoteAction(baseInput({ academicLevelId: "level-1" }));
    expect(result.success).toBe(true);
    expect(mocks.createCustomerPriceQuote).toHaveBeenCalledWith(
      expect.objectContaining({ academicLevelId: "level-1" })
    );
    expect(mocks.createTutorPayoutQuote).toHaveBeenCalled();
  });
});
