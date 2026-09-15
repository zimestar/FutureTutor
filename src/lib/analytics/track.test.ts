import { afterEach, describe, expect, it } from "vitest";
import { trackEvent } from "./track";

// DATA-1 — trackEvent is the single call surface every component uses.
// These tests exercise its three runtime safety checks (PII denylist,
// route eligibility, analytics consent) end-to-end, on top of the
// compile-time property allowlist already enforced by
// AnalyticsEventPropertiesMap. Consent defaults to "granted" in most
// cases here so the pre-existing PII/route assertions keep testing
// exactly one thing each; the dedicated "consent gating" block below is
// what actually exercises the consent dimension.

function installFakeBrowser(pathname: string, consent: "granted" | "denied" | "undecided" = "granted") {
  const pushed: unknown[] = [];
  const store = new Map<string, string>();
  if (consent !== "undecided") {
    store.set("futuretutor_consent_v1", JSON.stringify({ analytics: consent, policyVersion: "2026-08-30", decidedAt: new Date().toISOString() }));
  }
  const fakeLocalStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  };
  // Minimal test-only window stub. Cast through `unknown` rather than a
  // per-line @ts-expect-error, since diagnostics for a multi-line object
  // literal land on nested property lines, not the assignment itself.
  globalThis.window = {
    location: { pathname },
    localStorage: fakeLocalStorage,
    dataLayer: { push: (item: unknown) => pushed.push(item) },
  } as unknown as Window & typeof globalThis;
  return pushed;
}

afterEach(() => {
  // @ts-expect-error — test-only cleanup.
  delete globalThis.window;
});

describe("trackEvent", () => {
  it("forwards a well-formed event from an eligible public route with consent granted", () => {
    const pushed = installFakeBrowser("/en/find-tutors", "granted");
    trackEvent("find_tutor_cta_clicked", { locale: "en", cta_location: "header" });
    expect(pushed).toEqual([{ event: "find_tutor_cta_clicked", locale: "en", cta_location: "header" }]);
  });

  it("drops an event fired from an analytics-excluded route (e.g. a shared component rendered on a private page)", () => {
    const pushed = installFakeBrowser("/en/dashboard", "granted");
    trackEvent("find_tutor_cta_clicked", { locale: "en", cta_location: "header" });
    expect(pushed).toEqual([]);
  });

  it("drops an event whose properties contain a denylisted key, even if it bypassed the compile-time type", () => {
    const pushed = installFakeBrowser("/en/find-tutors", "granted");
    // Deliberately bypass the compile-time allowlist to prove the runtime
    // denylist is real defense-in-depth, not decorative.
    trackEvent("find_tutor_cta_clicked", { locale: "en", cta_location: "header", email: "user@example.com" } as never);
    expect(pushed).toEqual([]);
  });

  it("works server-side (no window) without throwing — used from server components", () => {
    expect(() => trackEvent("futuretutor_page_view", { locale: "en", page_type: "homepage" })).not.toThrow();
  });

  it("each call is forwarded independently — no accidental deduplication of distinct legitimate events", () => {
    const pushed = installFakeBrowser("/en/resources/how-to-choose-a-tutor", "granted");
    trackEvent("resource_article_viewed", { locale: "en", resource_slug: "how-to-choose-a-tutor" });
    trackEvent("resource_primary_cta_clicked", { resource_slug: "how-to-choose-a-tutor" });
    expect(pushed).toHaveLength(2);
  });
});

describe("trackEvent — consent gating (DATA-1 Consent Activation)", () => {
  it("drops every event when consent is undecided (fresh visitor, banner not yet answered)", () => {
    const pushed = installFakeBrowser("/en/find-tutors", "undecided");
    trackEvent("find_tutor_cta_clicked", { locale: "en", cta_location: "header" });
    expect(pushed).toEqual([]);
  });

  it("drops every event when consent was explicitly denied (reject)", () => {
    const pushed = installFakeBrowser("/en/find-tutors", "denied");
    trackEvent("find_tutor_cta_clicked", { locale: "en", cta_location: "header" });
    expect(pushed).toEqual([]);
  });

  it("forwards events once consent is granted (accept)", () => {
    const pushed = installFakeBrowser("/en/find-tutors", "granted");
    trackEvent("find_tutor_cta_clicked", { locale: "en", cta_location: "header" });
    expect(pushed).toEqual([{ event: "find_tutor_cta_clicked", locale: "en", cta_location: "header" }]);
  });

  it("stops forwarding future events immediately after revocation, without a page reload", () => {
    const pushed = installFakeBrowser("/en/find-tutors", "granted");
    trackEvent("find_tutor_cta_clicked", { locale: "en", cta_location: "header" });
    expect(pushed).toHaveLength(1);

    // Simulate revokeAnalyticsConsent() resetting localStorage back to
    // undecided, in the same page (no reload) — the exact sequence
    // CookiePreferencesControl triggers before its own reload.
    globalThis.window.localStorage.removeItem("futuretutor_consent_v1");
    trackEvent("find_tutor_cta_clicked", { locale: "en", cta_location: "header" });
    expect(pushed).toHaveLength(1);
  });

  it("fails closed to no-tracking when localStorage throws (private browsing / storage disabled)", () => {
    installFakeBrowser("/en/find-tutors", "granted");
    const pushed: unknown[] = [];
    // Test-only window override: storage access throws. Cast through
    // `unknown` for the same multi-line-literal reason as installFakeBrowser.
    globalThis.window = {
      location: { pathname: "/en/find-tutors" },
      localStorage: {
        getItem: () => {
          throw new Error("storage disabled");
        },
      },
      dataLayer: { push: (item: unknown) => pushed.push(item) },
    } as unknown as Window & typeof globalThis;
    expect(() => trackEvent("find_tutor_cta_clicked", { locale: "en", cta_location: "header" })).not.toThrow();
    expect(pushed).toEqual([]);
  });
});
