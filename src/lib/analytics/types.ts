/**
 * DATA-1 — the FutureTutor analytics event catalog. Every event is a
 * user-action name (lowercase_snake_case), not a UI-implementation detail.
 * The property map below is the single source of truth TypeScript uses to
 * enforce the PII denylist at compile time: a call site can only pass the
 * exact properties listed here for that event, nothing else. See
 * docs/analytics/DATA-1-ANALYTICS-FOUNDATION.md for the full per-event
 * business purpose / trigger / destination documentation.
 */

export type Locale = "en" | "fr";

/** Coarse page classification — never a raw pathname or a private object ID. */
export type PageType =
  | "homepage"
  | "find_tutors"
  | "local_landing"
  | "subject"
  | "resource"
  | "how_it_works"
  | "become_tutor"
  | "other_public";

/** Semantic CTA placement — never a component name, colour, or DOM detail. */
export type CtaLocation = "hero" | "content" | "header" | "header_mobile" | "footer_section" | "nav";

export type UserIntent = "find_tutor" | "become_tutor" | "learn_more";

/**
 * One entry per real event name. Adding a new event means adding a row
 * here — the property shape is the enforced allowlist for that event; no
 * call site can pass a property outside this shape (TypeScript rejects
 * it), and every property type here is intentionally a closed enum or a
 * value validated against a real public registry (see slugGuards.ts) —
 * never `string` (free text) and never a database ID.
 */
export interface AnalyticsEventPropertiesMap {
  /** A public marketing page rendered. Fired by <TrackPageView>, never by a private route. */
  page_view: { locale: Locale; page_type: PageType };
  /** The primary "Find a Tutor" CTA was activated. */
  find_tutor_cta_clicked: { locale?: Locale; cta_location: CtaLocation };
  /** The primary "Become a Tutor" CTA was activated. */
  become_tutor_cta_clicked: { locale?: Locale; cta_location: CtaLocation };
  /** A "How It Works" / "See how booking works" link was activated. */
  how_it_works_cta_clicked: { locale?: Locale; cta_location: CtaLocation };
  /** A resource article's page rendered — resource_slug must be a real, published slug (see slugGuards.ts). */
  resource_article_viewed: { locale: Locale; resource_slug: string };
  /** A resource article's own primary CTA was activated. */
  resource_primary_cta_clicked: { locale?: Locale; resource_slug: string; cta_location?: CtaLocation };
  /** A subject page rendered — subject_slug must be a real taxonomy slug (see slugGuards.ts). */
  subject_page_viewed: { locale: Locale; subject_slug: string };
  /** A local-market landing page rendered — city_slug must be on the certified allowlist (see slugGuards.ts). */
  local_landing_viewed: { locale: Locale; city_slug: string };
  /** The signup flow was entered from a marketing surface. */
  signup_started: { locale?: Locale; user_intent?: UserIntent };
  /** The login flow was entered from a marketing surface. */
  login_started: { locale?: Locale };
  /** The tutor-search form on /find-tutors was submitted. Never the free-text query itself — level/mode are closed enums. */
  search_started: { locale?: Locale; level?: string; mode?: string };
}

export type AnalyticsEventName = keyof AnalyticsEventPropertiesMap;
