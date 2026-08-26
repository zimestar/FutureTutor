import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { TutorCard } from "@/components/marketing/TutorCard";
import { subjects } from "@/content/subjects";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFavoritedTutorIds } from "@/lib/favorites";
import { tutorProfileToCardData } from "@/lib/tutorCard";
import { publicPageMetadata } from "@/lib/publicMetadata";

type Params = { locale: string; subject: string };

function getSubject(slug: string) {
  return subjects.find((s) => s.slug === slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { locale, subject: slug } = await params;
  const subject = getSubject(slug);
  if (!subject) return {};

  const t = await getTranslations({ locale, namespace: "subjects" });
  const label = t(`items.${slug}`);

  return publicPageMetadata({ locale, path: `/subjects/${slug}`, title: t("page.title", { subject: label }), description: t("page.metaDescription", { subject: label }) });
}

export default async function SubjectPage({ params }: { params: Promise<Params> }) {
  const { locale, subject: slug } = await params;
  const subject = getSubject(slug);
  if (!subject) notFound();

  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "subjects" });
  const tSubjects = await getTranslations({ locale, namespace: "subjects.items" });
  const label = t(`items.${slug}`);

  const session = await auth();
  const [tutorProfiles, favoritedIds] = await Promise.all([
    db.tutorProfile.findMany({
      where: {
        applicationStatus: "APPROVED",
        subjects: { some: { subject: { slug } } },
      },
      include: {
        user: { select: { name: true } },
        subjects: { select: { subject: { select: { slug: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    getFavoritedTutorIds(session),
  ]);

  const matches = tutorProfiles.map((tutor) => tutorProfileToCardData(tutor, tSubjects, favoritedIds));

  return (
    <MarketingShell>
      <Section className="bg-off-white pb-8">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-navy md:text-5xl">
            {t("page.title", { subject: label })}
          </h1>
          <p className="mt-4 text-lg text-slate">{t("page.description", { subject: label })}</p>
          <div className="mt-6 flex justify-center">
            <Button href={`/find-tutors?subject=${encodeURIComponent(label)}`}>{t("page.searchAll")}</Button>
          </div>
        </div>
      </Section>

      <Section className="bg-off-white pt-0">
        {matches.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {matches.map((tutor) => (
              <TutorCard key={tutor.id} tutor={tutor} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center text-slate">
            {t("page.empty", { subject: label })}
          </div>
        )}
      </Section>
    </MarketingShell>
  );
}
