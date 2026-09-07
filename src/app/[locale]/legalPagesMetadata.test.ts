import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ANALYTICS-SEO1 — these 5 pages previously returned a bare
// { title, description } object with no alternates.canonical/languages,
// silently falling back to the root layout's own canonical ("/en"), which
// told Google every one of these pages was a duplicate of the homepage.
// Regression guard: each must import and use the shared
// publicPageMetadata helper, matching the other 16 public pages that
// already did, rather than reintroducing a bespoke bare-object return.

const PAGES = ["terms", "privacy", "cookies", "tutor-agreement", "careers"];

describe.each(PAGES)("%s/page.tsx metadata", (pageDir) => {
  const source = readFileSync(join(__dirname, pageDir, "page.tsx"), "utf8");

  it("imports publicPageMetadata", () => {
    expect(source).toContain('import { publicPageMetadata } from "@/lib/publicMetadata";');
  });

  it("generateMetadata returns publicPageMetadata(...), not a bare object", () => {
    expect(source).toMatch(/return publicPageMetadata\(\{/);
    expect(source).not.toMatch(/return \{ title: t\("title"\), description: t\("description"\) \};/);
  });

  it(`passes its own real path ("/${pageDir}"), never a placeholder or the homepage`, () => {
    expect(source).toContain(`path: "/${pageDir}"`);
  });
});
