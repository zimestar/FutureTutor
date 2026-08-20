import { afterEach, describe, expect, it, vi } from "vitest";
import { getEmailDeliveryMode, getEmailFromAddress, EmailConfigurationError } from "./emailDeliveryConfig";

// L1-01B — permanent unit tests for the email-delivery mode resolver.
// Mirrors src/lib/paymentMode.ts's own test-shape conventions: env vars are
// stubbed per-test and always restored, so no test here can leak
// configuration into any other test file in the suite. Uses vitest's own
// vi.stubEnv/vi.unstubAllEnvs rather than direct `process.env.X = ...`
// assignment — this project's Next.js ambient types declare
// `process.env.NODE_ENV` as a read-only property (TS2540), so a direct
// assignment does not typecheck even with a cast.

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getEmailDeliveryMode", () => {
  it("test matrix item 12 — resolves to console_dev outside production when no Resend config is present (dev adapter cannot require a real provider)", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
    expect(getEmailDeliveryMode()).toBe("console_dev");
  });

  it("resolves to resend outside production when both RESEND_API_KEY and EMAIL_FROM are explicitly set (opt-in real delivery, e.g. staging)", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("EMAIL_FROM", "FutureTutor <no-reply@futuretutor.ca>");
    expect(getEmailDeliveryMode()).toBe("resend");
  });

  it("resolves to console_dev outside production when only RESEND_API_KEY is set (partial config)", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("EMAIL_FROM", "");
    expect(getEmailDeliveryMode()).toBe("console_dev");
  });

  it("resolves to console_dev outside production when only EMAIL_FROM is set (partial config)", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "FutureTutor <no-reply@futuretutor.ca>");
    expect(getEmailDeliveryMode()).toBe("console_dev");
  });

  it("test matrix item 11 — throws EmailConfigurationError in production when RESEND_API_KEY is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "FutureTutor <no-reply@futuretutor.ca>");
    expect(() => getEmailDeliveryMode()).toThrow(EmailConfigurationError);
  });

  it("test matrix item 11 — throws EmailConfigurationError in production when EMAIL_FROM is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_live_key");
    vi.stubEnv("EMAIL_FROM", "");
    expect(() => getEmailDeliveryMode()).toThrow(EmailConfigurationError);
  });

  it("test matrix item 12 — production NEVER resolves to console_dev, even implicitly (fails closed instead)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
    let mode: string | undefined;
    try {
      mode = getEmailDeliveryMode();
    } catch {
      // expected
    }
    expect(mode).not.toBe("console_dev");
  });

  it("resolves to resend in production when both RESEND_API_KEY and EMAIL_FROM are set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_live_key");
    vi.stubEnv("EMAIL_FROM", "FutureTutor <no-reply@futuretutor.ca>");
    expect(getEmailDeliveryMode()).toBe("resend");
  });

  it("EmailConfigurationError messages never include the configured key/from value itself", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_super_secret_do_not_leak");
    vi.stubEnv("EMAIL_FROM", "");
    try {
      getEmailDeliveryMode();
      throw new Error("expected getEmailDeliveryMode to throw");
    } catch (error) {
      expect((error as Error).message).not.toContain("re_super_secret_do_not_leak");
    }
  });
});

describe("getEmailFromAddress", () => {
  it("returns the configured EMAIL_FROM value", () => {
    vi.stubEnv("EMAIL_FROM", "FutureTutor <no-reply@futuretutor.ca>");
    expect(getEmailFromAddress()).toBe("FutureTutor <no-reply@futuretutor.ca>");
  });

  it("throws EmailConfigurationError when EMAIL_FROM is unset", () => {
    vi.stubEnv("EMAIL_FROM", "");
    expect(() => getEmailFromAddress()).toThrow(EmailConfigurationError);
  });
});
