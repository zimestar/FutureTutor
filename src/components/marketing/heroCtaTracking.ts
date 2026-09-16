import type { AnalyticsEventPropertiesMap } from "@/lib/analytics";

/**
 * DATA-2 — the href→event map MarketingPageHero.tsx uses to decide which of
 * its primary/secondary CTAs to render as a TrackedCtaButton. Kept in its
 * own plain (non-JSX) file, not inline in MarketingPageHero.tsx, so it can
 * be unit-tested by direct import — importing a "use client" component file
 * that pulls in next/image into a plain vitest "node" environment fails
 * (React.createContext error), the same reason every other component-facing
 * test in this codebase asserts on source text instead. This file has no
 * such dependency, so it's importable directly.
 */
export type HeroCtaTracking =
  | { event: "find_tutor_cta_clicked"; properties: AnalyticsEventPropertiesMap["find_tutor_cta_clicked"] }
  | { event: "become_tutor_cta_clicked"; properties: AnalyticsEventPropertiesMap["become_tutor_cta_clicked"] }
  | { event: "how_it_works_cta_clicked"; properties: AnalyticsEventPropertiesMap["how_it_works_cta_clicked"] }
  | { event: "signup_started"; properties: AnalyticsEventPropertiesMap["signup_started"] }
  | { event: "login_started"; properties: AnalyticsEventPropertiesMap["login_started"] };

export function trackingForHref(href: string): HeroCtaTracking | null {
  switch (href) {
    case "/find-tutors":
      return { event: "find_tutor_cta_clicked", properties: { cta_location: "hero" } };
    case "/become-a-tutor":
      return { event: "become_tutor_cta_clicked", properties: { cta_location: "hero" } };
    case "/how-it-works":
      return { event: "how_it_works_cta_clicked", properties: { cta_location: "hero" } };
    case "/signup":
      return { event: "signup_started", properties: {} };
    case "/login":
      return { event: "login_started", properties: {} };
    default:
      return null;
  }
}
