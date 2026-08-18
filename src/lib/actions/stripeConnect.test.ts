import { beforeEach, describe, expect, it, vi } from "vitest";

// Post-FUI-3 security hardening — permanent regression coverage for
// startStripeOnboardingAction's authorization boundary. FutureTutor policy:
// ONLY an APPROVED Tutor may initiate Stripe Connect onboarding. This file
// proves, for every TutorApplicationStatus and every non-TUTOR role, that:
//   (a) the Stripe-touching service (createOnboardingLink) is never called,
//   (b) no redirect to the live onboarding URL occurs, and
//   (c) the authoritative TutorProfile row (via db.tutorProfile.findUnique)
//       is the only source of applicationStatus truth — never the session
//       or client-submitted form data.
// next/navigation's redirect() is mocked to throw (mirroring Next's real
// short-circuiting behavior via NEXT_REDIRECT) so a call path that reaches
// redirect() can be asserted precisely instead of silently falling through.

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findUnique: vi.fn(),
  getAppBaseUrl: vi.fn(),
  paymentsUseStripe: vi.fn(),
  createOnboardingLink: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: { tutorProfile: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/appUrl", () => ({ getAppBaseUrl: mocks.getAppBaseUrl }));
vi.mock("@/lib/paymentMode", () => ({ paymentsUseStripe: mocks.paymentsUseStripe }));
vi.mock("@/services/stripeConnect", () => ({ createOnboardingLink: mocks.createOnboardingLink }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { startStripeOnboardingAction } from "./stripeConnect";
import type { Role } from "@/generated/prisma/enums";
import type { TutorApplicationStatus } from "@/generated/prisma/enums";

function formData(locale = "en") {
  const fd = new FormData();
  fd.set("locale", locale);
  return fd;
}

function sessionFor(role: Role, userId = "user-1") {
  return { user: { id: userId, role } };
}

const NON_APPROVED_STATUSES: TutorApplicationStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "INTERVIEW_REQUIRED",
  "INTERVIEW_COMPLETED",
  "TRAINING_REQUIRED",
  "TRAINING_COMPLETED",
  "EXAM_REQUIRED",
  "EXAM_COMPLETED",
  "FINAL_REVIEW",
  "REJECTED",
  "SUSPENDED",
];

const NON_TUTOR_ROLES: Role[] = ["STUDENT", "PARENT", "ADMIN", "SUPER_ADMIN"];

describe("startStripeOnboardingAction — Stripe Connect authorization hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAppBaseUrl.mockResolvedValue("http://localhost:3100");
    mocks.paymentsUseStripe.mockReturnValue(true);
  });

  it("unauthenticated -> denied, no DB lookup, no Stripe call, no redirect", async () => {
    mocks.auth.mockResolvedValue(null);
    await startStripeOnboardingAction(formData());
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.createOnboardingLink).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each(NON_TUTOR_ROLES)("role=%s -> denied before any DB lookup, no Stripe call, no redirect", async (role) => {
    mocks.auth.mockResolvedValue(sessionFor(role));
    await startStripeOnboardingAction(formData());
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.createOnboardingLink).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("TUTOR with no TutorProfile -> denied, no Stripe call, no redirect", async () => {
    mocks.auth.mockResolvedValue(sessionFor("TUTOR"));
    mocks.findUnique.mockResolvedValue(null);
    await startStripeOnboardingAction(formData());
    expect(mocks.createOnboardingLink).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each(NON_APPROVED_STATUSES)(
    "TUTOR with applicationStatus=%s -> denied before Stripe, no state mutation, no redirect",
    async (applicationStatus) => {
      mocks.auth.mockResolvedValue(sessionFor("TUTOR"));
      mocks.findUnique.mockResolvedValue({
        id: "tutor-profile-1",
        userId: "user-1",
        applicationStatus,
        stripeConnectAccountId: null,
        stripeConnectStatus: "NOT_STARTED",
      });

      await startStripeOnboardingAction(formData());

      expect(mocks.createOnboardingLink).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    }
  );

  it("REJECTED Tutor specifically -> blocked, zero Stripe calls", async () => {
    mocks.auth.mockResolvedValue(sessionFor("TUTOR"));
    mocks.findUnique.mockResolvedValue({ id: "tutor-profile-1", applicationStatus: "REJECTED" });
    await startStripeOnboardingAction(formData());
    expect(mocks.createOnboardingLink).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("SUSPENDED Tutor specifically -> blocked, zero Stripe calls", async () => {
    mocks.auth.mockResolvedValue(sessionFor("TUTOR"));
    mocks.findUnique.mockResolvedValue({ id: "tutor-profile-1", applicationStatus: "SUSPENDED" });
    await startStripeOnboardingAction(formData());
    expect(mocks.createOnboardingLink).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("APPROVED Tutor -> reaches the Connect service and redirects to the returned onboarding URL", async () => {
    mocks.auth.mockResolvedValue(sessionFor("TUTOR"));
    mocks.findUnique.mockResolvedValue({ id: "tutor-profile-1", applicationStatus: "APPROVED" });
    mocks.createOnboardingLink.mockResolvedValue("https://connect.stripe.com/setup/fake-link");

    await expect(startStripeOnboardingAction(formData("fr"))).rejects.toThrow(
      "REDIRECT:https://connect.stripe.com/setup/fake-link"
    );

    expect(mocks.createOnboardingLink).toHaveBeenCalledWith(
      "tutor-profile-1",
      "http://localhost:3100/fr/tutor/payouts?onboarding=return",
      "http://localhost:3100/fr/tutor/payouts?onboarding=refresh"
    );
    expect(mocks.redirect).toHaveBeenCalledTimes(1);
  });

  it("APPROVED Tutor behavior is unchanged when the Connect service throws — falls through to the existing error redirect", async () => {
    mocks.auth.mockResolvedValue(sessionFor("TUTOR"));
    mocks.findUnique.mockResolvedValue({ id: "tutor-profile-1", applicationStatus: "APPROVED" });
    mocks.createOnboardingLink.mockRejectedValue(new Error("simulated Stripe outage"));

    await expect(startStripeOnboardingAction(formData("en"))).rejects.toThrow(
      "REDIRECT:/en/tutor/payouts?onboarding=error"
    );
  });

  it("APPROVED Tutor with payments disabled (PAYMENT_MODE=disabled_dev) -> denied before Stripe, redirected to the error state", async () => {
    mocks.auth.mockResolvedValue(sessionFor("TUTOR"));
    mocks.findUnique.mockResolvedValue({ id: "tutor-profile-1", applicationStatus: "APPROVED" });
    mocks.paymentsUseStripe.mockReturnValue(false);

    await expect(startStripeOnboardingAction(formData("en"))).rejects.toThrow(
      "REDIRECT:/en/tutor/payouts?onboarding=error"
    );

    expect(mocks.createOnboardingLink).not.toHaveBeenCalled();
  });

  it("uses the authenticated session's userId to look up TutorProfile — never a client-submitted profile id", async () => {
    mocks.auth.mockResolvedValue(sessionFor("TUTOR", "the-real-authenticated-user"));
    mocks.findUnique.mockResolvedValue({ id: "tutor-profile-1", applicationStatus: "APPROVED" });
    mocks.createOnboardingLink.mockResolvedValue("https://connect.stripe.com/setup/fake-link");

    const fd = formData();
    fd.set("tutorProfileId", "someone-elses-profile-id"); // forged/extraneous field — must be ignored

    await expect(startStripeOnboardingAction(fd)).rejects.toThrow("REDIRECT:");

    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { userId: "the-real-authenticated-user" } });
    expect(mocks.createOnboardingLink).toHaveBeenCalledWith(
      "tutor-profile-1",
      expect.any(String),
      expect.any(String)
    );
  });
});
