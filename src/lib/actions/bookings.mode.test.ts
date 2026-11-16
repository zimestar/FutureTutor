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
  TutorNotBookableError: class TutorNotBookableError extends Error {},
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
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", applicationStatus: "APPROVED", user: { deactivatedAt: null }, learningMode: "ONLINE", tutorAgreementAcceptedAt: new Date() });
    await expect(createBookingAction(undefined, formData())).rejects.toThrow("reached past the mode gate");
  });

  it("B. BOTH-capability tutor, requested ONLINE -> reaches past the mode gate", async () => {
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", applicationStatus: "APPROVED", user: { deactivatedAt: null }, learningMode: "BOTH", tutorAgreementAcceptedAt: new Date() });
    await expect(
      createBookingAction(undefined, formData({ tutoringMode: "ONLINE" }))
    ).rejects.toThrow("reached past the mode gate");
  });

  it("C. BOTH-capability tutor, requested IN_PERSON -> rejected, never reaches getAvailableSlots", async () => {
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", applicationStatus: "APPROVED", user: { deactivatedAt: null }, learningMode: "BOTH", tutorAgreementAcceptedAt: new Date() });
    const result = await createBookingAction(undefined, formData({ tutoringMode: "IN_PERSON" }));
    expect(result).toMatchObject({ error: "directInPersonUnavailable" });
    expect(mocks.getAvailableSlots).not.toHaveBeenCalled();
  });

  it("D. BOTH-capability tutor, missing requested mode -> rejected", async () => {
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", applicationStatus: "APPROVED", user: { deactivatedAt: null }, learningMode: "BOTH", tutorAgreementAcceptedAt: new Date() });
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
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", applicationStatus: "APPROVED", user: { deactivatedAt: null }, learningMode: "ONLINE", tutorAgreementAcceptedAt: new Date() });
    const result = await createBookingAction(undefined, formData({ tutoringMode: "IN_PERSON" }));
    expect(result).toMatchObject({ error: "invalidInput" });
    expect(mocks.getAvailableSlots).not.toHaveBeenCalled();
  });

  it("G. IN_PERSON-capability tutor, requested ONLINE -> rejected", async () => {
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", applicationStatus: "APPROVED", user: { deactivatedAt: null }, learningMode: "IN_PERSON", tutorAgreementAcceptedAt: new Date() });
    const result = await createBookingAction(undefined, formData({ tutoringMode: "ONLINE" }));
    expect(result).toMatchObject({ error: "invalidInput" });
    expect(mocks.getAvailableSlots).not.toHaveBeenCalled();
  });

  it("I. IN_PERSON-capability tutor, deterministic missing mode -> also rejected (direct booking never supports IN_PERSON today)", async () => {
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", applicationStatus: "APPROVED", user: { deactivatedAt: null }, learningMode: "IN_PERSON", tutorAgreementAcceptedAt: new Date() });
    const result = await createBookingAction(undefined, formData({ tutoringMode: undefined }));
    expect(result).toMatchObject({ error: "directInPersonUnavailable" });
  });

  it("H. Closed Beta active + resolved ONLINE -> passes the online-only product gate (reaches past the mode gate)", async () => {
    mocks.closedBetaOnlineOnlyActive.mockReturnValue(true);
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", applicationStatus: "APPROVED", user: { deactivatedAt: null }, learningMode: "ONLINE", tutorAgreementAcceptedAt: new Date() });
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
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", applicationStatus: "APPROVED", user: { deactivatedAt: null }, learningMode: "BOTH", tutorAgreementAcceptedAt: new Date() });
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
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", applicationStatus: "APPROVED", user: { deactivatedAt: null }, learningMode: "BOTH", tutorAgreementAcceptedAt: new Date() });
    await expect(
      createBookingAction(undefined, formData({ tutoringMode: "ONLINE" }))
    ).rejects.toThrow("reached past the mode gate");
    expect(mocks.isFinancialE2EExceptionAllowed).toHaveBeenCalledWith({ actorUserId: "controlled-actor", customerPriceQuoteId: "quote-1" });
    expect(mocks.auditFinancialE2EExceptionUsed).toHaveBeenCalledTimes(1);
  });
});

