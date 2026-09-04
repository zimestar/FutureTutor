import { beforeEach, describe, expect, it, vi } from "vitest";

// PROD-DIRECT-BOOKING-MODEFIX1 — permanent regression coverage for
// createBookingAction's independent, defense-in-depth mode
// resolution/enforcement (mirrors pricing.test.ts's coverage of
// createPriceQuoteAction's own identical check — see that file for the
// pure resolveRequestedTutoringMode matrix and Part 5/8's rationale for
// why direct booking rejects IN_PERSON unconditionally, not just during
// Closed Beta). Scoped narrowly to the mode gate itself: every case here
// short-circuits before getAvailableSlots/reservation/payment work, proven
// via mocks that would throw if ever reached.

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  closedBetaFinancialGateActive: vi.fn(),
  closedBetaOnlineOnlyActive: vi.fn(),
  dbStudentProfileFindUnique: vi.fn(),
  dbTutorProfileFindUnique: vi.fn(),
  canInitiatePaidBooking: vi.fn(),
  getAvailableSlots: vi.fn(),
  paymentsUseStripe: vi.fn(),
  financialE2EEnabled: vi.fn(),
  isFinancialE2EExceptionAllowed: vi.fn(),
  auditFinancialE2EExceptionUsed: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/closedBetaConfig", () => ({
  closedBetaFinancialGateActive: mocks.closedBetaFinancialGateActive,
  closedBetaOnlineOnlyActive: mocks.closedBetaOnlineOnlyActive,
}));
vi.mock("@/lib/financialE2EConfig", () => ({
  financialE2EEnabled: mocks.financialE2EEnabled,
  isFinancialE2EExceptionAllowed: mocks.isFinancialE2EExceptionAllowed,
  auditFinancialE2EExceptionUsed: mocks.auditFinancialE2EExceptionUsed,
}));
vi.mock("@/lib/paymentMode", () => ({ paymentsUseStripe: mocks.paymentsUseStripe }));
vi.mock("@/lib/availability", () => ({ getAvailableSlots: mocks.getAvailableSlots }));
vi.mock("@/lib/serializableRetry", () => ({ withSerializableRetry: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    studentProfile: { findUnique: mocks.dbStudentProfileFindUnique },
    tutorProfile: { findUnique: mocks.dbTutorProfileFindUnique },
  },
}));
vi.mock("@/services/studentAuthorization", () => ({
  canInitiatePaidBooking: mocks.canInitiatePaidBooking,
  canPayForStudent: vi.fn(),
}));
vi.mock("@/services/bookingCreation", () => ({
  reserveBookingPendingPayment: vi.fn(),
  SlotTakenError: class SlotTakenError extends Error {},
  NotAuthorizedForLearnerError: class NotAuthorizedForLearnerError extends Error {},
  QuoteLearnerMismatchError: class QuoteLearnerMismatchError extends Error {},
  PaymentReservationMismatchError: class PaymentReservationMismatchError extends Error {},
  PaymentAlreadyAttachedError: class PaymentAlreadyAttachedError extends Error {},
}));
vi.mock("@/services/payments", () => ({
  preparePaymentForQuote: vi.fn(),
  getOrCreatePaymentForQuote: vi.fn(),
  verifyAndAuthorizePaymentIntent: vi.fn(),
  captureAuthorizedPayment: vi.fn(),
  convergeToCaptured: vi.fn(),
  PaymentIntentVerificationError: class PaymentIntentVerificationError extends Error {},
}));
vi.mock("@/services/customerPricing", () => ({
  QuoteNotFoundError: class QuoteNotFoundError extends Error {},
  QuoteNotOwnedError: class QuoteNotOwnedError extends Error {},
  QuoteExpiredError: class QuoteExpiredError extends Error {},
  QuoteAlreadyConsumedError: class QuoteAlreadyConsumedError extends Error {},
  QuoteNotActiveError: class QuoteNotActiveError extends Error {},
  QuoteContextMismatchError: class QuoteContextMismatchError extends Error {},
}));
vi.mock("@/services/tutorPayout", () => ({
  TutorPayoutQuoteNotFoundError: class TutorPayoutQuoteNotFoundError extends Error {},
  TutorPayoutQuoteExpiredError: class TutorPayoutQuoteExpiredError extends Error {},
  TutorPayoutQuoteNotActiveError: class TutorPayoutQuoteNotActiveError extends Error {},
}));
vi.mock("@/services/cancellationAuthorization", () => ({ resolveCancellationAuthority: vi.fn() }));
vi.mock("@/services/cancellationPolicy", () => ({
  cancelBookingWithRefund: vi.fn(),
  BookingNotCancellableError: class BookingNotCancellableError extends Error {},
  NotAuthorizedToCancelError: class NotAuthorizedToCancelError extends Error {},
  SessionAlreadyStartedError: class SessionAlreadyStartedError extends Error {},
  SessionNotCancellableError: class SessionNotCancellableError extends Error {},
}));

