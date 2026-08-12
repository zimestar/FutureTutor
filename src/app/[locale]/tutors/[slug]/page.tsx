import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Star, MapPin, Laptop, Languages, GraduationCap } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Section } from "@/components/ui/Section";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { formatHourlyRate } from "@/lib/utils";
import { demoTutors } from "@/content/demoTutors";

type Params = { locale: string; slug: string };

export function generateStaticParams() {
  return demoTutors.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const tutor = demoTutors.find((t) => t.slug === slug);
  if (!tutor) return {};

  const t = await getTranslations({ locale, namespace: `demoTutors.${tutor.id}` });

  return {
    title: `${tutor.firstName} — ${t("headline")}`,
    description: t("bio"),
  };
}

export default async function TutorProfilePage({ params }: { params: Promise<Params> }) {
  const { locale, slug } = await params;
  const tutor = demoTutors.find((t) => t.slug === slug);
  if (!tutor) notFound();

  setRequestLocale(locale);
  const tDemo = await getTranslations({ locale, namespace: `demoTutors.${tutor.id}` });
  const tCard = await getTranslations({ locale, namespace: "tutorCard" });
  const tSubjects = await getTranslations({ locale, namespace: "subjects.items" });
  const tLevels = await getTranslations({ locale, namespace: "gradeLevels" });
  const tLanguages = await getTranslations({ locale, namespace: "languages" });
  const tProfile = await getTranslations({ locale, namespace: "tutorProfile" });

  return (
    <MarketingShell>
      <Section className="bg-off-white">
        <Badge variant="outline" className="mb-6">
          {tProfile("demoBadge")}
        </Badge>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[2fr_1fr]">
          <div>
            <div className="flex items-start gap-5">
              <Avatar name={tutor.firstName} size={80} />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-3xl font-bold text-navy">{tutor.firstName}</h1>
                  {tutor.badges.map((badge) => (
                    <Badge key={badge} variant={badge === "topTutor" ? "mint" : "blue"}>
                      {tCard(`badges.${badge}`)}
                    </Badge>
                  ))}
                </div>
                <p className="mt-1 text-lg font-semibold text-slate">{tDemo("headline")}</p>
                <div className="mt-2 flex items-center gap-1">
                  <Star size={16} className="text-warning" fill="currentColor" strokeWidth={0} />
                  <span className="font-bold text-navy">{tutor.rating.toFixed(1)}</span>
                  <span className="text-slate">{tCard("reviews", { count: tutor.reviewCount })}</span>
                </div>
              </div>
            </div>

            <p className="mt-8 max-w-2xl text-lg leading-relaxed text-slate">{tDemo("bio")}</p>

            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4">
                <Laptop size={18} className="text-blue" aria-hidden="true" />
                <span className="text-sm font-semibold text-navy">
                  {tCard(`mode.${tutor.learningMode}`)}
                </span>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4">
                <MapPin size={18} className="text-blue" aria-hidden="true" />
                <span className="text-sm font-semibold text-navy">{tutor.city}</span>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4">
                <Languages size={18} className="text-blue" aria-hidden="true" />
                <span className="text-sm font-semibold text-navy">
                  {tutor.languages.map((l) => tLanguages(l)).join(", ")}
                </span>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4">
                <GraduationCap size={18} className="text-blue" aria-hidden="true" />
                <span className="text-sm font-semibold text-navy">
                  {tutor.gradeLevels.map((g) => tLevels(g)).join(", ")}
                </span>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-2">
              {tutor.subjectSlugs.map((slug) => (
                <Badge key={slug} variant="neutral">
                  {tSubjects(slug)}
                </Badge>
              ))}
            </div>
          </div>

          <aside className="h-fit rounded-lg border border-neutral-200 bg-white p-6 shadow-card">
            <p className="text-3xl font-extrabold text-navy">
              {formatHourlyRate(tutor.hourlyRateCad, locale)}
              <span className="text-base font-semibold text-slate"> {tCard("perHour")}</span>
            </p>
            <p className="mt-1 text-sm text-slate">
              {tProfile("yearsExperience", { count: tutor.yearsExperience })}
            </p>
            <Button href="/signup" className="mt-6 w-full">
              {tProfile("requestToBook")}
            </Button>
            <p className="mt-3 text-center text-xs text-slate">{tProfile("bookingNote")}</p>
          </aside>
        </div>
      </Section>
    </MarketingShell>
  );
}
