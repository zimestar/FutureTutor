import { describe, it, expect, vi, beforeEach } from "vitest";

// L1-01B — mocks the Resend client the SAME way this codebase already
// mocks the Stripe client for its own external-provider tests (see
// src/services/cancellationConcurrency.integration.test.ts's
// `vi.mock("@/lib/stripe", () => ({ getStripeClient: vi.fn() }))` +
// `vi.mocked(getStripeClient).mockReturnValue(...)` pattern), adapted for
// an email client. Also mocks the content builder and config helper so
// this file only exercises resendSendPasswordResetEmail's OWN
// responsibility: calling the client correctly and translating its
// response into the SendPasswordResetEmail contract (resolve on success,
// throw on failure — never leaking the raw token/body into a thrown
// error's message).
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
vi.mock("./passwordResetEmailContent", () => ({
  buildPasswordResetEmailContent: vi.fn().mockResolvedValue({
    subject: "Reset your FutureTutor password",
    html: "<html>reset link here</html>",
    text: "reset link here",
  }),
}));

import { resendSendPasswordResetEmail } from "./resendSendPasswordResetEmail";
import { getResendClient } from "./resendClient";

describe("resendSendPasswordResetEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEmailFromAddress.mockReturnValue("FutureTutor <no-reply@futuretutor.ca>");
    mocks.send.mockResolvedValue({ data: { id: "email-id-123" }, error: null });
  });

  it("test matrix item 1 — invokes the Resend client with the resolved from/subject/html/text and the recipient email", async () => {
    await resendSendPasswordResetEmail({
      email: "user@example.com",
      resetUrl: "http://localhost:3100/en/reset-password?token=abc",
      locale: "en",
    });

    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledWith({
      from: "FutureTutor <no-reply@futuretutor.ca>",
      to: "user@example.com",
      subject: "Reset your FutureTutor password",
      html: "<html>reset link here</html>",
      text: "reset link here",
    });
  });

  it("resolves (does not throw) when Resend reports success", async () => {
    await expect(
      resendSendPasswordResetEmail({ email: "user@example.com", resetUrl: "http://x/y", locale: "en" })
    ).resolves.toBeUndefined();
  });

  it("test matrix item 9/10 — throws when Resend reports an API-level error, WITHOUT leaking the resetUrl/token into the thrown error", async () => {
    mocks.send.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "Invalid `from` field.", statusCode: 422 },
    });

    const rawToken = "super-secret-raw-token-value";
    await expect(
      resendSendPasswordResetEmail({
        email: "user@example.com",
        resetUrl: `http://localhost:3100/en/reset-password?token=${rawToken}`,
        locale: "en",
      })
    ).rejects.toThrow();

    try {
      await resendSendPasswordResetEmail({
        email: "user@example.com",
        resetUrl: `http://localhost:3100/en/reset-password?token=${rawToken}`,
        locale: "en",
      });
    } catch (error) {
      expect((error as Error).message).not.toContain(rawToken);
      expect((error as Error).message).toContain("validation_error");
    }
  });

  it("uses the cached/resolved Resend client rather than constructing its own", async () => {
    await resendSendPasswordResetEmail({ email: "user@example.com", resetUrl: "http://x/y", locale: "en" });
    expect(getResendClient).toHaveBeenCalledTimes(1);
  });
});
