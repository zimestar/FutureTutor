import { useTranslations } from "next-intl";
import { Section } from "@/components/ui/Section";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DemoTutorCard } from "@/components/marketing/DemoTutorCard";
import { demoTutors } from "@/content/demoTutors";
import type { DemoTutor } from "@/types/tutor";

export function FeaturedTutors({ tutors = demoTutors }: { tutors?: DemoTutor[] }) {
  const t = useTranslations("featuredTutors");

  return (
    <Section id="featured-tutors" ariaLabelledby="featured-tutors-heading" className="bg-off-white">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <Badge variant="outline">{t("badge")}</Badge>
          <h2 id="featured-tutors-heading" className="mt-3 text-3xl font-bold tracking-tight text-navy md:text-4xl">
            {t("heading")}
          </h2>
          <p className="mt-3 max-w-xl text-lg text-slate">{t("description")}</p>
        </div>
        <Button href="/find-tutors" variant="outline" className="shrink-0">
          {t("browseAll")}
        </Button>
      </div>

      {tutors.length > 0 ? (
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {tutors.map((tutor) => (
            <DemoTutorCard key={tutor.id} tutor={tutor} />
          ))}
        </div>
      ) : (
        <div className="mt-10 rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center text-slate">
          {t("empty")}
        </div>
      )}
    </Section>
  );
}
