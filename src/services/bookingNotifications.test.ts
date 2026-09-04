import { beforeEach, describe, expect, it, vi } from "vitest";

// PROD-BOOKING-NOTIFICATIONS1 — permanent regression coverage for the
// booking-confirmation email outbox: durable idempotency
// (createPendingBookingEmailNotifications), safe re-dispatch
// (dispatchBookingConfirmationEmails never double-sends, never throws to
// its caller), and that a provider failure only ever marks that one row
// FAILED — it can never affect Booking/Payment state, since this module
// never writes to either table.

const mocks = vi.hoisted(() => ({
  createMany: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  bookingFindUnique: vi.fn(),
  paymentFindUnique: vi.fn(),
  subjectFindUnique: vi.fn(),
  academicLevelFindUnique: vi.fn(),
  tutorProfileFindUnique: vi.fn(),
  studentProfileFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  parentProfileFindUnique: vi.fn(),
  resolveBookingEmailBaseUrl: vi.fn(),
  buildTutorBookingEmailContent: vi.fn(),
  buildPayerBookingEmailContent: vi.fn(),
  resolveSendBookingConfirmationEmail: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    bookingEmailNotification: { createMany: mocks.createMany, findMany: mocks.findMany, updateMany: mocks.updateMany },
    booking: { findUnique: mocks.bookingFindUnique },
    payment: { findUnique: mocks.paymentFindUnique },
    subject: { findUnique: mocks.subjectFindUnique },
    academicLevel: { findUnique: mocks.academicLevelFindUnique },
    tutorProfile: { findUnique: mocks.tutorProfileFindUnique },
    studentProfile: { findUnique: mocks.studentProfileFindUnique },
    user: { findUnique: mocks.userFindUnique },
    parentProfile: { findUnique: mocks.parentProfileFindUnique },
  },
}));
vi.mock("@/lib/email/resolveBookingEmailBaseUrl", () => ({ resolveBookingEmailBaseUrl: mocks.resolveBookingEmailBaseUrl }));
vi.mock("@/lib/email/bookingConfirmationEmailContent", () => ({
  buildTutorBookingEmailContent: mocks.buildTutorBookingEmailContent,
  buildPayerBookingEmailContent: mocks.buildPayerBookingEmailContent,
}));
vi.mock("@/lib/email/sendBookingConfirmationEmail", () => ({
  resolveSendBookingConfirmationEmail: mocks.resolveSendBookingConfirmationEmail,
}));

import { createPendingBookingEmailNotifications, dispatchBookingConfirmationEmails } from "./bookingNotifications";

describe("createPendingBookingEmailNotifications", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates exactly one TUTOR row and one PAYER row, with skipDuplicates for idempotency", async () => {
    const tx = { bookingEmailNotification: { createMany: mocks.createMany } } as never;
    await createPendingBookingEmailNotifications(tx, { bookingId: "booking-1", tutorUserId: "tutor-user-1", payerUserId: "payer-user-1" });

    expect(mocks.createMany).toHaveBeenCalledTimes(1);
    const call = mocks.createMany.mock.calls[0][0];
    expect(call.skipDuplicates).toBe(true);
    expect(call.data).toEqual([
      { bookingId: "booking-1", recipientRole: "TUTOR", recipientUserId: "tutor-user-1" },
      { bookingId: "booking-1", recipientRole: "PAYER", recipientUserId: "payer-user-1" },
    ]);
  });
});

function mockFullBookingContext(overrides: { payerIsLearner?: boolean } = {}) {
  const payerUserId = overrides.payerIsLearner === false ? "parent-user-1" : "student-user-1";
  mocks.bookingFindUnique.mockResolvedValue({
    id: "booking-1",
    mode: "ONLINE",
    startAt: new Date("2026-09-11T00:00:00.000Z"),
    endAt: new Date("2026-09-11T01:00:00.000Z"),
    timezone: "America/Edmonton",
    totalCents: 3200,
    currency: "CAD",
    subjectId: "subject-1",
    academicLevelId: "level-1",
    studentProfileId: "student-profile-1",
    tutorProfileId: "tutor-profile-1",
  });
  mocks.paymentFindUnique.mockResolvedValue({ payerUserId, amountCents: 3200, currency: "CAD" });
  mocks.subjectFindUnique.mockResolvedValue({ slug: "math" });
  mocks.academicLevelFindUnique.mockResolvedValue({ slug: "elementary" });
  mocks.tutorProfileFindUnique.mockResolvedValue({ userId: "tutor-user-1", user: { name: "Matthew Allen", email: "matthew@example.com" } });
  mocks.studentProfileFindUnique.mockResolvedValue({ firstName: "Hamed", userId: "student-user-1", preferredLanguage: "en" });
  mocks.userFindUnique.mockResolvedValue({ name: "Payer Name", email: "payer@example.com" });
  mocks.parentProfileFindUnique.mockResolvedValue(overrides.payerIsLearner === false ? { preferredLanguage: "fr" } : null);
  mocks.resolveBookingEmailBaseUrl.mockReturnValue("https://www.futuretutor.ca");
  mocks.buildTutorBookingEmailContent.mockResolvedValue({ subject: "tutor subject", html: "<p>tutor</p>", text: "tutor text" });
  mocks.buildPayerBookingEmailContent.mockResolvedValue({ subject: "payer subject", html: "<p>payer</p>", text: "payer text" });
  mocks.resolveSendBookingConfirmationEmail.mockReturnValue(mocks.sendEmail);
}