import { createBookingAction } from "./bookings";

function formData(overrides: Record<string, string | undefined> = {}) {
  const fd = new FormData();
  fd.set("studentProfileId", "student-1");
  fd.set("tutorProfileId", "tutor-1");
  fd.set("subjectId", "subject-1");
  fd.set("academicLevelId", "level-1");
  fd.set("startAt", new Date(Date.now() + 3600_000).toISOString());
  fd.set("customerPriceQuoteId", "quote-1");
  fd.set("tutorPayoutQuoteId", "payout-quote-1");
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) fd.delete(key);
    else fd.set(key, value);
  }
  return fd;
}

describe("createBookingAction — PROD-DIRECT-BOOKING-MODEFIX1 mode resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user-1", role: "STUDENT" } });
    mocks.closedBetaFinancialGateActive.mockReturnValue(false);
    mocks.closedBetaOnlineOnlyActive.mockReturnValue(false);
    mocks.dbStudentProfileFindUnique.mockResolvedValue({ id: "student-1" });
    mocks.canInitiatePaidBooking.mockResolvedValue(true);
    mocks.financialE2EEnabled.mockReturnValue(false);
    // getAvailableSlots throwing proves control reached past the mode gate
    // — every rejection test below asserts this mock was never called.
    mocks.getAvailableSlots.mockRejectedValue(new Error("reached past the mode gate"));
  });

  it("A. ONLINE-capability tutor, no requested mode -> reaches past the mode gate", async () => {
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", learningMode: "ONLINE", tutorAgreementAcceptedAt: new Date() });
    await expect(createBookingAction(undefined, formData())).rejects.toThrow("reached past the mode gate");
  });

  it("B. BOTH-capability tutor, requested ONLINE -> reaches past the mode gate", async () => {
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", learningMode: "BOTH", tutorAgreementAcceptedAt: new Date() });
    await expect(
      createBookingAction(undefined, formData({ tutoringMode: "ONLINE" }))
    ).rejects.toThrow("reached past the mode gate");
  });

  it("C. BOTH-capability tutor, requested IN_PERSON -> rejected, never reaches getAvailableSlots", async () => {
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", learningMode: "BOTH", tutorAgreementAcceptedAt: new Date() });
    const result = await createBookingAction(undefined, formData({ tutoringMode: "IN_PERSON" }));
    expect(result).toMatchObject({ error: "directInPersonUnavailable" });
    expect(mocks.getAvailableSlots).not.toHaveBeenCalled();
  });

  it("D. BOTH-capability tutor, missing requested mode -> rejected", async () => {
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", learningMode: "BOTH", tutorAgreementAcceptedAt: new Date() });
    const result = await createBookingAction(undefined, formData({ tutoringMode: undefined }));
    expect(result).toMatchObject({ error: "invalidInput" });
    expect(mocks.getAvailableSlots).not.toHaveBeenCalled();
  });

  it("E. requested tutoringMode='BOTH' rejected by schema validation, before any DB read", async () => {
    const result = await createBookingAction(undefined, formData({ tutoringMode: "BOTH" }));
    expect(result).toMatchObject({ error: "invalidInput" });
    expect(mocks.dbTutorProfileFindUnique).not.toHaveBeenCalled();
  });

  it("F. ONLINE-capability tutor, requested IN_PERSON -> rejected", async () => {
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", learningMode: "ONLINE", tutorAgreementAcceptedAt: new Date() });
    const result = await createBookingAction(undefined, formData({ tutoringMode: "IN_PERSON" }));
    expect(result).toMatchObject({ error: "invalidInput" });
    expect(mocks.getAvailableSlots).not.toHaveBeenCalled();
  });

  it("G. IN_PERSON-capability tutor, requested ONLINE -> rejected", async () => {
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", learningMode: "IN_PERSON", tutorAgreementAcceptedAt: new Date() });
    const result = await createBookingAction(undefined, formData({ tutoringMode: "ONLINE" }));
    expect(result).toMatchObject({ error: "invalidInput" });
    expect(mocks.getAvailableSlots).not.toHaveBeenCalled();
  });

  it("I. IN_PERSON-capability tutor, deterministic missing mode -> also rejected (direct booking never supports IN_PERSON today)", async () => {
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", learningMode: "IN_PERSON", tutorAgreementAcceptedAt: new Date() });
    const result = await createBookingAction(undefined, formData({ tutoringMode: undefined }));
    expect(result).toMatchObject({ error: "directInPersonUnavailable" });
  });

  it("H. Closed Beta active + resolved ONLINE -> passes the online-only product gate (reaches past the mode gate)", async () => {
    mocks.closedBetaOnlineOnlyActive.mockReturnValue(true);
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", learningMode: "ONLINE", tutorAgreementAcceptedAt: new Date() });
    await expect(createBookingAction(undefined, formData())).rejects.toThrow("reached past the mode gate");
  });

  it("J. Closed Beta active + BOTH raw value -> rejected by schema before the online-only check is ever reached", async () => {
    mocks.closedBetaOnlineOnlyActive.mockReturnValue(true);
    const result = await createBookingAction(undefined, formData({ tutoringMode: "BOTH" }));
    expect(result).toMatchObject({ error: "invalidInput" });
  });

  // PROD-DIRECT-BOOKING-MODEFIX2 — the two combined scenarios the mission
  // explicitly asked to see spelled out, on top of the matrix above.
  it("IN_PERSON during Closed Beta -> rejected (both the permanent direct-IN_PERSON block and the online-only invariant would independently reject it)", async () => {
    mocks.closedBetaOnlineOnlyActive.mockReturnValue(true);
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", learningMode: "BOTH", tutorAgreementAcceptedAt: new Date() });
    const result = await createBookingAction(undefined, formData({ tutoringMode: "IN_PERSON" }));
    expect(result).toMatchObject({ error: "directInPersonUnavailable" });
    expect(mocks.getAvailableSlots).not.toHaveBeenCalled();
  });

  it("ONLINE during Closed Beta + a valid, matching financial E2E exception -> passes both the E2E gate and the mode gate", async () => {
    mocks.closedBetaFinancialGateActive.mockReturnValue(true);
    mocks.closedBetaOnlineOnlyActive.mockReturnValue(true);
    mocks.financialE2EEnabled.mockReturnValue(true);
    mocks.isFinancialE2EExceptionAllowed.mockResolvedValue(true);
    mocks.auth.mockResolvedValue({ user: { id: "controlled-actor", role: "STUDENT" } });
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", learningMode: "BOTH", tutorAgreementAcceptedAt: new Date() });
    await expect(
      createBookingAction(undefined, formData({ tutoringMode: "ONLINE" }))
    ).rejects.toThrow("reached past the mode gate");
    expect(mocks.isFinancialE2EExceptionAllowed).toHaveBeenCalledWith({ actorUserId: "controlled-actor", customerPriceQuoteId: "quote-1" });
    expect(mocks.auditFinancialE2EExceptionUsed).toHaveBeenCalledTimes(1);
  });
});
