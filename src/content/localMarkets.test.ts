import { describe, expect, it } from "vitest";
import { localMarkets, getLocalMarket } from "./localMarkets";

// SEO-3 — local-market expansion guardrail. This registry is the single
// gate for /tutoring/[city] pages: a page exists only for a slug listed
// here, and this list is never derived from live TutorProfile.city values.
// These tests protect the guardrail's shape, not any particular city count
// — Edmonton is currently the only real, verified market.

describe("localMarkets", () => {
  it("has no duplicate slugs", () => {
    const slugs = localMarkets.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("seeds exactly the platform's real, current market (Edmonton, AB) — any addition is a deliberate, documented decision, not this test's concern", () => {
    expect(localMarkets).toHaveLength(1);
    expect(localMarkets[0]).toEqual({ slug: "edmonton", city: "Edmonton", province: "AB" });
  });

  it("getLocalMarket resolves a known slug and returns undefined for an unlisted one", () => {
    expect(getLocalMarket("edmonton")).toBeDefined();
    expect(getLocalMarket("toronto")).toBeUndefined();
    expect(getLocalMarket("")).toBeUndefined();
  });
});
