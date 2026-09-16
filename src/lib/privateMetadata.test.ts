import { describe, expect, it } from "vitest";
import { privateSurfaceMetadata } from "./privateMetadata";

// SEO-PRIVATE-NOINDEX1 — the single shared metadata object every
// authenticated/private, admin, and hybrid (token-gated but
// unauthenticated) route-group layout exports, so a private page can
// never render an indexable metadata response regardless of what (if
// anything) its own page-level generateMetadata sets.

describe("privateSurfaceMetadata", () => {
  it("is exactly noindex,nofollow — never index or follow", () => {
    expect(privateSurfaceMetadata.robots).toEqual({ index: false, follow: false });
  });

  // SEO-PRIVATE-NOINDEX1 re-audit — `alternates: {}` is deliberately
  // present (not omitted) so it blocks inheritance of the root layout's
  // own canonical/hreflang (which points at the homepage) per Next's
  // per-key metadata merge rule; see privateMetadata.ts's own doc
  // comment for the full finding.
  it("clears alternates (canonical/hreflang) so no private/admin page ever inherits the homepage's canonical", () => {
    expect(privateSurfaceMetadata.alternates).toEqual({});
  });

  it("declares no other top-level metadata keys beyond robots/alternates, so title/description/OG continue to be inherited from the root layout rather than silently replaced", () => {
    expect(Object.keys(privateSurfaceMetadata).sort()).toEqual(["alternates", "robots"]);
  });
});
