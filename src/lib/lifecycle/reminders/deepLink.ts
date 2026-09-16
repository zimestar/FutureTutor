import { resolveBookingEmailBaseUrl } from "@/lib/email/resolveBookingEmailBaseUrl";
import type { LifecycleJourneyState } from "../types";

/**
 * LIFECYCLE-1B Phase 7 — deep links reuse LIFECYCLE-1A's own
 * `nextAction` field (already a real, canonical, session-scoped app route —
 * e.g. "/tutor/training", "/dashboard/family") and the SAME base-URL
 * resolver already proven safe for transactional email (resolveBookingEmailBaseUrl.ts:
 * HTTPS-only, never localhost, reuses site.url rather than a request
 * header). No new redirect mechanism, no query parameters, and — critically
 * — no database id, email address, or any other PII anywhere in the URL:
 * every existing route this points to resolves the viewer's OWN profile
 * from their authenticated session server-side (confirmed throughout
 * LIFECYCLE-1A's audit — e.g. tutor/dashboard reads
 * `db.tutorProfile.findUnique({ where: { userId: user.id } })`), so a bare
 * locale-prefixed path is both sufficient and already how the app works.
 *
 * Known, honest limitation (documented, not fixed here — see
 * docs/lifecycle/LIFECYCLE-1B-REMINDER-ENGINE.md §10): every protected
 * page's own auth guard today redirects an unauthenticated visitor to a
 * bare `/login` with no `callbackUrl`/return-path preservation (confirmed
 * by inspecting every dashboard/tutor page's own redirect() call — none
 * pass one). A reminder clicked from a device where the session already
 * exists lands exactly on the right page; a reminder clicked after the
 * session expired lands the user on a bare login screen, not automatically
 * back at the deep-linked page. Adding callbackUrl support to every
 * protected route is a real, separate, multi-file change and is
 * deliberately out of scope for this mission — "do not create arbitrary
 * redirects solely for email" and "do not create insecure login bypasses."
 */
export function buildReminderDeepLink(nextAction: LifecycleJourneyState["nextAction"], locale: "en" | "fr", baseUrlOverride?: string | null): string | null {
  if (!nextAction) return null;
  const baseUrl = resolveBookingEmailBaseUrl(baseUrlOverride);
  if (!baseUrl) return null;
  return `${baseUrl}/${locale}${nextAction}`;
}
