import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Section } from "@/components/ui/Section";
import { Badge } from "@/components/ui/Badge";
import { TutorSearch } from "@/components/marketing/TutorSearch";
import { TutorCard } from "@/components/marketing/TutorCard";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { subjects } from "@/content/subjects";
import { getFavoritedTutorIds } from "@/lib/favorites";
import { tutorProfileToCardData } from "@/lib/tutorCard";
import { displayModeToDb } from "@/lib/tutorMode";
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

  const levelKey = gradeLevelKeys.includes(level as GradeLevelKey) ? (level as GradeLevelKey) : undefined;
  const modeKey = mode === "online" || mode === "in-person" ? (mode as LearningMode) : undefined;

  const matchedSubjectSlugs = subject
    ? subjects.filter((s) => tSubjects(s.slug).toLowerCase().includes(subject.toLowerCase())).map((s) => s.slug)
    : undefined;

  const session = await auth();
  const [tutorProfiles, favoritedIds] = await Promise.all([
    db.tutorProfile.findMany({
      where: {
        applicationStatus: "APPROVED",
        ...(matchedSubjectSlugs ? { subjects: { some: { subject: { slug: { in: matchedSubjectSlugs } } } } } : {}),
        ...(levelKey ? { levels: { some: { academicLevel: { slug: levelKey } } } } : {}),
        ...(modeKey ? { OR: [{ learningMode: displayModeToDb(modeKey) }, { learningMode: "BOTH" }] } : {}),
      },
      include: {
        user: { select: { name: true } },
        subjects: { select: { subject: { select: { slug: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    getFavoritedTutorIds(session),
  ]);

  const results = tutorProfiles.map((tutor) => tutorProfileToCardData(tutor, tSubjects, favoritedIds));
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
            <Badge variant="outline" className="mb-3">
              {t("newMarketplaceBadge")}
            </Badge>
            <p>{hasFilters ? t("emptyFiltered") : t("emptyNoTutorsYet")}</p>
          </div>
        )}
      </Section>
    </MarketingShell>
  );
}
