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

/** What `TutorCard` renders — fully resolved display strings from an approved public Tutor profile. */
export interface TutorCardData {
  /** TutorProfile.id — used as the favorite-toggle key for authenticated learners. */
  id: string;
  slug: string;
  firstName: string;
  image?: string | null;
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
