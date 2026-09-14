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

  it("declares no other top-level metadata keys, so title/description/OG continue to be inherited from the root layout rather than silently replaced", () => {
    expect(Object.keys(privateSurfaceMetadata)).toEqual(["robots"]);
  });
});
