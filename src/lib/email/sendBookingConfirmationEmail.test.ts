import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getEmailDeliveryMode: vi.fn(),
  consoleDevSendBookingConfirmationEmail: vi.fn(),
  resendSendBookingConfirmationEmail: vi.fn(),
}));

vi.mock("./emailDeliveryConfig", () => ({
  getEmailDeliveryMode: mocks.getEmailDeliveryMode,
}));
vi.mock("@/services/bookingNotifications", () => ({
  consoleDevSendBookingConfirmationEmail: mocks.consoleDevSendBookingConfirmationEmail,
}));
vi.mock("./resendSendBookingConfirmationEmail", () => ({
  resendSendBookingConfirmationEmail: mocks.resendSendBookingConfirmationEmail,
}));

import { resolveSendBookingConfirmationEmail } from "./sendBookingConfirmationEmail";

describe("resolveSendBookingConfirmationEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the Resend adapter when the resolved mode is 'resend'", () => {
    mocks.getEmailDeliveryMode.mockReturnValue("resend");
    expect(resolveSendBookingConfirmationEmail()).toBe(mocks.resendSendBookingConfirmationEmail);
  });

  it("returns the console/dev adapter when the resolved mode is 'console_dev'", () => {
    mocks.getEmailDeliveryMode.mockReturnValue("console_dev");
    expect(resolveSendBookingConfirmationEmail()).toBe(mocks.consoleDevSendBookingConfirmationEmail);
  });

  it("propagates (does not swallow) a configuration error from getEmailDeliveryMode", () => {
    mocks.getEmailDeliveryMode.mockImplementation(() => {
      throw new Error("RESEND_API_KEY is required in production but is not set.");
    });
    expect(() => resolveSendBookingConfirmationEmail()).toThrow("RESEND_API_KEY is required in production");
  });
});
