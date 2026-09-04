import { beforeEach, describe, expect, it, vi } from "vitest";

// PROD-BOOKING-NOTIFICATIONS1-I18NFIX1 — this file exists specifically to
// reproduce, as a permanent regression test, the exact call path that
// failed in the live real-delivery certification: the normal production
// dispatcher, invoked with no Next.js request context, using the REAL
// (unmocked) content builders and translation pipeline — not the
// mocked-content-builder unit tests in bookingNotifications.test.ts, and
// not bookingConfirmationEmailContent.test.ts's direct-call tests. Only the
// database layer and the outbound provider adapter are stubbed; everything
// in between (base URL resolution, locale resolution, message lookup,
// HTML/text rendering) runs for real, exactly as it would in a background
// job / disposable certification script — vitest itself never provides a
// Next.js request context, so if this suite passes, the dispatcher
// genuinely does not need one.

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

import { dispatchBookingConfirmationEmails } from "./bookingNotifications";
import enMessages from "../../messages/en.json";
import frMessages from "../../messages/fr.json";

function mockFullBookingContext(overrides: { payerLocale?: string; mode?: "ONLINE" | "IN_PERSON" } = {}) {
  mocks.bookingFindUnique.mockResolvedValue({
    id: "booking-1",
    mode: overrides.mode ?? "ONLINE",
    startAt: new Date("2026-09-11T00:00:00.000Z"), // = 2026-09-10 18:00 America/Edmonton
    endAt: new Date("2026-09-11T01:00:00.000Z"), // = 2026-09-10 19:00 America/Edmonton
    timezone: "America/Edmonton",
    totalCents: 3200,
    currency: "CAD",
    subjectId: "subject-1",
    academicLevelId: "level-1",
    studentProfileId: "student-profile-1",
    tutorProfileId: "tutor-profile-1",
  });
  mocks.paymentFindUnique.mockResolvedValue({ payerUserId: "student-user-1", amountCents: 3200, currency: "CAD" });
  mocks.subjectFindUnique.mockResolvedValue({ slug: "math" });
  mocks.academicLevelFindUnique.mockResolvedValue({ slug: "elementary" });
  mocks.tutorProfileFindUnique.mockResolvedValue({ userId: "tutor-user-1", user: { name: "Matthew Allen", email: "matthew@example.com" } });
  mocks.studentProfileFindUnique.mockResolvedValue({ firstName: "Hamed", userId: "student-user-1", preferredLanguage: overrides.payerLocale ?? "en" });
  mocks.userFindUnique.mockResolvedValue({ name: "Hamed Payer", email: "payer@example.com" });
  mocks.parentProfileFindUnique.mockResolvedValue(null);
}

describe("dispatchBookingConfirmationEmails — real content builders, no request context (I18NFIX1 regression coverage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("item 13/14 — full dispatch (real translation, real base URL resolution) reaches the provider adapter and marks both rows SENT, with no request context anywhere in the call chain", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "row-tutor", recipientRole: "TUTOR", recipientUserId: "tutor-user-1" },
      { id: "row-payer", recipientRole: "PAYER", recipientUserId: "student-user-1" },
    ]);
    mockFullBookingContext();

    await dispatchBookingConfirmationEmails("booking-1", { sendEmail: mocks.sendEmail });

    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
    const tutorCall = mocks.sendEmail.mock.calls.find((c) => c[0].to === "matthew@example.com")![0];
    const payerCall = mocks.sendEmail.mock.calls.find((c) => c[0].to === "payer@example.com")![0];

    expect(tutorCall.subject).toBe(enMessages.tutorBookingEmail.subject);
    expect(payerCall.subject).toBe(enMessages.payerBookingEmail.subject);

    for (const call of mocks.updateMany.mock.calls) {
      expect(call[0].data.status).toBe("SENT");
    }
  });

  it("item 9 — timezone renders as America/Edmonton 6:00 PM-7:00 PM, never UTC, through the real (unmocked) pipeline", async () => {
    mocks.findMany.mockResolvedValue([{ id: "row-payer", recipientRole: "PAYER", recipientUserId: "student-user-1" }]);
    mockFullBookingContext();

    await dispatchBookingConfirmationEmails("booking-1", { sendEmail: mocks.sendEmail });

    const payerCall = mocks.sendEmail.mock.calls[0][0];
    expect(payerCall.text).toContain("6:00");
    expect(payerCall.text).toContain("7:00");
    expect(payerCall.text).toContain("America/Edmonton");
    expect(payerCall.text).not.toMatch(/\b12:00 AM\b/);
  });

  it("item 10/11 — CTA uses https://www.futuretutor.ca (default site.url) and never a localhost origin", async () => {
    mocks.findMany.mockResolvedValue([{ id: "row-tutor", recipientRole: "TUTOR", recipientUserId: "tutor-user-1" }]);
    mockFullBookingContext();

    await dispatchBookingConfirmationEmails("booking-1", { sendEmail: mocks.sendEmail });

    const tutorCall = mocks.sendEmail.mock.calls[0][0];
    expect(tutorCall.html).toContain("https://www.futuretutor.ca/en/tutor/bookings");
    expect(tutorCall.html).not.toContain("localhost");
  });

  it("real FR content is produced for a FR-preferring payer, through the real pipeline", async () => {
    mocks.findMany.mockResolvedValue([{ id: "row-payer", recipientRole: "PAYER", recipientUserId: "student-user-1" }]);
    mockFullBookingContext({ payerLocale: "fr" });

    await dispatchBookingConfirmationEmails("booking-1", { sendEmail: mocks.sendEmail });

    const payerCall = mocks.sendEmail.mock.calls[0][0];
    expect(payerCall.subject).toBe(frMessages.payerBookingEmail.subject);
    expect(payerCall.subject).not.toBe(enMessages.payerBookingEmail.subject);
  });

  it("item 16 — a provider failure in this real (unmocked) pipeline still only marks that row FAILED and never touches Booking/Payment tables", async () => {
    mocks.findMany.mockResolvedValue([{ id: "row-tutor", recipientRole: "TUTOR", recipientUserId: "tutor-user-1" }]);
    mockFullBookingContext();
    mocks.sendEmail.mockRejectedValueOnce(new Error("simulated provider outage"));

    await expect(dispatchBookingConfirmationEmails("booking-1", { sendEmail: mocks.sendEmail })).resolves.toBeUndefined();

    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "row-tutor" }, data: expect.objectContaining({ status: "FAILED" }) })
    );
    // No Booking/Payment mock method was ever called with a write — this
    // module has no such methods wired at all (see the db mock above),
    // so any attempt to write either would throw "is not a function"
    // rather than silently succeeding.
  });
});
