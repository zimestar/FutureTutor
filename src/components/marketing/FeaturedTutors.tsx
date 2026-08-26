import { getTranslations } from "next-intl/server";
import { Section } from "@/components/ui/Section";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TutorCard } from "@/components/marketing/TutorCard";
import { db } from "@/lib/db";
import { tutorProfileToCardData } from "@/lib/tutorCard";

export async function FeaturedTutors({ locale }: { locale: string }) {
  const [t, tSubjects, tutors] = await Promise.all([
    getTranslations({ locale, namespace: "featuredTutors" }),
    getTranslations({ locale, namespace: "subjects.items" }),
    db.tutorProfile
      .findMany({
        where: { applicationStatus: "APPROVED" },
        include: {
          user: { select: { name: true, image: true } },
          subjects: { select: { subject: { select: { slug: true } } } },
        },
        orderBy: [{ reviewCount: "desc" }, { createdAt: "desc" }],
        take: 4,
      })
      // Tutor inventory enriches the public story, but the Home page must keep
      // its honest editorial fallback if marketplace data is temporarily unavailable.
      .catch(() => []),
  ]);
  const cards = tutors.map((tutor) => tutorProfileToCardData(tutor, tSubjects));
  return (
    <Section id="featured-tutors" ariaLabelledby="featured-tutors-heading" className="bg-off-white">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div><Badge variant="outline">{t("badge")}</Badge><h2 id="featured-tutors-heading" className="mt-3 text-3xl font-bold tracking-tight text-navy md:text-4xl">{t("heading")}</h2><p className="mt-3 max-w-xl text-lg leading-8 text-slate">{t("description")}</p></div>
        <Button href="/find-tutors" variant="outline" className="shrink-0">{t("browseAll")}</Button>
      </div>
      {cards.length > 0 ? <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">{cards.map((tutor) => <TutorCard key={tutor.id} tutor={tutor} />)}</div> : <div className="mt-10 rounded-2xl border border-blue/15 bg-white p-8 shadow-card md:p-10"><p className="max-w-2xl text-lg font-semibold leading-8 text-navy">{t("emptyTitle")}</p><p className="mt-2 max-w-2xl leading-7 text-text-secondary">{t("emptyDescription")}</p></div>}
    </Section>
  );
}
