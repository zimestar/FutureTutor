import { dbModeToDisplay } from "@/lib/tutorMode";
import type { TutorCardData } from "@/types/tutor";

interface TutorProfileForCard {
  id: string;
  slug: string;
  headline: string | null;
  bio: string | null;
  ratingAverage: number;
  reviewCount: number;
  hourlyRateCents: number | null;
  learningMode: "ONLINE" | "IN_PERSON" | "BOTH" | null;
  city: string | null;
  yearsExperience: number | null;
  user: { name: string | null };
  subjects: { subject: { slug: string } }[];
}

/** Real, DB-backed tutor -> the shape `TutorCard` renders. No badges yet — there's no real criteria (reviews, response time) to award them. */
export function tutorProfileToCardData(
  tutor: TutorProfileForCard,
  translateSubject: (slug: string) => string,
  favoritedIds?: Set<string>
): TutorCardData {
  return {
    id: tutor.id,
    slug: tutor.slug,
    firstName: tutor.user.name?.split(" ")[0] ?? "",
    headline: tutor.headline ?? "",
    bio: tutor.bio ?? "",
    subjectLabels: tutor.subjects.map((s) => translateSubject(s.subject.slug)),
    rating: tutor.ratingAverage,
    reviewCount: tutor.reviewCount,
    hourlyRateCad: tutor.hourlyRateCents ? tutor.hourlyRateCents / 100 : 0,
    learningMode: dbModeToDisplay(tutor.learningMode ?? "BOTH"),
    city: tutor.city ?? "",
    yearsExperience: tutor.yearsExperience ?? 0,
    badges: [],
    isFavorited: favoritedIds?.has(tutor.id),
  };
}
