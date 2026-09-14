import { describe, expect, it } from "vitest";
import { isAnalyticsEligiblePath } from "./routePolicy";

// DATA-1 — deterministic analytics-eligibility route policy. Independent
// of the SEO-PRIVATE-NOINDEX1 noindex layer (a page can be noindexed for
// SEO reasons and still eligible for analytics, or vice versa — these are
// two separate questions) but the underlying route classification matches
// it exactly: private/admin/auth-utility routes are excluded here too.

describe("isAnalyticsEligiblePath — public marketing surfaces (eligible)", () => {
  it.each([
    "/en",
    "/fr",
    "/en/find-tutors",
    "/fr/find-tutors",
    "/en/tutoring/edmonton",
    "/fr/tutoring/edmonton",
    "/en/resources",
    "/en/resources/how-to-choose-a-tutor",
    "/en/subjects",
    "/en/subjects/math",
    "/en/how-it-works",
    "/en/become-a-tutor",
    "/en/tutor-resources",
    "/en/tutors/matthew-allen",
    "/en/about",
    "/en/contact",
  ])("%s is eligible", (path) => {
    expect(isAnalyticsEligiblePath(path)).toBe(true);
  });
});

describe("isAnalyticsEligiblePath — private/admin surfaces (excluded)", () => {
  it.each([
    "/en/dashboard",
    "/en/dashboard/bookings",
    "/fr/dashboard",
    "/en/tutor/dashboard",
    "/en/tutor/payouts",
    "/en/messages",
    "/en/messages/abc123",
    "/en/notifications",
    "/en/session/abc123",
    "/en/session/abc123/classroom",
    "/en/admin",
    "/en/admin/tutors",
    "/en/family/invite/some-token",
  ])("%s is excluded", (path) => {
    expect(isAnalyticsEligiblePath(path)).toBe(false);
  });
});

describe("isAnalyticsEligiblePath — auth utility surfaces (excluded)", () => {
  it.each(["/en/login", "/fr/login", "/en/signup", "/en/forgot-password", "/en/reset-password", "/en/verify-email", "/en/check-email"])(
    "%s is excluded",
    (path) => {
      expect(isAnalyticsEligiblePath(path)).toBe(false);
    },
  );
});

describe("isAnalyticsEligiblePath — segment-boundary precision", () => {
  it("never excludes the public plural /tutors/[slug] via a naive '/tutor' prefix match", () => {
    expect(isAnalyticsEligiblePath("/en/tutors/matthew-allen")).toBe(true);
  });

  it("never excludes /tutor-resources or /tutor-agreement via a naive '/tutor' prefix match", () => {
    expect(isAnalyticsEligiblePath("/en/tutor-resources")).toBe(true);
    expect(isAnalyticsEligiblePath("/en/tutor-agreement")).toBe(true);
  });

  it("excludes /admin but not a path that merely starts with the same letters", () => {
    expect(isAnalyticsEligiblePath("/en/admin")).toBe(false);
    expect(isAnalyticsEligiblePath("/en/administration-guide")).toBe(true);
  });
});