// RW-01 — createBookingAction independently refuses every non-APPROVED
// TutorApplicationStatus, before mode resolution, slot validation, payment
// preparation/verification, or the reservation transaction. Every fixture has
// tutorAgreementAcceptedAt set, proving it is never a substitute for approval.
describe("createBookingAction — RW-01 tutor approval enforcement", () => {
  const NON_APPROVED_STATUSES = [
    "DRAFT",
    "SUBMITTED",
    "UNDER_REVIEW",
    "INTERVIEW_REQUIRED",
    "INTERVIEW_COMPLETED",
    "TRAINING_REQUIRED",
    "TRAINING_COMPLETED",
    "EXAM_REQUIRED",
    "EXAM_COMPLETED",
    "FINAL_REVIEW",
    "REJECTED",
    "SUSPENDED",
  ] as const;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user-1", role: "STUDENT" } });
    mocks.closedBetaFinancialGateActive.mockReturnValue(false);
    mocks.closedBetaOnlineOnlyActive.mockReturnValue(false);
    mocks.dbStudentProfileFindUnique.mockResolvedValue({ id: "student-1" });
    mocks.canInitiatePaidBooking.mockResolvedValue(true);
    mocks.financialE2EEnabled.mockReturnValue(false);
    mocks.paymentsUseStripe.mockReturnValue(true);
    mocks.getAvailableSlots.mockRejectedValue(new Error("reached past the approval gate"));
  });

  async function expectNothingDownstreamCalled() {
    const payments = await import("@/services/payments");
    const bookingCreation = await import("@/services/bookingCreation");
    const { withSerializableRetry } = await import("@/lib/serializableRetry");
    expect(mocks.canInitiatePaidBooking).not.toHaveBeenCalled();
    expect(mocks.getAvailableSlots).not.toHaveBeenCalled();
    expect(payments.getOrCreatePaymentForQuote).not.toHaveBeenCalled();
    expect(payments.preparePaymentForQuote).not.toHaveBeenCalled();
    expect(payments.verifyAndAuthorizePaymentIntent).not.toHaveBeenCalled();
    expect(payments.captureAuthorizedPayment).not.toHaveBeenCalled();
    expect(payments.convergeToCaptured).not.toHaveBeenCalled();
    expect(withSerializableRetry).not.toHaveBeenCalled();
    expect(bookingCreation.reserveBookingPendingPayment).not.toHaveBeenCalled();
  }

  it.each(NON_APPROVED_STATUSES)(
    "applicationStatus=%s (agreement accepted) -> tutorUnavailable, no payment or reservation work",
    async (applicationStatus) => {
      mocks.dbTutorProfileFindUnique.mockResolvedValue({
        id: "tutor-1",
        applicationStatus,
        user: { deactivatedAt: null },
        learningMode: "ONLINE",
        tutorAgreementAcceptedAt: new Date(),
      });
      const result = await createBookingAction(undefined, formData({ stripePaymentIntentId: "pi_test_1" }));
      expect(result).toEqual({ error: "tutorUnavailable" });
      await expectNothingDownstreamCalled();
    }
  );

  it("missing applicationStatus is treated as not approved (fails closed)", async () => {
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", learningMode: "ONLINE", tutorAgreementAcceptedAt: new Date() });
    const result = await createBookingAction(undefined, formData());
    expect(result).toEqual({ error: "tutorUnavailable" });
    await expectNothingDownstreamCalled();
  });

  it("non-approved tutor is refused even through a valid financial E2E exception during Closed Beta", async () => {
    mocks.closedBetaFinancialGateActive.mockReturnValue(true);
    mocks.financialE2EEnabled.mockReturnValue(true);
    mocks.isFinancialE2EExceptionAllowed.mockResolvedValue(true);
    mocks.dbTutorProfileFindUnique.mockResolvedValue({
      id: "tutor-1",
      applicationStatus: "SUSPENDED",
      user: { deactivatedAt: null },
      learningMode: "ONLINE",
      tutorAgreementAcceptedAt: new Date(),
    });
    const result = await createBookingAction(undefined, formData());
    expect(result).toEqual({ error: "tutorUnavailable" });
    await expectNothingDownstreamCalled();
  });

  it("APPROVED -> unchanged: passes the approval gate and reaches slot validation", async () => {
    mocks.dbTutorProfileFindUnique.mockResolvedValue({
      id: "tutor-1",
      applicationStatus: "APPROVED",
      user: { deactivatedAt: null },
      learningMode: "ONLINE",
      tutorAgreementAcceptedAt: new Date(),
    });
    await expect(createBookingAction(undefined, formData())).rejects.toThrow("reached past the approval gate");
    expect(mocks.canInitiatePaidBooking).toHaveBeenCalled();
  });

  it("APPROVED but agreement not accepted -> still refused by the existing FG-LEGAL2 gate (unchanged)", async () => {
    mocks.dbTutorProfileFindUnique.mockResolvedValue({
      id: "tutor-1",
      applicationStatus: "APPROVED",
      user: { deactivatedAt: null },
      learningMode: "ONLINE",
      tutorAgreementAcceptedAt: null,
    });
    const result = await createBookingAction(undefined, formData());
    expect(result).toEqual({ error: "tutorUnavailable" });
    expect(mocks.getAvailableSlots).not.toHaveBeenCalled();
  });

  it("enum coverage: the test list is exactly every non-APPROVED TutorApplicationStatus", async () => {
    const { TutorApplicationStatus } = await import("@/generated/prisma/enums");
    const nonApproved = Object.values(TutorApplicationStatus).filter((s) => s !== "APPROVED").sort();
    expect([...NON_APPROVED_STATUSES].sort()).toEqual(nonApproved);
  });
});

