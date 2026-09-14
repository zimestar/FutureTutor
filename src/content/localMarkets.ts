export interface LocalMarket {
  slug: string;
  city: string;
  province: string;
}

/**
 * SEO-3 local-market expansion guardrail. Edmonton is the platform's real,
 * current market and is seeded here directly — it is not gated by the
 * expansion criteria below, which govern any ADDITIONAL city. See
 * docs/seo/SEO-3-INFORMATION-ARCHITECTURE.md ("Local market expansion
 * guardrail") for the full rationale.
 *
 * A city may be added to this list only once ALL of the following are
 * verified and documented at the time of the change:
 *   1. 5+ approved tutors with that city on their profile
 *   2. 3+ distinct subjects represented among those tutors
 *   3. realistic fulfillment ability (not just registered supply)
 *   4. real, non-fabricated demand evidence for that market
 *
 * This file is the single gate for local-market page generation — routes
 * under /tutoring/[city] 404 for any slug not listed here, and nothing here
 * is derived automatically from the database.
 */
export const localMarkets: LocalMarket[] = [{ slug: "edmonton", city: "Edmonton", province: "AB" }];

export function getLocalMarket(slug: string): LocalMarket | undefined {
  return localMarkets.find((market) => market.slug === slug);
}
