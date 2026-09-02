import { site } from "@/content/site";

/**
 * PROD-CONNECT-V2-COUNTRYFIX1 — the authoritative source for the ISO
 * 3166-1 alpha-2 country code Stripe's Accounts v2 `identity.country`
 * field requires (confirmed against the installed Stripe SDK's own
 * `AccountCreateParams.Identity.country` type: a bare ISO 3166-1 alpha-2
 * string).
 *
 * FutureTutor has no per-tutor country field anywhere in the schema (no
 * `TutorProfile.country`, no `User.country`) — the platform has never
 * needed to ask, because it has always operated in exactly one country.
 * That fact is already expressed once, canonically, in `src/content/
 * site.ts`'s `country: "Canada"` (site metadata) — corroborated
 * platform-wide by `CANADIAN_PROVINCES_AND_TERRITORIES` (BETA-AGE1/
 * BETA-UX-PROVINCES1 — every province/territory value the product ever
 * collects is Canadian), every pricing schema's CAD-only `currency`
 * default, and the marketing copy's own "across Canada" framing. Per the
 * mission's explicit instruction not to invent a new field or silently
 * assume a value, this derives from that single existing constant rather
 * than hardcoding "CA" directly in the Stripe payload — a narrow,
 * single-entry mapping, not a general i18n/country library, and not a
 * new schema field.
 *
 * Fails closed: if `site.country` is ever changed to a value this map
 * doesn't recognize, this throws rather than silently sending an
 * unrelated or stale country to Stripe.
 */
const COUNTRY_TO_ISO_ALPHA2: Readonly<Record<string, string>> = {
  Canada: "CA",
};

export class UnsupportedStripeConnectCountryError extends Error {}

export function stripeConnectAccountCountry(): string {
  const iso = COUNTRY_TO_ISO_ALPHA2[site.country];
  if (!iso) {
    throw new UnsupportedStripeConnectCountryError(
      `No known ISO 3166-1 alpha-2 mapping for site.country="${site.country}" — refusing to guess a Stripe Connect account country.`
    );
  }
  return iso;
}