// RW-03 — the shared bookability rule at the booking boundary, plus the
// mapping of the reservation's own row-locked refusal (TutorNotBookableError,
// thrown inside the Serializable transaction when the tutor was suspended or
// deactivated after the action-level check passed).
describe("createBookingAction — RW-03 tutor account deactivation and in-transaction refusal", () => {
  const START_AT = new Date(Date.now() + 3 * 24 * 3600_000);
  START_AT.setUTCMinutes(0, 0, 0);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user-1", role: "STUDENT" } });
    mocks.closedBetaFinancialGateActive.mockReturnValue(false);
    mocks.closedBetaOnlineOnlyActive.mockReturnValue(false);
    mocks.dbStudentProfileFindUnique.mockResolvedValue({ id: "student-1" });
    mocks.canInitiatePaidBooking.mockResolvedValue(true);
    mocks.financialE2EEnabled.mockReturnValue(false);
    mocks.paymentsUseStripe.mockReturnValue(false);
    mocks.getAvailableSlots.mockResolvedValue({ timezone: "UTC", days: [{ slots: [{ startAt: START_AT }] }] });
  });

  it("APPROVED tutor with a deactivated User account -> tutorUnavailable before any slot/payment/reservation work", async () => {
    mocks.dbTutorProfileFindUnique.mockResolvedValue({
      id: "tutor-1",
      applicationStatus: "APPROVED",
      user: { deactivatedAt: new Date() },
      learningMode: "ONLINE",
      tutorAgreementAcceptedAt: new Date(),
    });
    const result = await createBookingAction(undefined, formData({ startAt: START_AT.toISOString() }));
    expect(result).toEqual({ error: "tutorUnavailable" });
    const payments = await import("@/services/payments");
    const { withSerializableRetry } = await import("@/lib/serializableRetry");
    expect(mocks.getAvailableSlots).not.toHaveBeenCalled();
    expect(payments.preparePaymentForQuote).not.toHaveBeenCalled();
    expect(withSerializableRetry).not.toHaveBeenCalled();
  });

  it("reservation throws TutorNotBookableError (suspended mid-flight) -> tutorUnavailable, never captured or converged", async () => {
    mocks.dbTutorProfileFindUnique.mockResolvedValue({
      id: "tutor-1",
      applicationStatus: "APPROVED",
      user: { deactivatedAt: null },
      learningMode: "ONLINE",
      tutorAgreementAcceptedAt: new Date(),
    });
    const payments = await import("@/services/payments");
    const bookingCreation = await import("@/services/bookingCreation");
    const { withSerializableRetry } = await import("@/lib/serializableRetry");
    vi.mocked(payments.preparePaymentForQuote).mockResolvedValue({ id: "payment-1" } as never);
    vi.mocked(withSerializableRetry).mockRejectedValue(new bookingCreation.TutorNotBookableError());

    const result = await createBookingAction(undefined, formData({ startAt: START_AT.toISOString() }));

    expect(result).toEqual({ error: "tutorUnavailable" });
    expect(withSerializableRetry).toHaveBeenCalledTimes(1);
    expect(payments.captureAuthorizedPayment).not.toHaveBeenCalled();
    expect(payments.convergeToCaptured).not.toHaveBeenCalled();
  });

  it("loads the tutor's own User.deactivatedAt alongside the profile", async () => {
    mocks.dbTutorProfileFindUnique.mockResolvedValue({
      id: "tutor-1",
      applicationStatus: "APPROVED",
      user: { deactivatedAt: null },
      learningMode: "ONLINE",
      tutorAgreementAcceptedAt: new Date(),
    });
    mocks.getAvailableSlots.mockRejectedValue(new Error("reached slot validation"));
    await expect(createBookingAction(undefined, formData())).rejects.toThrow("reached slot validation");
    expect(mocks.dbTutorProfileFindUnique).toHaveBeenCalledWith({
      where: { id: "tutor-1" },
      include: { user: { select: { deactivatedAt: true } } },
    });
  });
});
