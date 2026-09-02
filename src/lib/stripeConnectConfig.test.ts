import { describe, it, expect, afterEach } from "vitest";
import { stripeConnectOnboardingAvailable } from "./stripeConnectConfig";

// BETA-LAUNCHFIX1 — permanent unit tests for the Stripe Connect availability
// gate. Fails closed to DISABLED (the safe/restrictive state) on any
// absent/malformed/false value — the opposite default from paymentMode.ts's
// getValidatedPaymentMode() (which throws), and mirrors closedBetaConfig.ts's
// own safe-default reasoning one level further: this is a genuinely separate
// concern from both PAYMENT_MODE and CLOSED_BETA_MODE (see the module's own
// doc comment). This directly reproduces BETA-LAUNCH1's P0: an approved
// tutor + PAYMENT_MODE=live must still be blocked when this gate is closed.

const ORIGINAL_VALUE = process.env.STRIPE_CONNECT_ENABLED;

afterEach(() => {
  if (ORIGINAL_VALUE === undefined) delete process.env.STRIPE_CONNECT_ENABLED;
  else process.env.STRIPE_CONNECT_ENABLED = ORIGINAL_VALUE;
});

describe("stripeConnectOnboardingAvailable", () => {
  it("A. absent STRIPE_CONNECT_ENABLED -> disabled (the safe default)", () => {
    delete process.env.STRIPE_CONNECT_ENABLED;
    expect(stripeConnectOnboardingAvailable()).toBe(false);
  });

  it('B. explicit "false" -> disabled', () => {
    process.env.STRIPE_CONNECT_ENABLED = "false";
    expect(stripeConnectOnboardingAvailable()).toBe(false);
  });

  it.each(["TRUE", "True", "1", "yes", "enabled", ""])(
    'C. malformed value %j -> disabled, never throws',
    (value) => {
      process.env.STRIPE_CONNECT_ENABLED = value;
      expect(() => stripeConnectOnboardingAvailable()).not.toThrow();
      expect(stripeConnectOnboardingAvailable()).toBe(false);
    }
  );

  it('D. explicit literal "true" -> the availability helper can return enabled', () => {
    process.env.STRIPE_CONNECT_ENABLED = "true";
    expect(stripeConnectOnboardingAvailable()).toBe(true);
  });

  it("is re-read on every call, not cached", () => {
    process.env.STRIPE_CONNECT_ENABLED = "true";
    expect(stripeConnectOnboardingAvailable()).toBe(true);
    process.env.STRIPE_CONNECT_ENABLED = "false";
    expect(stripeConnectOnboardingAvailable()).toBe(false);
  });

  it("is a genuinely separate config source from PAYMENT_MODE and CLOSED_BETA_MODE — reproduces the exact BETA-LAUNCH1 P0 scenario: PAYMENT_MODE=live, CLOSED_BETA_MODE=inactive, still disabled by default", () => {
    const originalPaymentMode = process.env.PAYMENT_MODE;
    const originalClosedBeta = process.env.CLOSED_BETA_MODE;
    process.env.PAYMENT_MODE = "live";
    process.env.CLOSED_BETA_MODE = "inactive";
    delete process.env.STRIPE_CONNECT_ENABLED;
    expect(stripeConnectOnboardingAvailable()).toBe(false);
    if (originalPaymentMode === undefined) delete process.env.PAYMENT_MODE;
    else process.env.PAYMENT_MODE = originalPaymentMode;
    if (originalClosedBeta === undefined) delete process.env.CLOSED_BETA_MODE;
    else process.env.CLOSED_BETA_MODE = originalClosedBeta;
  });
});
