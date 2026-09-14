import { subjects } from "@/content/subjects";
import { resourceArticles } from "@/content/resources";
import { localMarkets } from "@/content/localMarkets";

/**
 * DATA-1 — every slug-shaped analytics property must be validated against
 * its real, public, certified registry before being sent anywhere. This is
 * what makes `subject_slug`/`resource_slug`/`city_slug` safe to treat as
 * non-free-text: a slug that isn't in one of these three lists (all
 * already the single source of truth for their own public routes) is
 * rejected, never forwarded.
 */

const KNOWN_SUBJECT_SLUGS = new Set(subjects.map((s) => s.slug));
const KNOWN_RESOURCE_SLUGS = new Set(resourceArticles.map((a) => a.slug));
const KNOWN_CITY_SLUGS = new Set(localMarkets.map((m) => m.slug));

export function isKnownSubjectSlug(slug: string): boolean {
  return KNOWN_SUBJECT_SLUGS.has(slug);
}

export function isKnownResourceSlug(slug: string): boolean {
  return KNOWN_RESOURCE_SLUGS.has(slug);
}

export function isKnownCitySlug(slug: string): boolean {
  return KNOWN_CITY_SLUGS.has(slug);
}
