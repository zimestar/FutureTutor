import { beforeEach, describe, expect, it, vi } from "vitest";

// RW-03 — Quick Match acceptance when the accepting tutor is no longer
// bookable. Runs the REAL acceptTutorInvitationAction transaction callback
// against an in-memory fake `tx` (withSerializableRetry and db.$transaction
// are pass-throughs), so the actual ordering inside the action is exercised:
// invitation/request checks -> isTutorEligibleForRequest -> claim ->
// reserveBookingPendingPayment. Both refusal points must be handled as a
// candidate-level failure: no capture/convergence, dispatch advances, and the
// tutor sees "invitation no longer available".

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  dbTutorProfileFindUnique: vi.fn(),
  dbTutorInvitationFindUnique: vi.fn(),
  isTutorEligibleForRequest: vi.fn(),
  reserveBookingPendingPayment: vi.fn(),
  acceptTutorPayoutQuote: vi.fn(),
  captureAuthorizedPayment: vi.fn(),
  convergeToCaptured: vi.fn(),
  advanceDispatch: vi.fn(),
  paymentsUseStripe: vi.fn(),
  claimUpdateMany: vi.fn(),
}));

vi.mock("next-intl/server", () => ({ getTranslations: vi.fn().mockResolvedValue((key: string) => key) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn() }));
vi.mock("@/lib/paymentMode", () => ({ paymentsUseStripe: mocks.paymentsUseStripe }));
vi.mock("@/lib/serializableRetry", () => ({ withSerializableRetry: (fn: () => Promise<unknown>) => fn() }));
vi.mock("@/services/tutorEligibility", () => ({ isTutorEligibleForRequest: mocks.isTutorEligibleForRequest }));
vi.mock("@/services/bookingCreation", () => ({
  reserveBookingPendingPayment: mocks.reserveBookingPendingPayment,
  SlotTakenError: class SlotTakenError extends Error {},
  NotAuthorizedForLearnerError: class NotAuthorizedForLearnerError extends Error {},
  QuoteLearnerMismatchError: class QuoteLearnerMismatchError extends Error {},
  TutorNotBookableError: class TutorNotBookableError extends Error {},
}));
vi.mock("@/services/payments", () => ({
  captureAuthorizedPayment: mocks.captureAuthorizedPayment,
  convergeToCaptured: mocks.convergeToCaptured,
}));
vi.mock("@/services/tutorPayout", () => ({
  acceptTutorPayoutQuote: mocks.acceptTutorPayoutQuote,
  cancelTutorPayoutQuote: vi.fn(),
  TutorPayoutQuoteNotFoundError: class TutorPayoutQuoteNotFoundError extends Error {},
  TutorPayoutQuoteExpiredError: class TutorPayoutQuoteExpiredError extends Error {},
  TutorPayoutQuoteNotActiveError: class TutorPayoutQuoteNotActiveError extends Error {},
  TutorPayoutQuoteAlreadyAcceptedError: class TutorPayoutQuoteAlreadyAcceptedError extends Error {},
}));
vi.mock("@/services/quickMatchDispatch", () => ({ advanceDispatch: mocks.advanceDispatch }));

const fakeTx = {
  tutorInvitation: {
    findUnique: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  tutoringRequest: { findUnique: vi.fn(), updateMany: mocks.claimUpdateMany },
  payment: { findUnique: vi.fn() },
  tutorAvailability: { findFirst: vi.fn() },
};

vi.mock("@/lib/db", () => ({
  db: {
    tutorProfile: { findUnique: mocks.dbTutorProfileFindUnique },
    tutorInvitation: { findUnique: mocks.dbTutorInvitationFindUnique },
    booking: { findUnique: vi.fn() },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(fakeTx),
  },
}));

import { acceptTutorInvitationAction } from "./tutorInvitations";

function formData() {
  const fd = new FormData();
  fd.set("tutorInvitationId", "invitation-1");
  return fd;
}

describe("acceptTutorInvitationAction — RW-03 tutor no longer bookable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "tutor-user-1", role: "TUTOR" } });
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", userId: "tutor-user-1" });
    mocks.dbTutorInvitationFindUnique.mockResolvedValue({ tutoringRequestId: "request-1" });
    mocks.paymentsUseStripe.mockReturnValue(true);
    fakeTx.tutorInvitation.findUnique.mockResolvedValue({
      id: "invitation-1",
      tutorProfileId: "tutor-1",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 3600_000),
      tutorPayoutQuoteId: "payout-quote-1",
      tutoringRequestId: "request-1",
    });
    fakeTx.tutoringRequest.findUnique.mockResolvedValue({
      id: "request-1",
      status: "MATCHING",
      customerPriceQuoteId: "quote-1",
      subjectId: "subject-1",
      academicLevelId: null,
      tutoringMode: "ONLINE",
      requestedStartAt: new Date(Date.now() + 2 * 24 * 3600_000),
      durationMinutes: 60,
      city: null,
      createdByUserId: "parent-user-1",
      studentProfileId: "student-1",
    });
    fakeTx.payment.findUnique.mockResolvedValue({ id: "payment-1" });
    fakeTx.tutorAvailability.findFirst.mockResolvedValue({ timezone: "UTC" });
    mocks.claimUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("suspended/deactivated before accept: eligibility re-check refuses -> candidate-level failure, no claim, no reservation, no capture", async () => {
    mocks.isTutorEligibleForRequest.mockResolvedValue(false);

    const result = await acceptTutorInvitationAction(undefined, formData());

    expect(result).toEqual({ error: "invitationNoLongerAvailable" });
    expect(mocks.claimUpdateMany).not.toHaveBeenCalled();
    expect(mocks.reserveBookingPendingPayment).not.toHaveBeenCalled();
    expect(mocks.captureAuthorizedPayment).not.toHaveBeenCalled();
    expect(mocks.convergeToCaptured).not.toHaveBeenCalled();
    expect(mocks.advanceDispatch).toHaveBeenCalledWith("request-1");
  });

  it("suspended/deactivated between eligibility check and reservation: TutorNotBookableError -> candidate-level failure, dispatch advances, no capture", async () => {
    mocks.isTutorEligibleForRequest.mockResolvedValue(true);
    const { TutorNotBookableError } = await import("@/services/bookingCreation");
    mocks.reserveBookingPendingPayment.mockRejectedValue(new TutorNotBookableError());

    const result = await acceptTutorInvitationAction(undefined, formData());

    expect(mocks.reserveBookingPendingPayment).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ error: "invitationNoLongerAvailable" });
    expect(mocks.captureAuthorizedPayment).not.toHaveBeenCalled();
    expect(mocks.convergeToCaptured).not.toHaveBeenCalled();
    expect(mocks.advanceDispatch).toHaveBeenCalledWith("request-1");
  });
});

