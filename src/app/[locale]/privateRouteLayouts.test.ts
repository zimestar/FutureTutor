import { describe, expect, it } from "vitest";
import DashboardLayout, { metadata as dashboardMetadata } from "./dashboard/layout";
import TutorPrivateLayout, { metadata as tutorMetadata } from "./tutor/layout";
import MessagesLayout, { metadata as messagesMetadata } from "./messages/layout";
import NotificationsLayout, { metadata as notificationsMetadata } from "./notifications/layout";
import SessionLayout, { metadata as sessionMetadata } from "./session/layout";
import AdminLayout, { metadata as adminMetadata } from "./admin/layout";
import FamilyLayout, { metadata as familyMetadata } from "./family/layout";

// SEO-PRIVATE-NOINDEX1 — every authenticated/private, admin, and hybrid
// (token-gated but unauthenticated) route group gets ONE new, metadata-only
// layout.tsx at its shared root, so every page beneath it — regardless of
// whether that page defines its own partial metadata (several do, e.g.
// dashboard/find-tutors/page.tsx sets title/description but not robots) —
// inherits noindex,nofollow. None of these new layouts touch or duplicate
// any existing auth check (requireAdminPermission, per-page auth()
// redirects, proxy.ts's protectedSection) — they are pure metadata +
// passthrough, proven here by asserting the default export returns its
// children completely unchanged.

const cases = [
  { name: "dashboard (student/parent private)", Layout: DashboardLayout, metadata: dashboardMetadata },
  { name: "tutor (tutor private)", Layout: TutorPrivateLayout, metadata: tutorMetadata },
  { name: "messages (messaging)", Layout: MessagesLayout, metadata: messagesMetadata },
  { name: "notifications", Layout: NotificationsLayout, metadata: notificationsMetadata },
  { name: "session", Layout: SessionLayout, metadata: sessionMetadata },
  { name: "admin", Layout: AdminLayout, metadata: adminMetadata },
  { name: "family (hybrid — public but token-gated)", Layout: FamilyLayout, metadata: familyMetadata },
];

describe.each(cases)("$name private route-group layout", ({ Layout, metadata }) => {
  it("exports noindex,nofollow robots metadata", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  // SEO-PRIVATE-NOINDEX1 re-audit — the root `[locale]/layout.tsx` sets
  // `alternates: { canonical: "/${locale}", languages: {...} }` (the
  // homepage's own canonical/hreflang) as the app-wide default. None of
  // the real pages under these 7 route groups set their own `alternates`,
  // so every one of them was inheriting the homepage's canonical/hreflang
  // as its own effective metadata before this fix — a private/admin page
  // must never advertise itself, or anything else, as a canonical public
  // SEO destination.
  it("clears alternates (canonical/hreflang) — no leaked public canonical destination", () => {
    expect(metadata.alternates).toEqual({});
  });

  it("is a pure passthrough — renders its children completely unchanged, no auth/redirect logic of its own", () => {
    const marker = { probe: "unchanged" };
    // @ts-expect-error — the real prop type is ReactNode; a plain object is
    // sufficient here to prove strict reference passthrough.
    expect(Layout({ children: marker })).toBe(marker);
  });
});
