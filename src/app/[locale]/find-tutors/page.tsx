import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Section } from "@/components/ui/Section";
import { Badge } from "@/components/ui/Badge";
import { TutorSearch } from "@/components/marketing/TutorSearch";
import { TutorCard } from "@/components/marketing/TutorCard";
import { demoTutors } from "@/content/demoTutors";
import type { GradeLevelKey, LearningMode } from "@/types/tutor";

const gradeLevelKeys: GradeLevelKey[] = [
  "elementary",
  "middleSchool",
  "highSchool",
  "cegepCollege",
  "university",
  "adultLearner",
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "findTutorsPage" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

type SearchParams = { subject?: string; level?: string; mode?: string };

export default async function FindTutorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  const { subject, level, mode } = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "findTutorsPage" });
  const tSubjects = await getTranslations({ locale, namespace: "subjects.items" });
  const tLevels = await getTranslations({ locale, namespace: "gradeLevels" });
  const tSearch = await getTranslations({ locale, namespace: "search" });

  const levelKey = gradeLevelKeys.includes(level as GradeLevelKey)
    ? (level as GradeLevelKey)
    : undefined;

  const results = demoTutors.filter((tutor) => {
    const matchesSubject = subject
      ? tutor.subjectSlugs.some((slug) =>
          tSubjects(slug).toLowerCase().includes(subject.toLowerCase())
        )
      : true;
    const matchesLevel = levelKey ? tutor.gradeLevels.includes(levelKey) : true;
    const matchesMode = mode
      ? tutor.learningMode === (mode as LearningMode) || tutor.learningMode === "both"
      : true;
    return matchesSubject && matchesLevel && matchesMode;
  });

  const hasFilters = Boolean(subject || level || mode);

  return (
    <MarketingShell>
      <Section className="bg-navy pb-10 pt-14 md:pt-20">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-white md:text-5xl">
            {t("heading")}
          </h1>
          <p className="mt-4 text-lg text-white/70">{t("subheading")}</p>
        </div>
        <div className="mx-auto mt-8 max-w-3xl">
          <TutorSearch />
        </div>
      </Section>

      <Section className="bg-off-white">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Badge variant="outline">{t("badge")}</Badge>
          {hasFilters && (
            <p className="text-sm text-slate">
              {t("resultCount", { count: results.length })}
              {subject ? ` — "${subject}"` : ""}
              {levelKey ? ` · ${tLevels(levelKey)}` : ""}
              {mode ? ` · ${mode === "online" ? tSearch("online") : tSearch("inPerson")}` : ""}
            </p>
          )}
        </div>

        {results.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((tutor) => (
              <TutorCard key={tutor.id} tutor={tutor} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center text-slate">
            {t("empty")}
          </div>
        )}
      </Section>
    </MarketingShell>
  );
}
