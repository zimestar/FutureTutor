import { beforeEach, describe, expect, it, vi } from "vitest";

// PROD-TUTOR-APPLICATION-NOTIFICATIONS1 — permanent regression coverage for
// the tutor-application-lifecycle notification outbox: emitTutorApplicationEvent
// writes both channels (in-app + email-outbox) from one call (item 30),
// durable idempotency via skipDuplicates (items 24/26), safe re-dispatch,
// provider-failure isolation (item 25 dispatch side), recipient resolved
// server-side (item 19), provider message id capture (item 29).

const mocks = vi.hoisted(() => ({
  notificationCreate: vi.fn(),
  createMany: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  tutorProfileFindUnique: vi.fn(),
  resolveSendTutorApplicationEmail: vi.fn(),
  buildTutorApplicationEmailContent: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    tutorProfile: { findUnique: mocks.tutorProfileFindUnique },
    tutorApplicationNotification: { findMany: mocks.findMany, updateMany: mocks.updateMany },
  },
}));
vi.mock("@/lib/email/resolveBookingEmailBaseUrl", () => ({
  resolveBookingEmailBaseUrl: (explicit?: string) => explicit ?? "https://www.futuretutor.ca",
}));
vi.mock("@/lib/email/sendTutorApplicationEmail", () => ({
  resolveSendTutorApplicationEmail: mocks.resolveSendTutorApplicationEmail,
}));
vi.mock("@/lib/email/tutorApplicationEmailContent", () => ({
  buildTutorApplicationEmailContent: mocks.buildTutorApplicationEmailContent,
}));

import {
  emitTutorApplicationEvent,
  dispatchTutorApplicationNotifications,
  consoleDevSendTutorApplicationEmail,
} from "./tutorApplicationNotifications";

function fakeTx() {
  return {
    notification: { create: mocks.notificationCreate },
    tutorApplicationNotification: { createMany: mocks.createMany },
  } as never;
}

describe("emitTutorApplicationEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("item 30 — writes BOTH the in-app Notification row AND the PENDING email-outbox row from one call", async () => {
    await emitTutorApplicationEvent(fakeTx(), {
      tutorProfileId: "tutor-1",
      recipientUserId: "user-1",
      event: "APPLICATION_SUBMITTED",
      dedupeKey: "tutorProfile:tutor-1:APPLICATION_SUBMITTED",
      applicationStatus: "SUBMITTED",
      inAppTitle: "Application submitted",
      inAppBody: "We received your application.",
    });

    expect(mocks.notificationCreate).toHaveBeenCalledTimes(1);
    expect(mocks.notificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "user-1", channel: "IN_APP", title: "Application submitted" }),
    });

    expect(mocks.createMany).toHaveBeenCalledTimes(1);
    const call = mocks.createMany.mock.calls[0][0];
    expect(call.skipDuplicates).toBe(true);
    expect(call.data).toEqual([
      {
        tutorProfileId: "tutor-1",
        event: "APPLICATION_SUBMITTED",
        dedupeKey: "tutorProfile:tutor-1:APPLICATION_SUBMITTED",
        recipientUserId: "user-1",
        contextSnapshot: { applicationStatus: "SUBMITTED" },
      },
    ]);
  });

  it("items 24/26 — idempotency is enforced via skipDuplicates on the dedupeKey, not a separate check", async () => {
    await emitTutorApplicationEvent(fakeTx(), {
      tutorProfileId: "tutor-1",
      recipientUserId: "user-1",
      event: "DOCUMENT_APPROVED",
      dedupeKey: "document:doc-1:APPROVED",
      applicationStatus: "UNDER_REVIEW",
      detail: { documentType: "TRANSCRIPT" },
      inAppTitle: "Document approved",
      inAppBody: "Your transcript was approved.",
    });
    const call = mocks.createMany.mock.calls[0][0];
    expect(call.skipDuplicates).toBe(true);
    expect(call.data[0].contextSnapshot).toEqual({ applicationStatus: "UNDER_REVIEW", documentType: "TRANSCRIPT" });
  });

  it("item 19 — recipientUserId is whatever the caller resolved server-side (never re-derived here, never client input)", async () => {
    await emitTutorApplicationEvent(fakeTx(), {
      tutorProfileId: "tutor-2",
      recipientUserId: "authoritative-user-id",
      event: "APPLICATION_APPROVED",
      dedupeKey: "tutorProfile:tutor-2:APPLICATION_APPROVED",
      applicationStatus: "APPROVED",
      inAppTitle: "You're approved!",
      inAppBody: "Congratulations.",
    });
    expect(mocks.notificationCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "authoritative-user-id" }) });
    expect(mocks.createMany.mock.calls[0][0].data[0].recipientUserId).toBe("authoritative-user-id");
  });
});