// RW-02 — acceptance of a legacy TutoringRequest stored with tutoringMode=BOTH.
describe("acceptTutorInvitationAction — RW-02 legacy BOTH-mode request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "tutor-user-1", role: "TUTOR" } });
    mocks.dbTutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", userId: "tutor-user-1" });
    mocks.dbTutorInvitationFindUnique.mockResolvedValue({ tutoringRequestId: "request-1" });
    mocks.paymentsUseStripe.mockReturnValue(true);
    mocks.isTutorEligibleForRequest.mockResolvedValue(true);
    fakeTx.tutorInvitation.findUnique.mockResolvedValue({
      id: "invitation-1",
      tutorProfileId: "tutor-1",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 3600_000),
      tutorPayoutQuoteId: "payout-quote-1",
      tutoringRequestId: "request-1",
    });
    fakeTx.payment.findUnique.mockResolvedValue({ id: "payment-1" });
    fakeTx.tutorAvailability.findFirst.mockResolvedValue({ timezone: "UTC" });
    mocks.claimUpdateMany.mockResolvedValue({ count: 1 });
  });

  function request(tutoringMode: string) {
    return {
      id: "request-1",
      status: "MATCHING",
      customerPriceQuoteId: "quote-1",
      subjectId: "subject-1",
      academicLevelId: null,
      tutoringMode,
      requestedStartAt: new Date(Date.now() + 2 * 24 * 3600_000),
      durationMinutes: 60,
      city: "Ottawa",
      addressLine1: "1 Main St",
      addressLine2: null,
      province: "ON",
      postalCode: "K1A0A1",
      arrivalInstructions: null,
      createdByUserId: "parent-user-1",
      studentProfileId: "student-1",
    };
  }

  it("BOTH -> invitationNoLongerAvailable before eligibility, claim, payout acceptance, reservation or capture", async () => {
    fakeTx.tutoringRequest.findUnique.mockResolvedValue(request("BOTH"));

    const result = await acceptTutorInvitationAction(undefined, formData());

    expect(result).toEqual({ error: "invitationNoLongerAvailable" });
    expect(mocks.isTutorEligibleForRequest).not.toHaveBeenCalled();
    expect(mocks.claimUpdateMany).not.toHaveBeenCalled(); // request status never touched
    expect(mocks.acceptTutorPayoutQuote).not.toHaveBeenCalled();
    expect(mocks.reserveBookingPendingPayment).not.toHaveBeenCalled();
    expect(mocks.captureAuthorizedPayment).not.toHaveBeenCalled();
    expect(mocks.convergeToCaptured).not.toHaveBeenCalled();
    expect(fakeTx.tutorInvitation.update).not.toHaveBeenCalled();
  });

  it.each([
    ["ONLINE", null],
    ["IN_PERSON", "1 Main St"],
  ])("%s request -> reaches the reservation with that exact mode; location attached only for IN_PERSON", async (mode, expectedAddress) => {
    fakeTx.tutoringRequest.findUnique.mockResolvedValue(request(mode));
    mocks.reserveBookingPendingPayment.mockRejectedValue(new Error("stop — reached the reservation"));

    await acceptTutorInvitationAction(undefined, formData());

    expect(mocks.isTutorEligibleForRequest).toHaveBeenCalledWith(fakeTx, "tutor-1", expect.objectContaining({ tutoringMode: mode }));
    expect(mocks.reserveBookingPendingPayment).toHaveBeenCalledTimes(1);
    const reserveInput = mocks.reserveBookingPendingPayment.mock.calls[0][1] as { mode: string; location: { addressLine1: string } | null };
    expect(reserveInput.mode).toBe(mode);
    expect(reserveInput.location?.addressLine1 ?? null).toBe(expectedAddress);
  });
});
