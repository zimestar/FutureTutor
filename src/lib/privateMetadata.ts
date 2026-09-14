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
 */
export const privateSurfaceMetadata: Metadata = {
  robots: { index: false, follow: false },
};
