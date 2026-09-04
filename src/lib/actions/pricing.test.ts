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
  closedBetaOnlineOnlyActive: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/closedBetaConfig", () => ({
  closedBetaOnlineOnlyActive: mocks.closedBetaOnlineOnlyActive,
}));
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
    mocks.closedBetaOnlineOnlyActive.mockReturnValue(false);
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

// PROD-DIRECT-BOOKING-MODEFIX1 — createPriceQuoteAction's own mode
// resolution/enforcement, independent of the pure resolveRequestedTutoringMode
// unit tests (tutoringModeResolution.test.ts) and of createBookingAction's
// own independent re-check (bookings.mode.test.ts).
describe("createPriceQuoteAction — PROD-DIRECT-BOOKING-MODEFIX1 mode resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user-1", role: "STUDENT" } });
    mocks.dbStudentProfileFindUnique.mockResolvedValue({ id: "student-1" });
    mocks.canInitiatePaidBooking.mockResolvedValue(true);
    mocks.closedBetaOnlineOnlyActive.mockReturnValue(false);
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

  it("A. ONLINE-capability tutor, no requested mode -> quote generated with tutoringMode ONLINE", async () => {
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", learningMode: "ONLINE" });
    const result = await createPriceQuoteAction(baseInput());
    expect(result.success).toBe(true);
    expect(mocks.createCustomerPriceQuote).toHaveBeenCalledWith(expect.objectContaining({ tutoringMode: "ONLINE" }));
    expect(mocks.createTutorPayoutQuote).toHaveBeenCalledWith(
      expect.objectContaining({ tutoringMode: "ONLINE" }),
      "quote-1"
    );
  });

  it("B. BOTH-capability tutor, requested ONLINE -> quote generated with tutoringMode ONLINE (never BOTH)", async () => {
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", learningMode: "BOTH" });
    const result = await createPriceQuoteAction(baseInput({ tutoringMode: "ONLINE" }));
    expect(result.success).toBe(true);
    expect(mocks.createCustomerPriceQuote).toHaveBeenCalledWith(expect.objectContaining({ tutoringMode: "ONLINE" }));
  });

  it("C. BOTH-capability tutor, requested IN_PERSON -> rejected before any quote is created (direct booking has no address support yet)", async () => {
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", learningMode: "BOTH" });
    const result = await createPriceQuoteAction(baseInput({ tutoringMode: "IN_PERSON" }));
    expect(result).toMatchObject({ success: false, error: "directInPersonUnavailable" });
    expect(mocks.createCustomerPriceQuote).not.toHaveBeenCalled();
  });

  it("D. BOTH-capability tutor, missing requested mode -> rejected, never silently inferred", async () => {
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", learningMode: "BOTH" });
    const result = await createPriceQuoteAction(baseInput({ tutoringMode: undefined }));
    expect(result).toMatchObject({ success: false, error: "invalidInput" });
    expect(mocks.createCustomerPriceQuote).not.toHaveBeenCalled();
  });

  it("E. requested tutoringMode='BOTH' is rejected by schema validation itself, before any DB read", async () => {
    const result = await createPriceQuoteAction(baseInput({ tutoringMode: "BOTH" as never }));
    expect(result).toMatchObject({ success: false, error: "invalidInput" });
    expect(mocks.dbTutorProfileFindUnique).not.toHaveBeenCalled();
    expect(mocks.createCustomerPriceQuote).not.toHaveBeenCalled();
  });

  it("F. ONLINE-capability tutor, requested IN_PERSON -> rejected (not a legal subset of capability)", async () => {
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", learningMode: "ONLINE" });
    const result = await createPriceQuoteAction(baseInput({ tutoringMode: "IN_PERSON" }));
    expect(result).toMatchObject({ success: false, error: "invalidInput" });
    expect(mocks.createCustomerPriceQuote).not.toHaveBeenCalled();
  });

  it("G. IN_PERSON-capability tutor, requested ONLINE -> rejected (not a legal subset of capability)", async () => {
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", learningMode: "IN_PERSON" });
    const result = await createPriceQuoteAction(baseInput({ tutoringMode: "ONLINE" }));
    expect(result).toMatchObject({ success: false, error: "invalidInput" });
    expect(mocks.createCustomerPriceQuote).not.toHaveBeenCalled();
  });

  it("I. IN_PERSON-capability tutor, deterministic missing mode -> also rejected (direct booking never supports IN_PERSON today)", async () => {
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", learningMode: "IN_PERSON" });
    const result = await createPriceQuoteAction(baseInput({ tutoringMode: undefined }));
    expect(result).toMatchObject({ success: false, error: "directInPersonUnavailable" });
  });

  it("H. Closed Beta active + resolved ONLINE -> passes the online-only product gate (reaches quote generation)", async () => {
    mocks.closedBetaOnlineOnlyActive.mockReturnValue(true);
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", learningMode: "ONLINE" });
    const result = await createPriceQuoteAction(baseInput());
    expect(result.success).toBe(true);
    expect(mocks.createCustomerPriceQuote).toHaveBeenCalled();
  });

  it("L. Controlled scenario — BOTH-capability tutor, requested ONLINE, resolves to tutoringMode ONLINE for both quote calls", async () => {
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "matthew-allen", learningMode: "BOTH" });
    const result = await createPriceQuoteAction(
      baseInput({ tutorProfileId: "matthew-allen", tutoringMode: "ONLINE", academicLevelId: "elementary-level" })
    );
    expect(result.success).toBe(true);
    expect(mocks.createCustomerPriceQuote).toHaveBeenCalledWith(expect.objectContaining({ tutoringMode: "ONLINE" }));
    expect(mocks.createTutorPayoutQuote).toHaveBeenCalledWith(
      expect.objectContaining({ tutoringMode: "ONLINE" }),
      "quote-1"
    );
  });
});
