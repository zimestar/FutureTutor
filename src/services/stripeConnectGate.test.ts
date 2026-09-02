import { beforeEach, describe, expect, it, vi } from "vitest";

// BETA-LAUNCHFIX1 — permanent, fully-mocked unit coverage proving
// ensureConnectAccount stops BEFORE any database read or Stripe SDK call
// when Stripe Connect onboarding is disabled — the authoritative backstop
// behind startStripeOnboardingAction's own early-exit (see
// src/lib/actions/stripeConnectGate.test.ts for the action-layer coverage).
// Deliberately a plain unit test (not .integration.test.ts) — both the DB
// and the Stripe client are mocked so this proves the gate fires before
// either is ever touched, without needing a real database.

const mocks = vi.hoisted(() => ({
  stripeConnectOnboardingAvailable: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  getStripeClient: vi.fn(),
}));

vi.mock("@/lib/stripeConnectConfig", () => ({
  stripeConnectOnboardingAvailable: mocks.stripeConnectOnboardingAvailable,
}));
vi.mock("@/lib/db", () => ({
  db: { tutorProfile: { findUniqueOrThrow: mocks.findUniqueOrThrow, updateMany: vi.fn() } },
}));
vi.mock("@/lib/stripe", () => ({ getStripeClient: mocks.getStripeClient }));

import { ensureConnectAccount, createOnboardingLink, StripeConnectDisabledError } from "./stripeConnect";

describe("ensureConnectAccount — BETA-LAUNCHFIX1 Connect availability gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("F/G. gate disabled -> throws StripeConnectDisabledError before ANY database read or Stripe client construction — reproduces the exact BETA-LAUNCH1 P0 scenario (an otherwise-fully-eligible APPROVED tutor still cannot create an account)", async () => {
    mocks.stripeConnectOnboardingAvailable.mockReturnValue(false);
    // Configure the DB mock as if a real, fully-eligible APPROVED tutor
    // exists — proving the rejection is NOT because the tutor lookup failed,
    // but because the gate itself stops execution first.
    mocks.findUniqueOrThrow.mockResolvedValue({
      id: "tutor-profile-1",
      applicationStatus: "APPROVED",
      stripeConnectAccountId: null,
      user: { email: "tutor@example.com" },
    });

    await expect(ensureConnectAccount("tutor-profile-1")).rejects.toThrow(StripeConnectDisabledError);

    expect(mocks.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(mocks.getStripeClient).not.toHaveBeenCalled();
  });

  it("F. createOnboardingLink (a crafted/direct caller bypassing the Server Action entirely) is stopped identically — it delegates to ensureConnectAccount first, so no Account Link call is ever reached either", async () => {
    mocks.stripeConnectOnboardingAvailable.mockReturnValue(false);

    await expect(
      createOnboardingLink("tutor-profile-1", "https://example.com/return", "https://example.com/refresh")
    ).rejects.toThrow(StripeConnectDisabledError);

    expect(mocks.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(mocks.getStripeClient).not.toHaveBeenCalled();
  });

  it("the gate is re-read on every call, not cached — flipping it mid-process is picked up immediately", async () => {
    mocks.stripeConnectOnboardingAvailable.mockReturnValue(false);
    await expect(ensureConnectAccount("tutor-profile-1")).rejects.toThrow(StripeConnectDisabledError);

    mocks.stripeConnectOnboardingAvailable.mockReturnValue(true);
    mocks.findUniqueOrThrow.mockResolvedValue({
      id: "tutor-profile-1",
      stripeConnectAccountId: "acct_already_exists",
      user: { email: "tutor@example.com" },
    });
    // With the gate now enabled and an account already on file, the
    // function's own existing idempotent short-circuit returns it directly
    // — proving execution genuinely proceeds past the gate this time,
    // without needing a real Stripe client mock for this assertion.
    await expect(ensureConnectAccount("tutor-profile-1")).resolves.toBe("acct_already_exists");
  });
});
