import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// SEO-PRIVATE-NOINDEX1 — deterministic route indexation policy tests.
// Component .tsx files with next/image or DB-query dependencies cannot be
// imported directly into vitest's plain "node" environment (confirmed
// this session — importing one fails with a React.createContext error),
// so — matching this codebase's own established convention
// (moneyPageInternalLinks.test.ts, instrumentation.test.ts) — indexation
// wiring is proven by reading each page's source text and asserting the
// exact metadata call/absence, rather than rendering.
//
// This file is a SOURCE POLICY certification layer: it proves what each
// route's own code declares. It does not and cannot observe live HTML —
// that is certified separately, in production, by curl (see the mission's
// own final report for the LIVE HTML CERTIFIED / REDIRECT PATH CERTIFIED
// distinction).

const localeRoot = join(__dirname, "[locale]");

function readPage(...segments: string[]): string {
  return readFileSync(join(localeRoot, ...segments, "page.tsx"), "utf8");
}

describe("PUBLIC_INDEXABLE — no route in this list ever passes index:false", () => {
  const publicIndexablePages = [
    { name: "homepage", segments: [] },
    { name: "find-tutors", segments: ["find-tutors"] },
    { name: "how-it-works", segments: ["how-it-works"] },
    { name: "become-a-tutor", segments: ["become-a-tutor"] },
    { name: "tutoring/[city] (Edmonton)", segments: ["tutoring", "[city]"] },
    { name: "resources (index)", segments: ["resources"] },
    { name: "resources/[slug] (published article)", segments: ["resources", "[slug]"] },
    { name: "subjects (hub)", segments: ["subjects"] },
    { name: "subjects/[subject]", segments: ["subjects", "[subject]"] },
    { name: "about", segments: ["about"] },
  ];

  it.each(publicIndexablePages)("$name calls publicPageMetadata without index:false", ({ segments }) => {
    const source = readPage(...segments);
    expect(source).toContain("publicPageMetadata(");
    expect(source).not.toMatch(/index:\s*false/);
  });
});

describe("AUTH_UTILITY_NOINDEX — every auth-utility page explicitly passes index:false, and the shared helper now produces follow:false", () => {
  const authUtilityPages = ["login", "signup", "forgot-password", "reset-password", "verify-email", "check-email"];

  it.each(authUtilityPages)("%s/page.tsx passes index: false", (dir) => {
    const source = readPage(dir);
    expect(source).toContain("publicPageMetadata(");
    expect(source).toMatch(/index:\s*false/);
  });

  it("publicPageMetadata's index:false branch produces { index: false, follow: false } — not follow:true — matching this mission's own policy", () => {
    const source = readFileSync(join(__dirname, "..", "lib", "publicMetadata.ts"), "utf8");
    expect(source).toContain("robots: index ? undefined : { index: false, follow: false }");
  });
});

describe("PRIVATE_AUTHENTICATED_NOINDEX / ADMIN_INTERNAL_NOINDEX — every real page under the 7 protected route groups declares no page-level robots override", () => {
  // If any of these pages set their own `robots` key, it would fully
  // replace (not merge with) the inherited noindex,nofollow from the
  // shared route-group layout — Next's own documented per-key merge
  // behavior. This sweeps every real page.tsx under the 7 groups
  // privateRouteLayouts.test.ts already proves are noindex,nofollow at
  // the layout level, and confirms none of them defeats that.
  const protectedGroups = ["dashboard", "tutor", "messages", "notifications", "session", "admin", "family"];

  function listPageFiles(dir: string): string[] {
    const results: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) results.push(...listPageFiles(full));
      else if (entry.name === "page.tsx") results.push(full);
    }
    return results;
  }

  for (const group of protectedGroups) {
    const groupDir = join(localeRoot, group);
    const pageFiles = listPageFiles(groupDir);

    it(`${group} has at least one real page.tsx under it (sanity — the sweep below isn't vacuously trivially true)`, () => {
      expect(pageFiles.length).toBeGreaterThan(0);
    });

    it.each(pageFiles.map((f) => ({ file: f.slice(groupDir.length) })))(`${group}$file declares no page-level robots override`, ({ file }) => {
      const source = readFileSync(join(groupDir, file), "utf8");
      expect(source).not.toMatch(/\brobots\s*:/);
    });
  }
});

describe("Dynamic route determinism — noindex for private dynamic-ID routes does not depend on the ID value", () => {
  it("dashboard/family/[studentProfileId] and session/[bookingId] rely purely on shared-layout inheritance, never a page-level robots check keyed on the ID", () => {
    for (const segments of [
      ["dashboard", "family", "[studentProfileId]"],
      ["session", "[bookingId]"],
      ["messages", "[conversationId]"],
    ]) {
      const source = readPage(...segments);
      expect(source, segments.join("/")).not.toMatch(/\brobots\s*:/);
    }
  });

  it("the public dynamic /tutors/[slug] route calls notFound() for any non-APPROVED or nonexistent slug before ever returning indexable metadata — no database ID is exposed in metadata", () => {
    const source = readPage("tutors", "[slug]");
    expect(source).toContain("notFound()");
    expect(source).toContain('applicationStatus: "APPROVED"');
    // No metadata field should ever be built from tutor.id (a database
    // identifier) — only slug/name/headline-shaped public fields.
    expect(source).not.toMatch(/description:\s*[^,}]*tutor\.id/);
  });

  it("family/invite/[token] (hybrid — public but token-gated) sets no page-level robots, so it inherits noindex,nofollow from family/layout.tsx despite being reachable without authentication", () => {
    const source = readPage("family", "invite", "[token]");
    expect(source).not.toMatch(/\brobots\s*:/);
  });
});

describe("Canonical/hreflang leakage — the exact defect this mission's re-audit found and fixed", () => {
  it("privateSurfaceMetadata clears alternates so it can never inherit the root layout's homepage canonical/hreflang", () => {
    const source = readFileSync(join(__dirname, "..", "lib", "privateMetadata.ts"), "utf8");
    expect(source).toMatch(/alternates:\s*\{\s*\}/);
  });

  it("none of the 7 protected route-group layouts themselves declare their own alternates (would silently reintroduce a different leak)", () => {
    for (const group of ["dashboard", "tutor", "messages", "notifications", "session", "admin", "family"]) {
      const source = readFileSync(join(localeRoot, group, "layout.tsx"), "utf8");
      expect(source, group).not.toMatch(/alternates:/);
    }
  });
});

describe("Redirect-only routes", () => {
  it("/launch never renders HTML — it always redirects, so it carries no metadata of its own and needs none", () => {
    const source = readPage("launch");
    expect(source).toContain("redirect(");
    expect(source).not.toMatch(/generateMetadata|export const metadata/);
  });
});

describe("robots.txt does not contradict the auth-utility noindex strategy", () => {
  it("does not Disallow the 6 auth-utility paths — they must stay crawlable so Googlebot can actually see their noindex meta tag (Disallow would hide it)", () => {
    const source = readFileSync(join(__dirname, "robots.ts"), "utf8");
    for (const path of ["login", "signup", "forgot-password", "reset-password", "verify-email", "check-email"]) {
      expect(source, path).not.toMatch(new RegExp(`["'].*${path}`));
    }
  });
});
