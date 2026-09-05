import { beforeEach, describe, expect, it, vi } from "vitest";

// PROD-SESSION-NOTIFICATIONS1 — permanent regression coverage for the
// session-lifecycle notification outbox: emitSessionNotificationEvent
// writes both channels (in-app + email-outbox) from one call, durable
// idempotency via skipDuplicates, safe re-dispatch, provider-failure
// isolation, recipient resolved server-side, provider message id
// capture, and sweepDueSessionReminders' window/exclusion logic.

const mocks = vi.hoisted(() => ({
  notificationCreate: vi.fn(),
  createMany: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  bookingFindUnique: vi.fn(),
  bookingFindMany: vi.fn(),
  paymentFindUnique: vi.fn(),
  subjectFindUnique: vi.fn(),
  academicLevelFindUnique: vi.fn(),
  tutorProfileFindUnique: vi.fn(),
  studentProfileFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  parentProfileFindUnique: vi.fn(),
  transaction: vi.fn(),
  resolveSendSessionNotificationEmail: vi.fn(),
  buildSessionNotificationEmailContent: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    booking: { findUnique: mocks.bookingFindUnique, findMany: mocks.bookingFindMany },
    payment: { findUnique: mocks.paymentFindUnique },
    subject: { findUnique: mocks.subjectFindUnique },
    academicLevel: { findUnique: mocks.academicLevelFindUnique },
    tutorProfile: { findUnique: mocks.tutorProfileFindUnique },
    studentProfile: { findUnique: mocks.studentProfileFindUnique },
    user: { findUnique: mocks.userFindUnique },
    parentProfile: { findUnique: mocks.parentProfileFindUnique },
    sessionNotification: { findMany: mocks.findMany, updateMany: mocks.updateMany },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/email/resolveBookingEmailBaseUrl", () => ({
  resolveBookingEmailBaseUrl: (explicit?: string) => explicit ?? "https://www.futuretutor.ca",
}));
vi.mock("@/lib/email/sendSessionNotificationEmail", () => ({
  resolveSendSessionNotificationEmail: mocks.resolveSendSessionNotificationEmail,
}));
vi.mock("@/lib/email/sessionNotificationEmailContent", () => ({
  buildSessionNotificationEmailContent: mocks.buildSessionNotificationEmailContent,
}));

import {
  emitSessionNotificationEvent,
  dispatchSessionNotifications,
  sweepDueSessionReminders,
  consoleDevSendSessionNotificationEmail,
} from "./sessionNotifications";

function fakeTx() {
  return {
    notification: { create: mocks.notificationCreate },
    sessionNotification: { createMany: mocks.createMany },
  } as never;
}

describe("emitSessionNotificationEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("item 28 — writes BOTH the in-app Notification row AND the PENDING email-outbox row from one call", async () => {
    await emitSessionNotificationEvent(fakeTx(), {
      bookingId: "booking-1",
      recipientUserId: "user-1",
      recipientRole: "TUTOR",
      event: "SESSION_REMINDER_24H",
      dedupeKey: "session:booking-1:SESSION_REMINDER_24H:TUTOR",
      inAppTitle: "Upcoming session tomorrow",
      inAppBody: "body",
    });

    expect(mocks.notificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "user-1", channel: "IN_APP", title: "Upcoming session tomorrow" }),
    });
    expect(mocks.createMany).toHaveBeenCalledTimes(1);
    const call = mocks.createMany.mock.calls[0][0];
    expect(call.skipDuplicates).toBe(true);
    expect(call.data).toEqual([
      {
        bookingId: "booking-1",
        event: "SESSION_REMINDER_24H",
        recipientRole: "TUTOR",
        dedupeKey: "session:booking-1:SESSION_REMINDER_24H:TUTOR",
        recipientUserId: "user-1",
        contextSnapshot: {},
      },
    ]);
  });

  it("item 26 — idempotency is enforced via skipDuplicates on the dedupeKey", async () => {
    await emitSessionNotificationEvent(fakeTx(), {
      bookingId: "booking-1",
      recipientUserId: "user-1",
      recipientRole: "PAYER",
      event: "SESSION_CANCELLED",
      dedupeKey: "session:booking-1:SESSION_CANCELLED:PAYER",
      detail: { cancelledByRelation: "OTHER_PARTY" },
      inAppTitle: "Session cancelled",
      inAppBody: "body",
    });
    const call = mocks.createMany.mock.calls[0][0];
    expect(call.skipDuplicates).toBe(true);
    expect(call.data[0].contextSnapshot).toEqual({ cancelledByRelation: "OTHER_PARTY" });
  });

  it("item 18 — recipientUserId is whatever the caller resolved server-side, never re-derived here", async () => {
    await emitSessionNotificationEvent(fakeTx(), {
      bookingId: "booking-2",
      recipientUserId: "authoritative-user-id",
      recipientRole: "TUTOR",
      event: "SESSION_NO_SHOW_LEARNER",
      dedupeKey: "session:booking-2:SESSION_NO_SHOW_LEARNER:TUTOR",
      inAppTitle: "t",
      inAppBody: "b",
    });
    expect(mocks.notificationCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "authoritative-user-id" }) });
  });
});

