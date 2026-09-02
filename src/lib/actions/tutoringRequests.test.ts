import { beforeEach, describe, expect, it, vi } from "vitest";

// BETA-PRICINGFIX1 — permanent regression coverage for
// createTutoringRequestAction's (Quick Match) server-side academic-level
// guard: a request with a missing/blank academicLevelId must be rejected by
// Zod validation BEFORE any authorization check, database read, or
// quote-generation call — the server-authoritative backstop behind the
// form's own `required` <select> (see
// FutureTutor_BETA_PRICINGGAP_AUDIT1_REPORT.md /
// FutureTutor_BETA_PRICINGFIX1_REPORT.md). Does not re-test the Closed
// Beta online-only gate (see betaFinancialGate.test.ts) or the pricing
// engine itself — scoped narrowly to this one guard.

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  closedBetaOnlineOnlyActive: vi.fn(),
  dbStudentProfileFindUnique: vi.fn(),
  canInitiatePaidBooking: vi.fn(),
  createCustomerPriceQuote: vi.fn(),
  createTutoringRequestForLearnerInOwnTransaction: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/closedBetaConfig", () => ({
  closedBetaOnlineOnlyActive: mocks.closedBetaOnlineOnlyActive,
  closedBetaFinancialGateActive: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/db", () => ({
  db: { studentProfile: { findUnique: mocks.dbStudentProfileFindUnique } },
}));
vi.mock("@/services/studentAuthorization", () => ({
  canInitiatePaidBooking: mocks.canInitiatePaidBooking,
  canPayForStudent: vi.fn(),
}));
vi.mock("@/services/customerPricing", () => ({
  createCustomerPriceQuote: mocks.createCustomerPriceQuote,
  lockCustomerPriceQuote: vi.fn(),
  cancelActiveCustomerPriceQuote: vi.fn(),
  PricingRuleNotFoundError: class PricingRuleNotFoundError extends Error {},
}));
vi.mock("@/services/payments", () => ({
  preparePaymentForQuote: vi.fn(),
  getOrCreatePaymentForQuote: vi.fn(),
  ensureStripePaymentIntent: vi.fn(),
  verifyAndAuthorizePaymentIntent: vi.fn(),
  PaymentIntentVerificationError: class PaymentIntentVerificationError extends Error {},
}));
vi.mock("@/services/quickMatchDispatch", () => ({
  advanceDispatch: vi.fn(),
  closeTutoringRequest: vi.fn(),
}));
vi.mock("@/services/tutoringRequestCreation", () => ({
  createTutoringRequestForLearnerInOwnTransaction: mocks.createTutoringRequestForLearnerInOwnTransaction,
  NotAuthorizedForLearnerError: class NotAuthorizedForLearnerError extends Error {},
  ActiveTutoringRequestExistsError: class ActiveTutoringRequestExistsError extends Error {},
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/paymentMode", () => ({ paymentsUseStripe: vi.fn().mockReturnValue(true) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/adminPermissions", () => ({ requireAdminPermission: vi.fn() }));

import { createTutoringRequestAction } from "./tutoringRequests";

function requestFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  const fields: Record<string, string> = {
    studentProfileId: "student-1",
    subjectId: "subject-1",
    academicLevelId: "level-1",
    tutoringMode: "ONLINE",
    durationMinutes: "60",
    requestedStartAt: new Date(Date.now() + 3600_000).toISOString(),
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("createTutoringRequestAction — BETA-PRICINGFIX1 academic-level guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user-1", role: "STUDENT" } });
    mocks.closedBetaOnlineOnlyActive.mockReturnValue(false);
    mocks.dbStudentProfileFindUnique.mockResolvedValue({ id: "student-1" });
    mocks.canInitiatePaidBooking.mockResolvedValue(true);
    mocks.createCustomerPriceQuote.mockResolvedValue({
      id: "quote-1",
      currency: "CAD",
      basePriceCents: 3200,
      subtotalCents: 3200,
      taxCents: 0,
      totalCents: 3200,
      expiresAt: new Date(),
    });
    mocks.createTutoringRequestForLearnerInOwnTransaction.mockResolvedValue({ id: "request-1" });
  });

  it("rejects a request with no academicLevelId field at all, before any DB read or quote generation", async () => {
    const fd = requestFormData();
    fd.delete("academicLevelId");
    const result = await createTutoringRequestAction(undefined, fd);
    expect(result).toMatchObject({ success: false, error: "invalidInput" });
    expect(mocks.dbStudentProfileFindUnique).not.toHaveBeenCalled();
    expect(mocks.createCustomerPriceQuote).not.toHaveBeenCalled();
    expect(mocks.createTutoringRequestForLearnerInOwnTransaction).not.toHaveBeenCalled();
  });

  it("rejects a blank-string academicLevelId, before any DB read or quote generation", async () => {
    const fd = requestFormData({ academicLevelId: "" });
    const result = await createTutoringRequestAction(undefined, fd);
    expect(result).toMatchObject({ success: false, error: "invalidInput" });
    expect(mocks.createCustomerPriceQuote).not.toHaveBeenCalled();
  });

  it("proceeds to quote generation once a real, non-empty academicLevelId is supplied", async () => {
    const fd = requestFormData({ academicLevelId: "level-1" });
    const result = await createTutoringRequestAction(undefined, fd);
    expect(result).toMatchObject({ success: true, tutoringRequestId: "request-1" });
    expect(mocks.createCustomerPriceQuote).toHaveBeenCalledWith(
      expect.objectContaining({ academicLevelId: "level-1" })
    );
  });
});
