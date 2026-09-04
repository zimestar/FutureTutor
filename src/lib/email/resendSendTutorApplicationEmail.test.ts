import { describe, it, expect, vi, beforeEach } from "vitest";

// PROD-TUTOR-APPLICATION-NOTIFICATIONS1 — mirrors
// resendSendBookingConfirmationEmail.test.ts's mocking pattern, plus the
// new observability behavior: this adapter captures and returns Resend's
// message id (item 29), unlike the booking adapter which discards it.
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

import { resendSendTutorApplicationEmail } from "./resendSendTutorApplicationEmail";
import { getResendClient } from "./resendClient";

const PARAMS = {
  to: "tutor@example.com",
  subject: "Your application was updated — FutureTutor",
  html: "<html>application update</html>",
  text: "application update",
};

describe("resendSendTutorApplicationEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEmailFromAddress.mockReturnValue("FutureTutor <no-reply@futuretutor.ca>");
    mocks.send.mockResolvedValue({ data: { id: "email-id-456" }, error: null });
  });

  it("invokes the Resend client with the exact already-built from/to/subject/html/text", async () => {
    await resendSendTutorApplicationEmail(PARAMS);
    expect(mocks.send).toHaveBeenCalledWith({
      from: "FutureTutor <no-reply@futuretutor.ca>",
      to: "tutor@example.com",
      subject: PARAMS.subject,
      html: PARAMS.html,
      text: PARAMS.text,
    });
  });

  it("item 29 — returns Resend's message id as providerMessageId", async () => {
    const result = await resendSendTutorApplicationEmail(PARAMS);
    expect(result).toEqual({ providerMessageId: "email-id-456" });
  });

  it("returns providerMessageId: null when Resend's response has no data.id, without throwing", async () => {
    mocks.send.mockResolvedValue({ data: null, error: null });
    const result = await resendSendTutorApplicationEmail(PARAMS);
    expect(result).toEqual({ providerMessageId: null });
  });

  it("throws a sanitized error (name only) when Resend reports an API-level error, never leaking html/text", async () => {
    mocks.send.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "Invalid `from` field.", statusCode: 422 },
    });
    try {
      await resendSendTutorApplicationEmail(PARAMS);
      throw new Error("expected resendSendTutorApplicationEmail to throw");
    } catch (error) {
      expect((error as Error).message).toContain("validation_error");
      expect((error as Error).message).not.toContain(PARAMS.html);
      expect((error as Error).message).not.toContain(PARAMS.text);
    }
  });

  it("uses the cached/resolved Resend client rather than constructing its own", async () => {
    await resendSendTutorApplicationEmail(PARAMS);
    expect(getResendClient).toHaveBeenCalledTimes(1);
  });
});
