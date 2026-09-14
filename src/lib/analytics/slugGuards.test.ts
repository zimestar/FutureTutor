import { describe, expect, it } from "vitest";
import { isKnownSubjectSlug, isKnownResourceSlug, isKnownCitySlug } from "./slugGuards";
import { subjects } from "@/content/subjects";
import { resourceArticles } from "@/content/resources";
import { localMarkets } from "@/content/localMarkets";

// DATA-1 — every slug-shaped analytics property is validated against its
// real, live, certified registry (never treated as free text). These
// tests prove the guard tracks the actual registries, not a hardcoded
// duplicate list, so a future registry change can never silently drift.

describe("isKnownSubjectSlug", () => {
  it("accepts every real subject slug", () => {
    for (const subject of subjects) {
      expect(isKnownSubjectSlug(subject.slug)).toBe(true);
    }
  });

  it("rejects an unknown/fabricated subject slug", () => {
    expect(isKnownSubjectSlug("underwater-basket-weaving")).toBe(false);
  });
});

describe("isKnownResourceSlug", () => {
  it("accepts every real resource article slug", () => {
    for (const article of resourceArticles) {
      expect(isKnownResourceSlug(article.slug)).toBe(true);
    }
  });

  it("rejects an unknown/fabricated resource slug", () => {
    expect(isKnownResourceSlug("does-not-exist")).toBe(false);
  });
});

describe("isKnownCitySlug", () => {
  it("accepts every city on the certified local-market allowlist", () => {
    for (const market of localMarkets) {
      expect(isKnownCitySlug(market.slug)).toBe(true);
    }
  });

  it("rejects a city not on the allowlist (guardrail regression — no expansion sprawl)", () => {
    expect(isKnownCitySlug("toronto")).toBe(false);
    expect(isKnownCitySlug("calgary")).toBe(false);
  });
});
