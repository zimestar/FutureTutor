import { beforeEach, describe, expect, it, vi } from "vitest";

// BETA-LAUNCHFIX1 — permanent regression coverage for
// startStripeOnboardingAction's Connect availability gate, isolated from
// stripeConnect.test.ts's existing role/applicationStatus authorization
// coverage (which now defaults the gate to available so its own tests stay
// unaffected — see that file). This proves the exact BETA-LAUNCH1 P0
// scenario: an APPROVED tutor, with paymentsUseStripe() true (PAYMENT_MODE
// live), is still stopped before any database read or Stripe call when the
// Connect gate is disabled.

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findUnique: vi.fn(),
  getAppBaseUrl: vi.fn(),
  paymentsUseStripe: vi.fn(),
  stripeConnectOnboardingAvailable: vi.fn(),
  createOnboardingLink: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: { tutorProfile: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/appUrl", () => ({ getAppBaseUrl: mocks.getAppBaseUrl }));
vi.mock("@/lib/paymentMode", () => ({ paymentsUseStripe: mocks.paymentsUseStripe }));
vi.mock("@/lib/stripeConnectConfig", () => ({ stripeConnectOnboardingAvailable: mocks.stripeConnectOnboardingAvailable }));
vi.mock("@/services/stripeConnect", () => ({ createOnboardingLink: mocks.createOnboardingLink }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { startStripeOnboardingAction } from "./stripeConnect";

function formData(locale = "en") {
  const fd = new FormData();
  fd.set("locale", locale);
  return fd;
}

function approvedTutorSession() {
  return { user: { id: "user-1", role: "TUTOR" as const } };
}

describe("startStripeOnboardingAction — BETA-LAUNCHFIX1 Connect availability gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAppBaseUrl.mockResolvedValue("http://localhost:3100");
    // Reproduces production's exact configuration: PAYMENT_MODE=live, so
    // paymentsUseStripe() is true — this alone must NOT be enough to reach
    // Stripe once the Connect gate is disabled.
    mocks.paymentsUseStripe.mockReturnValue(true);
  });

  it("E/G. gate disabled + APPROVED tutor + paymentsUseStripe()=true -> rejected before any DB read, before createOnboardingLink, before redirect — the exact BETA-LAUNCH1 P0 reproduced and proven fixed", async () => {
    mocks.auth.mockResolvedValue(approvedTutorSession());
    mocks.stripeConnectOnboardingAvailable.mockReturnValue(false);
    // Configure findUnique as if the tutor row IS approved and ready — the
    // test would still pass this configuration through to createOnboardingLink
    // if the gate check didn't exist, which is exactly what this proves it
    // no longer does.
    mocks.findUnique.mockResolvedValue({ id: "tutor-profile-1", applicationStatus: "APPROVED" });

    await startStripeOnboardingAction(formData());

    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.createOnboardingLink).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("F. a crafted request with extra/forged fields is still rejected identically while the gate is disabled", async () => {
    mocks.auth.mockResolvedValue(approvedTutorSession());
    mocks.stripeConnectOnboardingAvailable.mockReturnValue(false);
    const fd = formData();
    fd.set("tutorProfileId", "someone-elses-profile-id");
    fd.set("applicationStatus", "APPROVED");

    await startStripeOnboardingAction(fd);

    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.createOnboardingLink).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("re-confirms the normal path still works once the gate is explicitly (mock-)enabled — the gate itself, not some other change, is what was blocking it above", async () => {
    mocks.auth.mockResolvedValue(approvedTutorSession());
    mocks.stripeConnectOnboardingAvailable.mockReturnValue(true);
    mocks.findUnique.mockResolvedValue({ id: "tutor-profile-1", applicationStatus: "APPROVED" });
    mocks.createOnboardingLink.mockResolvedValue("https://connect.stripe.com/setup/fake-link");

    await expect(startStripeOnboardingAction(formData())).rejects.toThrow(
      "REDIRECT:https://connect.stripe.com/setup/fake-link"
    );
    expect(mocks.createOnboardingLink).toHaveBeenCalledTimes(1);
  });
});
