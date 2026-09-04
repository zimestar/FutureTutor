import { beforeEach, describe, expect, it, vi } from "vitest";

// BETA-HARDEN1 — permanent regression coverage for the Closed Beta financial
// gate (src/lib/closedBetaConfig.ts's closedBetaFinancialGateActive()) at
// every Server Action entry point BETA-USER1 identified as able to create a
// real Stripe object or cross the booking/Quick-Match financial boundary:
// preparePaymentForBookingQuoteAction, createBookingAction (Direct Booking),
// preparePaymentForRequestAction, confirmTutoringRequestAction (Quick
// Match). Proves the gate is checked FIRST — before session/authorization
// work, before any DB read, before any downstream service call — so a
// crafted direct call fails closed regardless of who the caller is or what
// they submit.

const mocks = vi.hoisted(() => ({
  closedBetaFinancialGateActive: vi.fn(),
  closedBetaOnlineOnlyActive: vi.fn(),
  auth: vi.fn(),
  paymentsUseStripe: vi.fn(),
  // payments.ts / tutoringRequests.ts / bookings.ts service-layer calls —
  // none of these should ever be reached while the gate is active.
  preparePaymentForQuote: vi.fn(),
  getOrCreatePaymentForQuote: vi.fn(),
  ensureStripePaymentIntent: vi.fn(),
  verifyAndAuthorizePaymentIntent: vi.fn(),
  captureAuthorizedPayment: vi.fn(),
  convergeToCaptured: vi.fn(),
  canPayForStudent: vi.fn(),
  canInitiatePaidBooking: vi.fn(),
  lockCustomerPriceQuote: vi.fn(),
  cancelActiveCustomerPriceQuote: vi.fn(),
  advanceDispatch: vi.fn(),
  closeTutoringRequest: vi.fn(),
  writeAuditLog: vi.fn(),
  getAvailableSlots: vi.fn(),
  withSerializableRetry: vi.fn(),
  reserveBookingPendingPayment: vi.fn(),
  resolveCancellationAuthority: vi.fn(),
  cancelBookingWithRefund: vi.fn(),
  createCustomerPriceQuote: vi.fn(),
  createTutoringRequestForLearnerInOwnTransaction: vi.fn(),
  dbFindUnique: vi.fn(),
  dbTransaction: vi.fn(),
  financialE2EEnabled: vi.fn(),
  isFinancialE2EExceptionAllowed: vi.fn(),
  auditFinancialE2EExceptionUsed: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/paymentMode", () => ({ paymentsUseStripe: mocks.paymentsUseStripe }));
vi.mock("@/lib/closedBetaConfig", () => ({
  closedBetaFinancialGateActive: mocks.closedBetaFinancialGateActive,
  closedBetaOnlineOnlyActive: mocks.closedBetaOnlineOnlyActive,
}));
vi.mock("@/lib/financialE2EConfig", () => ({
  financialE2EEnabled: mocks.financialE2EEnabled,
  isFinancialE2EExceptionAllowed: mocks.isFinancialE2EExceptionAllowed,
  auditFinancialE2EExceptionUsed: mocks.auditFinancialE2EExceptionUsed,
}));
vi.mock("@/lib/db", () => ({
  db: {
    customerPriceQuote: { findUnique: mocks.dbFindUnique },
    tutoringRequest: { findUnique: mocks.dbFindUnique },
    studentProfile: { findUnique: mocks.dbFindUnique },
    tutorProfile: { findUnique: mocks.dbFindUnique },
    payment: { findUnique: mocks.dbFindUnique },
    $transaction: mocks.dbTransaction,
  },
}));
vi.mock("@/lib/serializableRetry", () => ({ withSerializableRetry: mocks.withSerializableRetry }));
vi.mock("@/lib/availability", () => ({ getAvailableSlots: mocks.getAvailableSlots }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("@/services/studentAuthorization", () => ({
  canPayForStudent: mocks.canPayForStudent,
  canInitiatePaidBooking: mocks.canInitiatePaidBooking,
}));
vi.mock("@/services/payments", () => ({
  preparePaymentForQuote: mocks.preparePaymentForQuote,
  getOrCreatePaymentForQuote: mocks.getOrCreatePaymentForQuote,
  ensureStripePaymentIntent: mocks.ensureStripePaymentIntent,
  verifyAndAuthorizePaymentIntent: mocks.verifyAndAuthorizePaymentIntent,
  captureAuthorizedPayment: mocks.captureAuthorizedPayment,
  convergeToCaptured: mocks.convergeToCaptured,
  PaymentIntentVerificationError: class PaymentIntentVerificationError extends Error {},
}));
vi.mock("@/services/customerPricing", () => ({
  createCustomerPriceQuote: mocks.createCustomerPriceQuote,
  lockCustomerPriceQuote: mocks.lockCustomerPriceQuote,
  cancelActiveCustomerPriceQuote: mocks.cancelActiveCustomerPriceQuote,
  PricingRuleNotFoundError: class PricingRuleNotFoundError extends Error {},
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
vi.mock("@/services/quickMatchDispatch", () => ({
  advanceDispatch: mocks.advanceDispatch,
  closeTutoringRequest: mocks.closeTutoringRequest,
}));
vi.mock("@/services/tutoringRequestCreation", () => ({
  createTutoringRequestForLearnerInOwnTransaction: mocks.createTutoringRequestForLearnerInOwnTransaction,
  NotAuthorizedForLearnerError: class NotAuthorizedForLearnerError extends Error {},
  ActiveTutoringRequestExistsError: class ActiveTutoringRequestExistsError extends Error {},
  ACTIVE_TUTORING_REQUEST_STATUSES: ["DRAFT", "PRICED", "MATCHING"],
}));
vi.mock("@/services/bookingCreation", () => ({
  reserveBookingPendingPayment: mocks.reserveBookingPendingPayment,
  SlotTakenError: class SlotTakenError extends Error {},
  NotAuthorizedForLearnerError: class NotAuthorizedForLearnerError extends Error {},
  QuoteLearnerMismatchError: class QuoteLearnerMismatchError extends Error {},
  PaymentReservationMismatchError: class PaymentReservationMismatchError extends Error {},
  PaymentAlreadyAttachedError: class PaymentAlreadyAttachedError extends Error {},
}));
vi.mock("@/services/cancellationAuthorization", () => ({
  resolveCancellationAuthority: mocks.resolveCancellationAuthority,
}));
vi.mock("@/services/cancellationPolicy", () => ({
  cancelBookingWithRefund: mocks.cancelBookingWithRefund,
  BookingNotCancellableError: class BookingNotCancellableError extends Error {},
  NotAuthorizedToCancelError: class NotAuthorizedToCancelError extends Error {},
  SessionAlreadyStartedError: class SessionAlreadyStartedError extends Error {},
  SessionNotCancellableError: class SessionNotCancellableError extends Error {},
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { preparePaymentForBookingQuoteAction } from "./payments";
import { createBookingAction } from "./bookings";
import {
  preparePaymentForRequestAction,
  confirmTutoringRequestAction,
  createTutoringRequestAction,
} from "./tutoringRequests";

function sessionFor(role: "STUDENT" | "PARENT", userId = "user-1") {
  return { user: { id: userId, role } };
}

function bookingFormData() {
  const fd = new FormData();
  fd.set("studentProfileId", "student-1");
  fd.set("tutorProfileId", "tutor-1");
  fd.set("subjectId", "subject-1");
  fd.set("startAt", new Date().toISOString());
  fd.set("customerPriceQuoteId", "quote-1");
  fd.set("tutorPayoutQuoteId", "payout-quote-1");
  return fd;
}

function confirmFormData() {
  const fd = new FormData();
  fd.set("tutoringRequestId", "request-1");
  fd.set("customerPriceQuoteId", "quote-1");
  return fd;
}

describe("BETA-HARDEN1 — Closed Beta financial gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue(sessionFor("STUDENT"));
    mocks.paymentsUseStripe.mockReturnValue(true);
    mocks.closedBetaOnlineOnlyActive.mockReturnValue(false);
    // PROD-FINANCIAL-E2E1-GATE1 — unconfigured by default, exactly its real
    // production state everywhere right now. Every existing test in this
    // file (below) exercises that default and must observe byte-identical
    // behavior to before this mission existed.
    mocks.financialE2EEnabled.mockReturnValue(false);
  });

  describe("Direct Booking", () => {
    it("preparePaymentForBookingQuoteAction: gate active -> fails closed before any session/DB/Stripe work, tagged reason=beta_gate", async () => {
      mocks.closedBetaFinancialGateActive.mockReturnValue(true);
      const result = await preparePaymentForBookingQuoteAction("quote-1");
      expect(result).toMatchObject({ success: false, retryable: false, reason: "beta_gate" });
      expect(mocks.auth).not.toHaveBeenCalled();
      expect(mocks.dbFindUnique).not.toHaveBeenCalled();
      expect(mocks.ensureStripePaymentIntent).not.toHaveBeenCalled();
      expect(mocks.getOrCreatePaymentForQuote).not.toHaveBeenCalled();
    });

    it("preparePaymentForBookingQuoteAction: gate inactive -> proceeds past the gate (reaches session/DB work)", async () => {
      mocks.closedBetaFinancialGateActive.mockReturnValue(false);
      mocks.dbFindUnique.mockResolvedValue(null); // quote not found -> short-circuits harmlessly
      const result = await preparePaymentForBookingQuoteAction("quote-1");
      expect(mocks.auth).toHaveBeenCalled();
      expect(result.success).toBe(false); // not found, but proves the gate didn't block it
      expect((result as { reason?: string }).reason).not.toBe("beta_gate");
    });

    it("createBookingAction: gate active -> fails closed before any session/DB/Stripe/reservation work", async () => {
      mocks.closedBetaFinancialGateActive.mockReturnValue(true);
      const result = await createBookingAction(undefined, bookingFormData());
      expect(result).toMatchObject({ error: "betaBookingsUnavailable" });
      expect(mocks.auth).not.toHaveBeenCalled();
      expect(mocks.dbFindUnique).not.toHaveBeenCalled();
      expect(mocks.getAvailableSlots).not.toHaveBeenCalled();
      expect(mocks.reserveBookingPendingPayment).not.toHaveBeenCalled();
      expect(mocks.captureAuthorizedPayment).not.toHaveBeenCalled();
      expect(mocks.getOrCreatePaymentForQuote).not.toHaveBeenCalled();
      expect(mocks.verifyAndAuthorizePaymentIntent).not.toHaveBeenCalled();
    });

    it("createBookingAction: gate inactive -> proceeds past the gate (reaches session work)", async () => {
      mocks.closedBetaFinancialGateActive.mockReturnValue(false);
      await createBookingAction(undefined, bookingFormData());
      expect(mocks.auth).toHaveBeenCalled();
    });
  });

  describe("PROD-FINANCIAL-E2E1-GATE1 — temporary single-scenario exception", () => {
    it("preparePaymentForBookingQuoteAction: gate active + E2E unconfigured -> beta_gate exactly as before, no auth() call at all", async () => {
      mocks.closedBetaFinancialGateActive.mockReturnValue(true);
      mocks.financialE2EEnabled.mockReturnValue(false);
      const result = await preparePaymentForBookingQuoteAction("quote-1");
      expect(result).toMatchObject({ success: false, retryable: false, reason: "beta_gate" });
      expect(mocks.auth).not.toHaveBeenCalled();
      expect(mocks.isFinancialE2EExceptionAllowed).not.toHaveBeenCalled();
      expect(mocks.auditFinancialE2EExceptionUsed).not.toHaveBeenCalled();
    });

    it("preparePaymentForBookingQuoteAction: gate active + E2E enabled but scenario does not match -> still beta_gate, no audit write", async () => {
      mocks.closedBetaFinancialGateActive.mockReturnValue(true);
      mocks.financialE2EEnabled.mockReturnValue(true);
      mocks.isFinancialE2EExceptionAllowed.mockResolvedValue(false);
      const result = await preparePaymentForBookingQuoteAction("quote-1");
      expect(result).toMatchObject({ success: false, retryable: false, reason: "beta_gate" });
      expect(mocks.auditFinancialE2EExceptionUsed).not.toHaveBeenCalled();
    });

    it("preparePaymentForBookingQuoteAction: gate active + unauthenticated -> beta_gate, isFinancialE2EExceptionAllowed never even called", async () => {
      mocks.closedBetaFinancialGateActive.mockReturnValue(true);
      mocks.financialE2EEnabled.mockReturnValue(true);
      mocks.auth.mockResolvedValue(null);
      const result = await preparePaymentForBookingQuoteAction("quote-1");
      expect(result).toMatchObject({ success: false, retryable: false, reason: "beta_gate" });
      expect(mocks.isFinancialE2EExceptionAllowed).not.toHaveBeenCalled();
    });

    it("preparePaymentForBookingQuoteAction: gate active + exact valid exception -> proceeds past the gate, writes exactly one audit entry", async () => {
      mocks.closedBetaFinancialGateActive.mockReturnValue(true);
      mocks.financialE2EEnabled.mockReturnValue(true);
      mocks.auth.mockResolvedValue(sessionFor("STUDENT", "controlled-actor"));
      mocks.isFinancialE2EExceptionAllowed.mockResolvedValue(true);
      mocks.dbFindUnique.mockResolvedValue(null); // quote lookup below the gate — not found, but proves the gate let it through
      const result = await preparePaymentForBookingQuoteAction("quote-1");
      expect(mocks.isFinancialE2EExceptionAllowed).toHaveBeenCalledWith({ actorUserId: "controlled-actor", customerPriceQuoteId: "quote-1" });
      expect(mocks.auditFinancialE2EExceptionUsed).toHaveBeenCalledTimes(1);
      expect((result as { reason?: string }).reason).not.toBe("beta_gate");
    });

    it("createBookingAction: gate active + E2E unconfigured -> beta_gate exactly as before, no auth() call at all", async () => {
      mocks.closedBetaFinancialGateActive.mockReturnValue(true);
      mocks.financialE2EEnabled.mockReturnValue(false);
      const result = await createBookingAction(undefined, bookingFormData());
      expect(result).toMatchObject({ error: "betaBookingsUnavailable" });
      expect(mocks.auth).not.toHaveBeenCalled();
      expect(mocks.isFinancialE2EExceptionAllowed).not.toHaveBeenCalled();
    });

    it("createBookingAction: gate active + E2E enabled but scenario does not match -> still beta_gate, reservation never reached", async () => {
      mocks.closedBetaFinancialGateActive.mockReturnValue(true);
      mocks.financialE2EEnabled.mockReturnValue(true);
      mocks.isFinancialE2EExceptionAllowed.mockResolvedValue(false);
      const result = await createBookingAction(undefined, bookingFormData());
      expect(result).toMatchObject({ error: "betaBookingsUnavailable" });
      expect(mocks.reserveBookingPendingPayment).not.toHaveBeenCalled();
      expect(mocks.captureAuthorizedPayment).not.toHaveBeenCalled();
    });

    it("createBookingAction: gate active + exact valid exception (independent, defense-in-depth re-check) -> proceeds past the gate", async () => {
      mocks.closedBetaFinancialGateActive.mockReturnValue(true);
      mocks.financialE2EEnabled.mockReturnValue(true);
      mocks.auth.mockResolvedValue(sessionFor("STUDENT", "controlled-actor"));
      mocks.isFinancialE2EExceptionAllowed.mockResolvedValue(true);
      await createBookingAction(undefined, bookingFormData());
      expect(mocks.isFinancialE2EExceptionAllowed).toHaveBeenCalledWith({ actorUserId: "controlled-actor", customerPriceQuoteId: "quote-1" });
      expect(mocks.auditFinancialE2EExceptionUsed).toHaveBeenCalledTimes(1);
      // auth() is called a second time by the normal (post-gate) flow below
      // — proves control genuinely fell through to the ordinary booking path
      // rather than being special-cased.
      expect(mocks.auth).toHaveBeenCalledTimes(2);
    });

    it("createBookingAction: missing customerPriceQuoteId in the form -> beta_gate, exception never evaluated", async () => {
      mocks.closedBetaFinancialGateActive.mockReturnValue(true);
      mocks.financialE2EEnabled.mockReturnValue(true);
      mocks.auth.mockResolvedValue(sessionFor("STUDENT", "controlled-actor"));
      const fd = bookingFormData();
      fd.delete("customerPriceQuoteId");
      const result = await createBookingAction(undefined, fd);
      expect(result).toMatchObject({ error: "betaBookingsUnavailable" });
      expect(mocks.isFinancialE2EExceptionAllowed).not.toHaveBeenCalled();
    });
  });

  describe("Quick Match", () => {
    it("preparePaymentForRequestAction: gate active -> fails closed before any session/DB/Stripe work, tagged reason=beta_gate", async () => {
      mocks.closedBetaFinancialGateActive.mockReturnValue(true);
      const result = await preparePaymentForRequestAction("request-1");
      expect(result).toMatchObject({ success: false, retryable: false, reason: "beta_gate" });
      expect(mocks.auth).not.toHaveBeenCalled();
      expect(mocks.dbFindUnique).not.toHaveBeenCalled();
      expect(mocks.ensureStripePaymentIntent).not.toHaveBeenCalled();
    });

    it("preparePaymentForRequestAction: gate inactive -> proceeds past the gate (reaches session work)", async () => {
      mocks.closedBetaFinancialGateActive.mockReturnValue(false);
      mocks.dbFindUnique.mockResolvedValue(null);
      await preparePaymentForRequestAction("request-1");
      expect(mocks.auth).toHaveBeenCalled();
    });

    it("confirmTutoringRequestAction: gate active -> fails closed before any session/DB/quote-lock/dispatch work", async () => {
      mocks.closedBetaFinancialGateActive.mockReturnValue(true);
      const result = await confirmTutoringRequestAction(undefined, confirmFormData());
      expect(result).toMatchObject({ error: "betaBookingsUnavailable" });
      expect(mocks.auth).not.toHaveBeenCalled();
      expect(mocks.dbFindUnique).not.toHaveBeenCalled();
      expect(mocks.lockCustomerPriceQuote).not.toHaveBeenCalled();
      expect(mocks.advanceDispatch).not.toHaveBeenCalled();
      expect(mocks.verifyAndAuthorizePaymentIntent).not.toHaveBeenCalled();
      expect(mocks.dbTransaction).not.toHaveBeenCalled();
    });

    it("confirmTutoringRequestAction: gate inactive -> proceeds past the gate (reaches session work)", async () => {
      mocks.closedBetaFinancialGateActive.mockReturnValue(false);
      await confirmTutoringRequestAction(undefined, confirmFormData());
      expect(mocks.auth).toHaveBeenCalled();
    });

    it("PROD-FINANCIAL-E2E1-GATE1 — Quick Match remains fully beta-gated even with the E2E exception fully enabled and permissive: preparePaymentForRequestAction", async () => {
      mocks.closedBetaFinancialGateActive.mockReturnValue(true);
      mocks.financialE2EEnabled.mockReturnValue(true);
      mocks.isFinancialE2EExceptionAllowed.mockResolvedValue(true);
      const result = await preparePaymentForRequestAction("request-1");
      expect(result).toMatchObject({ success: false, retryable: false, reason: "beta_gate" });
      // tutoringRequests.ts never imports financialE2EConfig at all — this
      // is the structural guarantee, not just an observed outcome.
      expect(mocks.isFinancialE2EExceptionAllowed).not.toHaveBeenCalled();
      expect(mocks.auditFinancialE2EExceptionUsed).not.toHaveBeenCalled();
    });

    it("PROD-FINANCIAL-E2E1-GATE1 — Quick Match remains fully beta-gated even with the E2E exception fully enabled and permissive: confirmTutoringRequestAction", async () => {
      mocks.closedBetaFinancialGateActive.mockReturnValue(true);
      mocks.financialE2EEnabled.mockReturnValue(true);
      mocks.isFinancialE2EExceptionAllowed.mockResolvedValue(true);
      const result = await confirmTutoringRequestAction(undefined, confirmFormData());
      expect(result).toMatchObject({ error: "betaBookingsUnavailable" });
      expect(mocks.isFinancialE2EExceptionAllowed).not.toHaveBeenCalled();
      expect(mocks.auditFinancialE2EExceptionUsed).not.toHaveBeenCalled();
    });
  });
});

describe("BETA-HARDEN1 — Closed Beta online-only enforcement (createTutoringRequestAction)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue(sessionFor("STUDENT"));
    mocks.closedBetaFinancialGateActive.mockReturnValue(false); // unrelated to this describe block
  });

  function requestFormData(tutoringMode: "ONLINE" | "IN_PERSON" | "BOTH") {
    const fd = new FormData();
    fd.set("studentProfileId", "student-1");
    fd.set("subjectId", "subject-1");
    // BETA-PRICINGFIX1 — academicLevelId is now required by
    // createTutoringRequestSchema (see FutureTutor_BETA_PRICINGGAP_AUDIT1
    // /FIX1 reports); unrelated to what this describe block actually tests
    // (the online-only gate), so a fixed, valid value keeps that intent
    // isolated from this schema change.
    fd.set("academicLevelId", "level-1");
    fd.set("tutoringMode", tutoringMode);
    fd.set("durationMinutes", "60");
    fd.set("requestedStartAt", new Date(Date.now() + 3600_000).toISOString());
    if (tutoringMode !== "ONLINE") {
      fd.set("addressLine1", "1 Main St");
      fd.set("city", "Ottawa");
      fd.set("province", "ON");
      fd.set("postalCode", "K1A0A1");
    }
    return fd;
  }

  it.each(["IN_PERSON", "BOTH"] as const)(
    "gate active: tutoringMode=%s is rejected before any quote/request DB write",
    async (mode) => {
      mocks.closedBetaOnlineOnlyActive.mockReturnValue(true);
      const result = await createTutoringRequestAction(undefined, requestFormData(mode));
      expect(result).toMatchObject({ success: false, error: "betaOnlineOnly" });
      expect(mocks.createCustomerPriceQuote).not.toHaveBeenCalled();
      expect(mocks.createTutoringRequestForLearnerInOwnTransaction).not.toHaveBeenCalled();
    }
  );

  it("gate active: tutoringMode=ONLINE is accepted (reaches quote creation)", async () => {
    mocks.closedBetaOnlineOnlyActive.mockReturnValue(true);
    mocks.dbFindUnique.mockResolvedValue({ id: "student-1" });
    mocks.canInitiatePaidBooking.mockResolvedValue(true);
    mocks.createCustomerPriceQuote.mockRejectedValue(new Error("stop here — proves the gate let it through"));
    await createTutoringRequestAction(undefined, requestFormData("ONLINE"));
    expect(mocks.createCustomerPriceQuote).toHaveBeenCalled();
  });

  it("gate inactive: tutoringMode=IN_PERSON is accepted exactly as before this mission (reaches quote creation)", async () => {
    mocks.closedBetaOnlineOnlyActive.mockReturnValue(false);
    mocks.dbFindUnique.mockResolvedValue({ id: "student-1" });
    mocks.canInitiatePaidBooking.mockResolvedValue(true);
    mocks.createCustomerPriceQuote.mockRejectedValue(new Error("stop here — proves the gate let it through"));
    await createTutoringRequestAction(undefined, requestFormData("IN_PERSON"));
    expect(mocks.createCustomerPriceQuote).toHaveBeenCalled();
  });
});