describe("dispatchBookingConfirmationEmails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("test matrix item 1/2 — sends to both tutor and payer when both PENDING rows exist, marks each SENT", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "row-tutor", recipientRole: "TUTOR", recipientUserId: "tutor-user-1" },
      { id: "row-payer", recipientRole: "PAYER", recipientUserId: "student-user-1" },
    ]);
    mockFullBookingContext();

    await dispatchBookingConfirmationEmails("booking-1");

    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "matthew@example.com", subject: "tutor subject" }));
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "payer@example.com", subject: "payer subject" }));
    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
    for (const call of mocks.updateMany.mock.calls) {
      expect(call[0].data.status).toBe("SENT");
    }

    // BASEURLFIX1 — the generated CTA uses the resolved base URL (the
    // production case: site.url via resolveBookingEmailBaseUrl), not
    // next/headers, and never a localhost origin.
    const tutorContentCall = mocks.buildTutorBookingEmailContent.mock.calls[0][0];
    const payerContentCall = mocks.buildPayerBookingEmailContent.mock.calls[0][0];
    expect(tutorContentCall.bookingUrl).toBe("https://www.futuretutor.ca/en/tutor/bookings");
    expect(payerContentCall.bookingUrl).toBe("https://www.futuretutor.ca/en/dashboard/bookings");
    expect(tutorContentCall.bookingUrl).not.toContain("localhost");
    expect(payerContentCall.bookingUrl).not.toContain("localhost");
  });

  it("BASEURLFIX1 — dispatch works with an explicit trusted baseUrl and no request context (deps.baseUrl overrides the default site.url)", async () => {
    mocks.findMany.mockResolvedValue([{ id: "row-tutor", recipientRole: "TUTOR", recipientUserId: "tutor-user-1" }]);
    mockFullBookingContext();
    mocks.resolveBookingEmailBaseUrl.mockReturnValue("https://explicit.futuretutor.ca");

    await dispatchBookingConfirmationEmails("booking-1", { baseUrl: "https://explicit.futuretutor.ca" });

    expect(mocks.resolveBookingEmailBaseUrl).toHaveBeenCalledWith("https://explicit.futuretutor.ca");
    const tutorContentCall = mocks.buildTutorBookingEmailContent.mock.calls[0][0];
    expect(tutorContentCall.bookingUrl).toBe("https://explicit.futuretutor.ca/en/tutor/bookings");
  });

  it("BASEURLFIX1 — missing/invalid base URL configuration fails safely: no send attempted, rows stay untouched", async () => {
    mocks.findMany.mockResolvedValue([{ id: "row-tutor", recipientRole: "TUTOR", recipientUserId: "tutor-user-1" }]);
    mocks.resolveBookingEmailBaseUrl.mockReturnValue(null);

    await dispatchBookingConfirmationEmails("booking-1");

    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
    // resolution is checked before context is even loaded from the DB
    expect(mocks.bookingFindUnique).not.toHaveBeenCalled();
  });

  it("BASEURLFIX1 — a malformed explicit baseUrl (rejected by resolveBookingEmailBaseUrl) is treated identically to missing configuration", async () => {
    mocks.findMany.mockResolvedValue([{ id: "row-tutor", recipientRole: "TUTOR", recipientUserId: "tutor-user-1" }]);
    mocks.resolveBookingEmailBaseUrl.mockReturnValue(null);

    await dispatchBookingConfirmationEmails("booking-1", { baseUrl: "not-a-valid-url" });

    expect(mocks.resolveBookingEmailBaseUrl).toHaveBeenCalledWith("not-a-valid-url");
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("test matrix item 11/12 — no PENDING/FAILED rows (already fully sent, or webhook replay after a prior dispatch) => no email sent at all", async () => {
    mocks.findMany.mockResolvedValue([]);
    await dispatchBookingConfirmationEmails("booking-1");
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.bookingFindUnique).not.toHaveBeenCalled(); // short-circuits before even loading context
  });

  it("test matrix item 14/15/16 — no BookingEmailNotification rows exist at all for an uncaptured/failed/cancelled attempt => nothing sent (rows are only ever created by the CONFIRMED+CAPTURED convergence path)", async () => {
    mocks.findMany.mockResolvedValue([]);
    await dispatchBookingConfirmationEmails("booking-that-never-confirmed");
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("test matrix item 13 — provider failure marks only that row FAILED, does not throw, and never touches Booking/Payment", async () => {
    mocks.findMany.mockResolvedValue([{ id: "row-tutor", recipientRole: "TUTOR", recipientUserId: "tutor-user-1" }]);
    mockFullBookingContext();
    mocks.sendEmail.mockRejectedValueOnce(new Error("Resend unavailable"));

    await expect(dispatchBookingConfirmationEmails("booking-1")).resolves.toBeUndefined();

    const failureCall = mocks.updateMany.mock.calls.find((c) => c[0].where.id === "row-tutor");
    expect(failureCall).toBeDefined();
    expect(failureCall![0].data.status).toBe("FAILED");
    expect(failureCall![0].data.attemptCount).toEqual({ increment: 1 });
  });

  it("duplicate invocation (retry / webhook replay) does not re-send an already-SENT row", async () => {
    // First dispatch: one PENDING row, sends and marks SENT.
    mocks.findMany.mockResolvedValueOnce([{ id: "row-tutor", recipientRole: "TUTOR", recipientUserId: "tutor-user-1" }]);
    mockFullBookingContext();
    await dispatchBookingConfirmationEmails("booking-1");
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);

    // Second dispatch (simulating a webhook replay / Server Action retry):
    // findMany now correctly returns nothing, since the row is SENT.
    mocks.findMany.mockResolvedValueOnce([]);
    await dispatchBookingConfirmationEmails("booking-1");
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1); // still just once
  });

  it("self-managed student: payerIsLearner is derived correctly (payer email resolves via Payment.payerUserId, matching StudentProfile.userId)", async () => {
    mocks.findMany.mockResolvedValue([{ id: "row-payer", recipientRole: "PAYER", recipientUserId: "student-user-1" }]);
    mockFullBookingContext({ payerIsLearner: true });

    await dispatchBookingConfirmationEmails("booking-1");

    const payerContextArg = mocks.buildPayerBookingEmailContent.mock.calls[0][0];
    expect(payerContextArg.payerIsLearner).toBe(true);
  });

  it("parent booking for a child: payerIsLearner is false, payer locale resolves from ParentProfile (not StudentProfile)", async () => {
    mocks.findMany.mockResolvedValue([{ id: "row-payer", recipientRole: "PAYER", recipientUserId: "parent-user-1" }]);
    mockFullBookingContext({ payerIsLearner: false });

    await dispatchBookingConfirmationEmails("booking-1");

    const payerContextArg = mocks.buildPayerBookingEmailContent.mock.calls[0][0];
    expect(payerContextArg.payerIsLearner).toBe(false);
    expect(payerContextArg.locale).toBe("fr"); // from the mocked ParentProfile.preferredLanguage
  });

  it("guardian-managed privacy: no LEARNER-role row/recipient is ever resolved or sent to — only TUTOR and PAYER roles exist", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "row-tutor", recipientRole: "TUTOR", recipientUserId: "tutor-user-1" },
      { id: "row-payer", recipientRole: "PAYER", recipientUserId: "parent-user-1" },
    ]);
    mockFullBookingContext({ payerIsLearner: false });

    await dispatchBookingConfirmationEmails("booking-1");

    // The restricted child's own account is never looked up as a send
    // target at all — studentProfile.userId is read only to compute
    // payerIsLearner and to supply the learner's first name, never as an
    // email recipient.
    expect(mocks.userFindUnique).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: "student-profile-1" } }));
  });

  it("tutor recipient email is resolved authoritatively from TutorProfile.userId -> User.email, never client-supplied", async () => {
    mocks.findMany.mockResolvedValue([{ id: "row-tutor", recipientRole: "TUTOR", recipientUserId: "tutor-user-1" }]);
    mockFullBookingContext();

    await dispatchBookingConfirmationEmails("booking-1");

    expect(mocks.tutorProfileFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "tutor-profile-1" } }));
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "matthew@example.com" }));
  });

  it("test matrix item 18 — a logged failure never contains the recipient email or the amount charged", async () => {
    mocks.findMany.mockResolvedValue([{ id: "row-tutor", recipientRole: "TUTOR", recipientUserId: "tutor-user-1" }]);
    mockFullBookingContext();
    mocks.sendEmail.mockRejectedValueOnce(new Error("network timeout"));

    await dispatchBookingConfirmationEmails("booking-1");

    const failureCall = mocks.updateMany.mock.calls.find((c) => c[0].where.id === "row-tutor");
    const loggedError = failureCall![0].data.error as string;
    expect(loggedError).not.toContain("matthew@example.com");
    expect(loggedError).not.toContain("3200");
    expect(loggedError).toContain("network timeout");
  });
});
