import { site } from "@/content/site";

/**
 * PROD-BOOKING-NOTIFICATIONS1-BASEURLFIX1 — the canonical, request-
 * independent base URL for booking-confirmation email CTA links.
 *
 * Root cause this replaces: src/lib/appUrl.ts's getAppBaseUrl() derives the
 * origin from the current request's Host/X-Forwarded-Proto headers via
 * next/headers, which only resolves inside an active Next.js request. A
 * background/server-job invocation of dispatchBookingConfirmationEmails
 * (a one-off admin certification, a future reconciliation sweep) has no
 * such request — getAppBaseUrl() throws there, and the caller correctly
 * (if silently) treats that as "can't build a safe link yet," leaving the
 * notification PENDING forever.
 *
 * Fix: never derive this from any request header at all (sidesteps the
 * Host-header-trust concern entirely, not just works around it) — this
 * codebase already has a durable, trusted canonical production URL
 * constant, `site.url` (src/content/site.ts, "https://www.futuretutor.ca"),
 * already used for metadataBase, OpenGraph tags, sitemap.xml, robots.txt,
 * and (in stripeConnectCountry.ts) a genuinely security-adjacent Stripe
 * Connect field — reused here rather than introducing a new environment
 * variable. An explicit override is still accepted (for a controlled,
 * reviewed one-off invocation, or a future test), but is validated by the
 * exact same rule as the default: HTTPS only, never localhost/loopback —
 * so neither path can ever silently produce an insecure or local link in a
 * real email, and a malformed override fails closed (null) rather than
 * guessing.
 */
export function resolveBookingEmailBaseUrl(explicitBaseUrl?: string | null): string | null {
  const candidate = explicitBaseUrl ?? site.url;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") return null;

  const hostname = parsed.hostname.toLowerCase();
  // Node/WHATWG URL keeps the brackets on an IPv6 hostname (e.g. "[::1]"),
  // so both forms are checked — comparing against the bracket-less "::1"
  // alone would silently never match.
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]" || hostname === "0.0.0.0") {
    return null;
  }

  return parsed.origin;
}
