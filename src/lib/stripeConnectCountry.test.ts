import { describe, it, expect, vi, beforeEach } from "vitest";

// PROD-CONNECT-V2-COUNTRYFIX1 — permanent unit tests for the Stripe
// Connect account-country resolver. Pure, no DB, no Stripe client.

describe("stripeConnectAccountCountry", () => {
  it("B/documents current design. resolves to the ISO 3166-1 alpha-2 code for FutureTutor's current, canonical, single-country product design (Canada)", async () => {
    const { stripeConnectAccountCountry } = await import("./stripeConnectCountry");
    expect(stripeConnectAccountCountry()).toBe("CA");
  });

  it("C. the resolved value is never a province code — it is always the fixed 2-letter ISO country code, structurally distinct from any of the 13 Canadian province/territory codes", async () => {
    const { stripeConnectAccountCountry } = await import("./stripeConnectCountry");
    const { CANADIAN_PROVINCES_AND_TERRITORIES } = await import("./canadianProvinces");
    const country = stripeConnectAccountCountry();
    expect(CANADIAN_PROVINCES_AND_TERRITORIES).not.toContain(country);
  });

  it("never throws for the current, supported canonical value", async () => {
    const { stripeConnectAccountCountry } = await import("./stripeConnectCountry");
    expect(() => stripeConnectAccountCountry()).not.toThrow();
  });
});

describe("stripeConnectAccountCountry — F. fails closed for an unrecognized canonical source value", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("throws UnsupportedStripeConnectCountryError rather than silently guessing, if site.country is ever something this map doesn't recognize", async () => {
    vi.doMock("@/content/site", () => ({ site: { name: "FutureTutor", url: "https://example.com", country: "Atlantis", twitterHandle: "@x" } }));
    const { stripeConnectAccountCountry, UnsupportedStripeConnectCountryError } = await import("./stripeConnectCountry");
    expect(() => stripeConnectAccountCountry()).toThrow(UnsupportedStripeConnectCountryError);
    vi.doUnmock("@/content/site");
  });

  it("the thrown error never substitutes a different/default country — no value is returned, only a throw", async () => {
    vi.doMock("@/content/site", () => ({ site: { name: "FutureTutor", url: "https://example.com", country: "", twitterHandle: "@x" } }));
    const { stripeConnectAccountCountry } = await import("./stripeConnectCountry");
    expect(() => stripeConnectAccountCountry()).toThrow();
    vi.doUnmock("@/content/site");
  });
});
