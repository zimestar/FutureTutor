import { dbModeToDisplay } from "@/lib/tutorMode";
import type { TutorCardData } from "@/types/tutor";

interface TutorProfileForCard {
  id: string;
  slug: string;
  headline: string | null;
  bio: string | null;
  ratingAverage: number;
  reviewCount: number;
  learningMode: "ONLINE" | "IN_PERSON" | "BOTH" | null;
  city: string | null;
  yearsExperience: number | null;
  user: { name: string | null; image?: string | null };
  subjects: { subject: { slug: string } }[];
}

/**
 * Real, DB-backed tutor -> the shape `TutorCard` renders. No badges yet —
 * there's no real criteria (reviews, response time) to award them.
 * `priceFromCents` is optional and only ever supplied by a caller that has
 * computed a real Customer Price Engine estimate for a known subject/level
 * context (see `/find-tutors`) — this function never invents one.
 */
export function tutorProfileToCardData(
  tutor: TutorProfileForCard,
  translateSubject: (slug: string) => string,
  favoritedIds?: Set<string>,
  priceFromCents?: number | null
): TutorCardData {
  return {
    id: tutor.id,
    slug: tutor.slug,
    firstName: tutor.user.name?.split(" ")[0] ?? "",
    image: tutor.user.image ?? null,
    headline: tutor.headline ?? "",
    bio: tutor.bio ?? "",
    subjectLabels: tutor.subjects.map((s) => translateSubject(s.subject.slug)),
    rating: tutor.ratingAverage,
    reviewCount: tutor.reviewCount,
    priceFromCents,
    learningMode: dbModeToDisplay(tutor.learningMode ?? "BOTH"),
    city: tutor.city ?? "",
    yearsExperience: tutor.yearsExperience ?? 0,
    badges: [],
    isFavorited: favoritedIds?.has(tutor.id),
  };
}
