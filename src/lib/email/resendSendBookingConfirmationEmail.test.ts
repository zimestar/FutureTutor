import { describe, it, expect, vi, beforeEach } from "vitest";

// PROD-BOOKING-NOTIFICATIONS1 — mirrors resendSendPasswordResetEmail.test.ts's
// exact mocking pattern. Unlike that flow, content is already built by the
// caller (dispatchBookingConfirmationEmails), so this file only exercises
// the actual Resend call + success/failure translation.
const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  getEmailFromAddress: vi.fn(),
}));

vi.mock("./resendClient", () => ({
  getResendClient: vi.fn(() => ({ emails: { send: mocks.send } })),
}));
vi.mock("./emailDeliveryConfig", () => ({
  getEmailFromAddress: mocks.getEmailFromAddress,
  EmailConfigurationError: class EmailConfigurationError extends Error {},
}));

import { resendSendBookingConfirmationEmail } from "./resendSendBookingConfirmationEmail";
import { getResendClient } from "./resendClient";

const PARAMS = {
  to: "tutor@example.com",
  subject: "New tutoring session booked — FutureTutor",
  html: "<html>booking details</html>",
  text: "booking details",
};

describe("resendSendBookingConfirmationEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEmailFromAddress.mockReturnValue("FutureTutor <no-reply@futuretutor.ca>");
    mocks.send.mockResolvedValue({ data: { id: "email-id-123" }, error: null });
  });

  it("invokes the Resend client with the exact already-built from/to/subject/html/text", async () => {
    await resendSendBookingConfirmationEmail(PARAMS);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledWith({
      from: "FutureTutor <no-reply@futuretutor.ca>",
      to: "tutor@example.com",
      subject: PARAMS.subject,
      html: PARAMS.html,
      text: PARAMS.text,
    });
  });

  it("resolves (does not throw) when Resend reports success", async () => {
    await expect(resendSendBookingConfirmationEmail(PARAMS)).resolves.toBeUndefined();
  });

  it("throws a sanitized error (name only) when Resend reports an API-level error, never leaking the html/text body", async () => {
    mocks.send.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "Invalid `from` field.", statusCode: 422 },
    });

    try {
      await resendSendBookingConfirmationEmail(PARAMS);
      throw new Error("expected resendSendBookingConfirmationEmail to throw");
    } catch (error) {
      expect((error as Error).message).toContain("validation_error");
      expect((error as Error).message).not.toContain(PARAMS.html);
      expect((error as Error).message).not.toContain(PARAMS.text);
    }
  });

  it("uses the cached/resolved Resend client rather than constructing its own", async () => {
    await resendSendBookingConfirmationEmail(PARAMS);
    expect(getResendClient).toHaveBeenCalledTimes(1);
  });
});
