import { describe, it, expect } from "vitest";
import { resolveNotificationLink, toNotificationDto } from "./notificationPresentation";

describe("resolveNotificationLink", () => {
  it("item 13 — a booking/payment/session-family notification with a bookingId links to /session/<bookingId>", () => {
    expect(resolveNotificationLink("booking.confirmed", { bookingId: "b1" })).toBe("/session/b1");
    expect(resolveNotificationLink("payment.refund_initiated", { bookingId: "b2", refundId: "r1" })).toBe("/session/b2");
  });

  it("item 15 — a session.<event> notification links to /session/<bookingId>", () => {
    expect(resolveNotificationLink("session.session_reminder_24h", { bookingId: "b3" })).toBe("/session/b3");
    expect(resolveNotificationLink("session.session_no_show_tutor", { bookingId: "b4" })).toBe("/session/b4");
  });

  it("item 14 — a tutor_application.<event> notification links to the fixed /tutor/dashboard route, no id needed", () => {
    expect(resolveNotificationLink("tutor_application.application_approved", { tutorProfileId: "t1" })).toBe("/tutor/dashboard");
    expect(resolveNotificationLink("tutor_application.document_rejected", {})).toBe("/tutor/dashboard");
  });

  it("tutor_transfer.completed links to /tutor/payouts", () => {
    expect(resolveNotificationLink("tutor_transfer.completed", { tutorEarningId: "e1" })).toBe("/tutor/payouts");
  });

  it("quickmatch.* links to /tutor/quick-match", () => {
    expect(resolveNotificationLink("quickmatch.invitation.new", { tutoringRequestId: "r1" })).toBe("/tutor/quick-match");
    expect(resolveNotificationLink("quickmatch.invitation.superseded", {})).toBe("/tutor/quick-match");
  });

  it("item 16 — a booking-family notification WITHOUT a bookingId (missing/malformed metadata) has no link, never guesses", () => {
    expect(resolveNotificationLink("booking.confirmed", {})).toBeNull();
    expect(resolveNotificationLink("booking.confirmed", { bookingId: 123 })).toBeNull();
    expect(resolveNotificationLink("booking.confirmed", null)).toBeNull();
  });

  it("item 23 — an unknown/future notification type (e.g. a later NEW_MESSAGE) safely has no link rather than throwing or guessing", () => {
    expect(resolveNotificationLink("NEW_MESSAGE", { conversationId: "c1" })).toBeNull();
    expect(resolveNotificationLink("stripe.dispute.created", { paymentId: "p1" })).toBeNull();
    expect(resolveNotificationLink("something.entirely.unrecognized", undefined)).toBeNull();
  });

  it("never derives a link by parsing body text — only ever reads the structured metadata object", () => {
    expect(resolveNotificationLink("booking.confirmed", "bookingId: b1")).toBeNull();
  });
});

describe("toNotificationDto", () => {
  it("item 22 — never carries the raw metadata field into the client-facing DTO", () => {
    const dto = toNotificationDto({
      id: "n1",
      type: "booking.confirmed",
      title: "Booking confirmed",
      body: "Your session is confirmed.",
      readAt: null,
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      metadata: { bookingId: "b1", somethingInternal: "should never leak" },
    });
    expect(dto).not.toHaveProperty("metadata");
    expect(JSON.stringify(dto)).not.toContain("somethingInternal");
    expect(dto.href).toBe("/session/b1");
  });

  it("item 7 — readAt is serialized as an ISO string or null, never a raw Date, so unread/read is a simple equality check downstream", () => {
    const unread = toNotificationDto({ id: "n1", type: "x", title: "t", body: "b", readAt: null, createdAt: new Date(), metadata: {} });
    expect(unread.readAt).toBeNull();

    const read = toNotificationDto({ id: "n2", type: "x", title: "t", body: "b", readAt: new Date("2026-09-02T00:00:00.000Z"), createdAt: new Date(), metadata: {} });
    expect(read.readAt).toBe("2026-09-02T00:00:00.000Z");
  });
});
