export type LearningMode = "online" | "in-person" | "both";

export type GradeLevelKey =
  | "elementary"
  | "middleSchool"
  | "highSchool"
  | "cegepCollege"
  | "university"
  | "adultLearner";

export type LanguageKey = "en" | "fr";

export type TutorBadgeKey = "topTutor" | "respondsQuickly" | "popular";

export interface DemoTutor {
  id: string;
  slug: string;
  firstName: string;
  /** References `content/subjects.ts` slugs. */
  subjectSlugs: string[];
  gradeLevels: GradeLevelKey[];
  languages: LanguageKey[];
  rating: number;
  reviewCount: number;
  learningMode: LearningMode;
  city: string;
  yearsExperience: number;
  badges: TutorBadgeKey[];
}

/**
 * What `TutorCard` actually renders — fully resolved display strings, not
 * translation keys or slugs. Built either from `DemoTutor` + translations
 * (see `DemoTutorCard.tsx`, homepage only) or from a real `TutorProfile`
 * query (see `src/lib/tutorCard.ts`).
 */
export interface TutorCardData {
  /** TutorProfile.id for real tutors, DemoTutor.id for demo ones — used as the favorite-toggle key. */
  id: string;
  slug: string;
  firstName: string;
  headline: string;
  bio: string;
  subjectLabels: string[];
  rating: number;
  reviewCount: number;
  /**
   * FutureTutor calculates customer pricing — tutors no longer set a
   * displayable rate (Phase E). Only set when a real subject/level context
   * lets `/find-tutors` compute an honest "from $X" estimate; omitted
   * (neutral "pricing calculated per session" copy) otherwise. Never a
   * fabricated/guessed number.
   */
  priceFromCents?: number | null;
  learningMode: LearningMode;
  city: string;
  yearsExperience: number;
  badges: TutorBadgeKey[];
  /** Only set for real tutors viewed by a signed-in student. Omitted (no heart button) otherwise. */
  isFavorited?: boolean;
}
