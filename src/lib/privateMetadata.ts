import type { Metadata } from "next";

/**
 * SEO-PRIVATE-NOINDEX1 — structural noindex for every authenticated/
 * private and admin route group (dashboard, tutor, messages,
 * notifications, session, admin, family). Defense-in-depth alongside the
 * real auth()/requireAdminPermission gates and robots.txt's Disallow
 * rules for these same paths — this ensures a private page can never
 * render an indexable metadata response even if reached directly, no
 * matter what (if anything) an individual page's own generateMetadata
 * sets, since Next.js only overrides the specific metadata keys a child
 * defines and otherwise inherits the nearest ancestor's value — so a
 * layout exporting only `robots` here overrides just that key for every
 * page beneath it, public marketing pages included elsewhere in the tree
 * are entirely unaffected.
 *
 * SEO-PRIVATE-NOINDEX1 re-audit finding: the root `[locale]/layout.tsx`
 * sets `alternates: { canonical: "/${locale}", languages: {...} }` (the
 * homepage's own canonical/hreflang) as the app-wide default. Confirmed
 * that none of the 49 real pages across these 7 route groups set their
 * own `alternates` — so every one of them was inheriting the homepage's
 * canonical/hreflang as its own effective metadata, exactly the
 * "leakage" this mission's own Phase 5 warns against. `alternates: {}`
 * here (an empty-but-present object) is what actually blocks that
 * inheritance per Next's per-key merge rule — a private/admin page has no
 * legitimate canonical or hreflang destination, so it gets none.
 */
export const privateSurfaceMetadata: Metadata = {
  robots: { index: false, follow: false },
  alternates: {},
};
