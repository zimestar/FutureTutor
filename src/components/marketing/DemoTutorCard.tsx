import { useTranslations } from "next-intl";
import { TutorCard } from "@/components/marketing/TutorCard";
import type { DemoTutor, TutorCardData } from "@/types/tutor";

/** Adapts a `DemoTutor` (translation-key-driven fixture) into the plain-string `TutorCardData` shape `TutorCard` expects. Used only by the homepage's "Example profiles" section. */
export function DemoTutorCard({ tutor }: { tutor: DemoTutor }) {
  const tSubjects = useTranslations("subjects.items");
  const tDemo = useTranslations(`demoTutors.${tutor.id}`);

  const data: TutorCardData = {
    id: tutor.id,
    slug: tutor.slug,
    firstName: tutor.firstName,
    headline: tDemo("headline"),
    bio: tDemo("bio"),
    subjectLabels: tutor.subjectSlugs.map((slug) => tSubjects(slug)),
    rating: tutor.rating,
    reviewCount: tutor.reviewCount,
    learningMode: tutor.learningMode,
    city: tutor.city,
    yearsExperience: tutor.yearsExperience,
    badges: tutor.badges,
  };

  return <TutorCard tutor={data} />;
}
