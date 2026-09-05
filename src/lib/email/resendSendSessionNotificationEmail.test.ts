import { describe, it, expect, vi, beforeEach } from "vitest";

// PROD-SESSION-NOTIFICATIONS1 — mirrors resendSendTutorApplicationEmail
// .test.ts's mocking pattern exactly, including providerMessageId capture.
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

import { resendSendSessionNotificationEmail } from "./resendSendSessionNotificationEmail";
import { getResendClient } from "./resendClient";

const PARAMS = {
  to: "tutor@example.com",
  subject: "Reminder: your session is tomorrow — FutureTutor",
  html: "<html>reminder</html>",
  text: "reminder",
};

describe("resendSendSessionNotificationEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEmailFromAddress.mockReturnValue("FutureTutor <no-reply@futuretutor.ca>");
    mocks.send.mockResolvedValue({ data: { id: "email-id-789" }, error: null });
  });

  it("invokes the Resend client with the exact already-built from/to/subject/html/text", async () => {
    await resendSendSessionNotificationEmail(PARAMS);
    expect(mocks.send).toHaveBeenCalledWith({
      from: "FutureTutor <no-reply@futuretutor.ca>",
      to: "tutor@example.com",
      subject: PARAMS.subject,
      html: PARAMS.html,
      text: PARAMS.text,
    });
  });

  it("returns Resend's message id as providerMessageId", async () => {
    const result = await resendSendSessionNotificationEmail(PARAMS);
    expect(result).toEqual({ providerMessageId: "email-id-789" });
  });

  it("returns providerMessageId: null when Resend's response has no data.id, without throwing", async () => {
    mocks.send.mockResolvedValue({ data: null, error: null });
    const result = await resendSendSessionNotificationEmail(PARAMS);
    expect(result).toEqual({ providerMessageId: null });
  });

  it("throws a sanitized error (name only) on an API-level error, never leaking html/text", async () => {
    mocks.send.mockResolvedValue({ data: null, error: { name: "validation_error", message: "Invalid `from` field.", statusCode: 422 } });
    try {
      await resendSendSessionNotificationEmail(PARAMS);
      throw new Error("expected resendSendSessionNotificationEmail to throw");
    } catch (error) {
      expect((error as Error).message).toContain("validation_error");
      expect((error as Error).message).not.toContain(PARAMS.html);
    }
  });

  it("uses the cached/resolved Resend client rather than constructing its own", async () => {
    await resendSendSessionNotificationEmail(PARAMS);
    expect(getResendClient).toHaveBeenCalledTimes(1);
  });
});
