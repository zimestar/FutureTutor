/**
 * HOME-V2 — real people only. Every entry below must come from a real person
 * who agreed in writing to be published. Nothing here may be invented,
 * paraphrased into something they did not say, or presented as a session
 * review: market-research quotes are shown as "what families told us", never
 * with stars. Empty lists hide their section on the homepage.
 */

/** Slugs of approved tutors who joined at launch ("Founding tutor" badge). */
export const founderTutorSlugs: readonly string[] = [];

export interface LocalizedText {
  fr: string;
  en: string;
}

export interface FounderNote {
  name: string;
  /** Path under /public, or null to show initials. */
  photo: string | null;
  quote: LocalizedText;
}

/** The founder's own words, or null to hide the block. */
export const founderNote: FounderNote | null = null;

export interface MarketResearchTestimonial {
  id: string;
  /** Display name as the person approved it, e.g. "Sarah K." */
  name: string;
  role: LocalizedText;
  /** Exact words. Only the language the person wrote in is required; the
   * other may be a faithful translation they approved. */
  quote: LocalizedText;
}

export const marketResearchTestimonials: readonly MarketResearchTestimonial[] = [];
