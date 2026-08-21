import { getTranslations } from "next-intl/server";
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
import { calculateCustomerPrice, PricingRuleNotFoundError } from "@/services/customerPricing";
import type { GradeLevelKey, LearningMode } from "@/types/tutor";

const gradeLevelKeys: GradeLevelKey[] = ["elementary", "middleSchool", "highSchool", "cegepCollege", "university", "adultLearner"];

function representativePreviewStartAt(): Date {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
}

export interface TutorDirectorySearchParams {
  subject?: string;
  level?: string;
  mode?: string;
}

export async function TutorDirectory({ locale, searchParams, authenticated = false }: {
  locale: string;
  searchParams: TutorDirectorySearchParams;
  authenticated?: boolean;
}) {
  const { subject, level, mode } = searchParams;
  const t = await getTranslations({ locale, namespace: "findTutorsPage" });
  const tSubjects = await getTranslations({ locale, namespace: "subjects.items" });
  const tLevels = await getTranslations({ locale, namespace: "gradeLevels" });
  const tSearch = await getTranslations({ locale, namespace: "search" });
  const levelKey = gradeLevelKeys.includes(level as GradeLevelKey) ? (level as GradeLevelKey) : undefined;
  const modeKey = mode === "online" || mode === "in-person" ? (mode as LearningMode) : undefined;
  const matchedSubjectSlugs = subject
    ? subjects.filter((item) => tSubjects(item.slug).toLowerCase().includes(subject.toLowerCase())).map((item) => item.slug)
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

  let previewPriceCents: number | null = null;
  if (matchedSubjectSlugs?.length === 1) {
    const matchedSubject = await db.subject.findUnique({ where: { slug: matchedSubjectSlugs[0] } });
    const matchedLevel = levelKey ? await db.academicLevel.findUnique({ where: { slug: levelKey } }) : null;
    if (matchedSubject) {
      try {
        const preview = await calculateCustomerPrice({
          subjectId: matchedSubject.id,
          academicLevelId: matchedLevel?.id ?? null,
          tutoringMode: modeKey ? displayModeToDb(modeKey) : "ONLINE",
          durationMinutes: 60,
          requestedStartAt: representativePreviewStartAt(),
        });
        previewPriceCents = preview.totalCents;
      } catch (error) {
        if (!(error instanceof PricingRuleNotFoundError)) throw error;
      }
    }
  }

  const results = tutorProfiles.map((tutor) => tutorProfileToCardData(tutor, tSubjects, favoritedIds, previewPriceCents));
  const hasFilters = Boolean(subject || level || mode);

  return (
    <>
      <Section className="bg-navy pb-10 pt-14 md:pt-20">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-white md:text-5xl">{t("heading")}</h1>
          <p className="mt-4 text-lg text-white/70">{t("subheading")}</p>
        </div>
        <div className="mx-auto mt-8 max-w-3xl">
          <TutorSearch resultsPath={authenticated ? "/dashboard/find-tutors" : "/find-tutors"} />
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
            {results.map((tutor) => <TutorCard key={tutor.id} tutor={tutor} />)}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center text-slate">
            <Badge variant="outline" className="mb-3">{t("newMarketplaceBadge")}</Badge>
            <p>{hasFilters ? t("emptyFiltered") : t("emptyNoTutorsYet")}</p>
          </div>
        )}
      </Section>
    </>
  );
}