function mockSessionContext(overrides: { payerLocale?: string; mode?: "ONLINE" | "IN_PERSON" | "BOTH" } = {}) {
  mocks.bookingFindUnique.mockResolvedValue({
    mode: overrides.mode ?? "ONLINE",
    startAt: new Date("2026-09-11T00:00:00.000Z"),
    endAt: new Date("2026-09-11T01:00:00.000Z"),
    timezone: "America/Edmonton",
    subjectId: "subject-1",
    academicLevelId: "level-1",
    tutorProfileId: "tutor-profile-1",
    studentProfileId: "student-profile-1",
  });
  mocks.paymentFindUnique.mockResolvedValue({ payerUserId: "payer-user-1" });
  mocks.subjectFindUnique.mockResolvedValue({ slug: "math" });
  mocks.academicLevelFindUnique.mockResolvedValue({ slug: "elementary" });
  mocks.tutorProfileFindUnique.mockResolvedValue({ userId: "tutor-user-1", user: { name: "Matthew Allen", email: "matthew@example.com" } });
  mocks.studentProfileFindUnique.mockResolvedValue({ firstName: "Hamed", userId: "student-user-1", preferredLanguage: overrides.payerLocale ?? "en" });
  mocks.userFindUnique.mockResolvedValue({ name: "Payer Name", email: "payer@example.com" });
  mocks.parentProfileFindUnique.mockResolvedValue(null);
  mocks.buildSessionNotificationEmailContent.mockResolvedValue({ subject: "s", html: "<p>h</p>", text: "t" });
  mocks.resolveSendSessionNotificationEmail.mockReturnValue(mocks.sendEmail);
  mocks.sendEmail.mockResolvedValue({ providerMessageId: "resend-msg-1" });
}

describe("dispatchSessionNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("sends TUTOR row to the tutor's email and PAYER row to the payer's email, persists providerMessageId (item 27)", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "row-tutor", recipientRole: "TUTOR", event: "SESSION_REMINDER_24H", contextSnapshot: {} },
      { id: "row-payer", recipientRole: "PAYER", event: "SESSION_REMINDER_24H", contextSnapshot: {} },
    ]);
    mockSessionContext();

    await dispatchSessionNotifications("booking-1");

    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "matthew@example.com" }));
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "payer@example.com" }));
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SENT", providerMessageId: "resend-msg-1" }) })
    );
  });

  it("item 25 — a provider failure marks only that row FAILED, does not throw, and this module never writes Booking/Payment (no such mock methods exist for it to call)", async () => {
    mocks.findMany.mockResolvedValue([{ id: "row-tutor", recipientRole: "TUTOR", event: "SESSION_REMINDER_2H", contextSnapshot: {} }]);
    mockSessionContext();
    mocks.sendEmail.mockRejectedValueOnce(new Error("Resend unavailable"));

    await expect(dispatchSessionNotifications("booking-1")).resolves.toBeUndefined();

    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "row-tutor" }, data: expect.objectContaining({ status: "FAILED" }) })
    );
  });

  it("uses the payer's real durable locale (ParentProfile/StudentProfile), never the tutor's hardcoded 'en'", async () => {
    mocks.findMany.mockResolvedValue([{ id: "row-payer", recipientRole: "PAYER", event: "SESSION_REMINDER_24H", contextSnapshot: {} }]);
    mockSessionContext();
    // A parent/guardian paid (not the learner themselves) with a French
    // preference on file — this is the branch that must win over the
    // tutor's own hardcoded "en" fallback.
    mocks.parentProfileFindUnique.mockResolvedValue({ preferredLanguage: "fr" });

    await dispatchSessionNotifications("booking-1");

    const contentArg = mocks.buildSessionNotificationEmailContent.mock.calls[0][0];
    expect(contentArg.locale).toBe("fr");
  });

  it("no PENDING/FAILED rows => no email attempted", async () => {
    mocks.findMany.mockResolvedValue([]);
    await dispatchSessionNotifications("booking-1");
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.bookingFindUnique).not.toHaveBeenCalled();
  });

  it("missing recipient email (e.g. no Payment resolvable) fails that row safely instead of throwing out", async () => {
    mocks.findMany.mockResolvedValue([{ id: "row-payer", recipientRole: "PAYER", event: "SESSION_REMINDER_24H", contextSnapshot: {} }]);
    mockSessionContext();
    mocks.paymentFindUnique.mockResolvedValue(null);
    mocks.userFindUnique.mockResolvedValue(null);

    await expect(dispatchSessionNotifications("booking-1")).resolves.toBeUndefined();
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }));
  });

  it("item 22 — CTA is built from the request-independent resolved base URL, no localhost", async () => {
    mocks.findMany.mockResolvedValue([{ id: "row-tutor", recipientRole: "TUTOR", event: "SESSION_REMINDER_24H", contextSnapshot: {} }]);
    mockSessionContext();
    await dispatchSessionNotifications("booking-1");
    const contentArg = mocks.buildSessionNotificationEmailContent.mock.calls[0][0];
    expect(contentArg.dashboardUrl).toContain("https://www.futuretutor.ca");
  });
});

