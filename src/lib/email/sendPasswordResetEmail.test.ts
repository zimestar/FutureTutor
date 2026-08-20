import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getEmailDeliveryMode: vi.fn(),
  consoleDevSendPasswordResetEmail: vi.fn(),
  resendSendPasswordResetEmail: vi.fn(),
}));

vi.mock("./emailDeliveryConfig", () => ({
  getEmailDeliveryMode: mocks.getEmailDeliveryMode,
}));
vi.mock("@/services/passwordReset", () => ({
  consoleDevSendPasswordResetEmail: mocks.consoleDevSendPasswordResetEmail,
}));
vi.mock("./resendSendPasswordResetEmail", () => ({
  resendSendPasswordResetEmail: mocks.resendSendPasswordResetEmail,
}));

import { resolveSendPasswordResetEmail } from "./sendPasswordResetEmail";

describe("resolveSendPasswordResetEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the Resend adapter when the resolved mode is 'resend'", () => {
    mocks.getEmailDeliveryMode.mockReturnValue("resend");
    expect(resolveSendPasswordResetEmail()).toBe(mocks.resendSendPasswordResetEmail);
  });

  it("test matrix item 12 — returns the console/dev adapter when the resolved mode is 'console_dev'", () => {
    mocks.getEmailDeliveryMode.mockReturnValue("console_dev");
    expect(resolveSendPasswordResetEmail()).toBe(mocks.consoleDevSendPasswordResetEmail);
  });

  it("propagates (does not swallow) a configuration error from getEmailDeliveryMode", () => {
    mocks.getEmailDeliveryMode.mockImplementation(() => {
      throw new Error("RESEND_API_KEY is required in production but is not set.");
    });
    expect(() => resolveSendPasswordResetEmail()).toThrow("RESEND_API_KEY is required in production");
  });
});
