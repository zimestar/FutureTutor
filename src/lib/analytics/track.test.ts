import { afterEach, describe, expect, it } from "vitest";
import { trackEvent } from "./track";

// DATA-1 — trackEvent is the single call surface every component uses.
// These tests exercise its two runtime safety checks (PII denylist,
// route eligibility) end-to-end, on top of the compile-time property
// allowlist already enforced by AnalyticsEventPropertiesMap.

function installFakeBrowser(pathname: string) {
  const pushed: unknown[] = [];
  // @ts-expect-error — minimal test-only window stub.
  globalThis.window = { location: { pathname }, dataLayer: { push: (item: unknown) => pushed.push(item) } };
  return pushed;
}

afterEach(() => {
  // @ts-expect-error — test-only cleanup.
  delete globalThis.window;
});

describe("trackEvent", () => {
  it("forwards a well-formed event from an eligible public route", () => {
    const pushed = installFakeBrowser("/en/find-tutors");
    trackEvent("find_tutor_cta_clicked", { locale: "en", cta_location: "header" });
    expect(pushed).toEqual([{ event: "find_tutor_cta_clicked", locale: "en", cta_location: "header" }]);
  });

  it("drops an event fired from an analytics-excluded route (e.g. a shared component rendered on a private page)", () => {
    const pushed = installFakeBrowser("/en/dashboard");
    trackEvent("find_tutor_cta_clicked", { locale: "en", cta_location: "header" });
    expect(pushed).toEqual([]);
  });

  it("drops an event whose properties contain a denylisted key, even if it bypassed the compile-time type", () => {
    const pushed = installFakeBrowser("/en/find-tutors");
    // Deliberately bypass the compile-time allowlist to prove the runtime
    // denylist is real defense-in-depth, not decorative.
    trackEvent("find_tutor_cta_clicked", { locale: "en", cta_location: "header", email: "user@example.com" } as never);
    expect(pushed).toEqual([]);
  });

  it("works server-side (no window) without throwing — used from server components", () => {
    expect(() => trackEvent("futuretutor_page_view", { locale: "en", page_type: "homepage" })).not.toThrow();
  });

  it("each call is forwarded independently — no accidental deduplication of distinct legitimate events", () => {
    const pushed = installFakeBrowser("/en/resources/how-to-choose-a-tutor");
    trackEvent("resource_article_viewed", { locale: "en", resource_slug: "how-to-choose-a-tutor" });
    trackEvent("resource_primary_cta_clicked", { resource_slug: "how-to-choose-a-tutor" });
    expect(pushed).toHaveLength(2);
  });
});