describe("sweepDueSessionReminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(fakeTx()));
  });

  it("item 6/34 — queries only CONFIRMED bookings (a cancelled/completed booking's status excludes it structurally)", async () => {
    mocks.bookingFindMany.mockResolvedValue([]);
    await sweepDueSessionReminders();
    for (const call of mocks.bookingFindMany.mock.calls) {
      expect(call[0].where.status).toBe("CONFIRMED");
    }
  });

  it("item 5 — creates dedupeKeys per booking+event+role; emits for both TUTOR and PAYER when a candidate is found", async () => {
    mocks.bookingFindMany
      .mockResolvedValueOnce([{ id: "booking-24h", tutorProfile: { userId: "tutor-user-1" }, payment: { payerUserId: "payer-user-1" } }])
      .mockResolvedValueOnce([]);

    const result = await sweepDueSessionReminders();

    expect(mocks.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ dedupeKey: "session:booking-24h:SESSION_REMINDER_24H:TUTOR" })] })
    );
    expect(mocks.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ dedupeKey: "session:booking-24h:SESSION_REMINDER_24H:PAYER" })] })
    );
    expect(result.bookingIds).toEqual(["booking-24h"]);
  });

  it("skips a candidate with no resolvable Payment rather than guessing a payer", async () => {
    mocks.bookingFindMany
      .mockResolvedValueOnce([{ id: "booking-no-payment", tutorProfile: { userId: "tutor-user-1" }, payment: null }])
      .mockResolvedValueOnce([]);

    const result = await sweepDueSessionReminders();

    expect(mocks.createMany).not.toHaveBeenCalled();
    expect(result.bookingIds).toEqual([]);
  });

  it("30 — never calls any Payment/Booking/TutorEarning WRITE method (no such mock exists for it to call — structurally impossible)", async () => {
    mocks.bookingFindMany
      .mockResolvedValueOnce([{ id: "booking-1", tutorProfile: { userId: "tutor-user-1" }, payment: { payerUserId: "payer-user-1" } }])
      .mockResolvedValueOnce([]);
    await sweepDueSessionReminders();
    // The db mock above declares only booking.findUnique/findMany and
    // payment.findUnique — no .update/.create for either model exists at
    // all, so any attempt by this function to write either would throw
    // "is not a function" rather than silently succeeding. It didn't throw.
  });

  it("bounded batch behavior — respects the passed limit", async () => {
    mocks.bookingFindMany.mockResolvedValue([]);
    await sweepDueSessionReminders(25);
    for (const call of mocks.bookingFindMany.mock.calls) {
      expect(call[0].take).toBe(25);
    }
  });
});

describe("consoleDevSendSessionNotificationEmail", () => {
  it("resolves with a null providerMessageId (no real send happens)", async () => {
    const result = await consoleDevSendSessionNotificationEmail({ to: "a@b.com", subject: "s", html: "h", text: "t" });
    expect(result).toEqual({ providerMessageId: null });
  });
});
