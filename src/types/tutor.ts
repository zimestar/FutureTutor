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
  hourlyRateCad: number;
  learningMode: LearningMode;
  city: string;
  yearsExperience: number;
  badges: TutorBadgeKey[];
}
