import { afterEach, describe, expect, it } from "vitest";
import { isProductionAnalyticsEnvironment } from "./environment";

// DATA-1 — analytics may only ever activate on the real production
// hostname (site.url's own host — the same single upstream source
// canonical/hreflang/sitemap/robots already use). Never localhost, never
// a Railway preview/staging deployment.

afterEach(() => {
  // @ts-expect-error — test-only cleanup.
  delete globalThis.window;
});

describe("isProductionAnalyticsEnvironment", () => {
  it("is false when running server-side (no window)", () => {
    expect(isProductionAnalyticsEnvironment()).toBe(false);
  });

  it("is true on the real production hostname", () => {
    // @ts-expect-error — minimal test-only window stub.
    globalThis.window = { location: { hostname: "futuretutor.ca" } };
    expect(isProductionAnalyticsEnvironment()).toBe(true);
  });

  it("is false on localhost", () => {
    // @ts-expect-error — minimal test-only window stub.
    globalThis.window = { location: { hostname: "localhost" } };
    expect(isProductionAnalyticsEnvironment()).toBe(false);
  });

  it("is false on a Railway preview/staging hostname", () => {
    // @ts-expect-error — minimal test-only window stub.
    globalThis.window = { location: { hostname: "futuretutor-production.up.railway.app" } };
    expect(isProductionAnalyticsEnvironment()).toBe(false);

    // @ts-expect-error — minimal test-only window stub.
    globalThis.window = { location: { hostname: "staging.futuretutor.ca" } };
    expect(isProductionAnalyticsEnvironment()).toBe(false);
  });

  it("is false on the bare www subdomain (not the canonical apex — SEO-INFRA-WWW1)", () => {
    // @ts-expect-error — minimal test-only window stub.
    globalThis.window = { location: { hostname: "www.futuretutor.ca" } };
    expect(isProductionAnalyticsEnvironment()).toBe(false);
  });
});