function mockTutorContext() {
  mocks.tutorProfileFindUnique.mockResolvedValue({ user: { name: "Matthew Allen", email: "matthew@example.com" } });
  mocks.buildTutorApplicationEmailContent.mockResolvedValue({
    subject: "subject",
    html: "<p>html</p>",
    text: "text",
  });
  mocks.resolveSendTutorApplicationEmail.mockReturnValue(mocks.sendEmail);
  mocks.sendEmail.mockResolvedValue({ providerMessageId: "resend-msg-123" });
}

describe("dispatchTutorApplicationNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("sends every PENDING/FAILED row, marks each SENT, and persists the provider message id (item 29)", async () => {
    mocks.findMany.mockResolvedValue([{ id: "row-1", event: "APPLICATION_SUBMITTED", contextSnapshot: { applicationStatus: "SUBMITTED" } }]);
    mockTutorContext();

    await dispatchTutorApplicationNotifications("tutor-1");

    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "matthew@example.com" }));
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "row-1", status: { in: ["PENDING", "FAILED"] } },
        data: expect.objectContaining({ status: "SENT", providerMessageId: "resend-msg-123" }),
      })
    );
  });

  it("item 25 — a provider failure marks only that row FAILED, does not throw, never touches any Booking/Payment table (none are even wired here)", async () => {
    mocks.findMany.mockResolvedValue([{ id: "row-1", event: "APPLICATION_SUBMITTED", contextSnapshot: { applicationStatus: "SUBMITTED" } }]);
    mockTutorContext();
    mocks.sendEmail.mockRejectedValueOnce(new Error("Resend unavailable"));

    await expect(dispatchTutorApplicationNotifications("tutor-1")).resolves.toBeUndefined();

    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "row-1" }, data: expect.objectContaining({ status: "FAILED" }) })
    );
  });

  it("providerMessageId is null (never a throw) when the send succeeds without one", async () => {
    mocks.findMany.mockResolvedValue([{ id: "row-1", event: "APPLICATION_SUBMITTED", contextSnapshot: { applicationStatus: "SUBMITTED" } }]);
    mockTutorContext();
    mocks.sendEmail.mockResolvedValue({ providerMessageId: null });

    await dispatchTutorApplicationNotifications("tutor-1");

    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SENT", providerMessageId: null }) })
    );
  });

  it("no PENDING/FAILED rows => no email attempted (already fully sent, or nothing to send)", async () => {
    mocks.findMany.mockResolvedValue([]);
    await dispatchTutorApplicationNotifications("tutor-1");
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.tutorProfileFindUnique).not.toHaveBeenCalled();
  });

  it("missing tutor profile fails safely: no send, rows stay untouched", async () => {
    mocks.findMany.mockResolvedValue([{ id: "row-1", event: "APPLICATION_SUBMITTED", contextSnapshot: { applicationStatus: "SUBMITTED" } }]);
    mocks.tutorProfileFindUnique.mockResolvedValue(null);
    await dispatchTutorApplicationNotifications("tutor-1");
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("item 22 — dispatch is request-independent: a null/missing baseUrl override still resolves via the reused resolveBookingEmailBaseUrl default", async () => {
    mocks.findMany.mockResolvedValue([{ id: "row-1", event: "APPLICATION_SUBMITTED", contextSnapshot: { applicationStatus: "SUBMITTED" } }]);
    mockTutorContext();
    await dispatchTutorApplicationNotifications("tutor-1");
    const contentArg = mocks.buildTutorApplicationEmailContent.mock.calls[0][0];
    expect(contentArg.dashboardUrl).toContain("https://www.futuretutor.ca");
  });
});

describe("consoleDevSendTutorApplicationEmail", () => {
  it("resolves with a null providerMessageId (no real send happens)", async () => {
    const result = await consoleDevSendTutorApplicationEmail({ to: "a@b.com", subject: "s", html: "h", text: "t" });
    expect(result).toEqual({ providerMessageId: null });
  });
});
