import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingPageHero } from "@/components/marketing/MarketingPageHero";
import { SectionIntro } from "@/components/marketing/SectionIntro";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { Breadcrumbs } from "@/components/ui/Navigation";
import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";
import { TutorCard } from "@/components/marketing/TutorCard";
import { getLocalMarket } from "@/content/localMarkets";
import { subjects } from "@/content/subjects";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFavoritedTutorIds } from "@/lib/favorites";
import { tutorProfileToCardData } from "@/lib/tutorCard";
import { publicPageMetadata } from "@/lib/publicMetadata";
import { TrackPageView } from "@/components/marketing/TrackPageView";
import type { Locale } from "@/lib/analytics";

type Params = { locale: string; city: string };

// SEO-3 — local-market expansion guardrail: this route only ever renders a
// page for a slug present in src/content/localMarkets.ts. There is no
// DB-driven auto-generation from TutorProfile.city values, so the set of
// indexable local pages cannot silently grow beyond a deliberately reviewed
// allowlist. See docs/seo/SEO-3-INFORMATION-ARCHITECTURE.md.

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { locale, city: slug } = await params;
  const market = getLocalMarket(slug);
  if (!market) return {};

  const t = await getTranslations({ locale, namespace: `tutoringMarkets.items.${slug}` });
  return publicPageMetadata({ locale, path: `/tutoring/${slug}`, title: t("metaTitle"), description: t("metaDescription") });
}

export default async function LocalMarketPage({ params }: { params: Promise<Params> }) {
  const { locale, city: slug } = await params;
  const market = getLocalMarket(slug);
  if (!market) notFound();

  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "tutoringMarkets" });
  const tItem = await getTranslations({ locale, namespace: `tutoringMarkets.items.${slug}` });
  const tSubjects = await getTranslations({ locale, namespace: "subjects.items" });

  const session = await auth();
  const [tutorProfiles, favoritedIds] = await Promise.all([
    db.tutorProfile.findMany({
      where: { applicationStatus: "APPROVED", city: { equals: market.city, mode: "insensitive" } },
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
      <TrackPageView event="local_landing_viewed" properties={{ locale: locale as Locale, city_slug: slug }} />
      <Section className="bg-off-white pb-0">
        <Breadcrumbs items={[{ label: t("breadcrumbHome"), href: "/" }, { label: tItem("breadcrumbLabel") }]} />
      </Section>
      <MarketingPageHero
        eyebrow={tItem("hero.eyebrow")}
        title={tItem("hero.title")}
        description={tItem("hero.description")}
        primary={{ label: tItem("hero.primary"), href: "/find-tutors" }}
        secondary={{ label: tItem("hero.secondary"), href: "/become-a-tutor" }}
      />
      <Section className="bg-white">
        <SectionIntro eyebrow={tItem("intro.eyebrow")} title={tItem("intro.title")} description={tItem("intro.description")} align="left" />
        <Link href="/how-it-works" className="mt-4 inline-flex items-center gap-2 font-bold text-blue hover:text-blue-hover">
          {tItem("howItWorksLink")}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </Section>
      <Section className="bg-off-white">
        <SectionIntro title={tItem("subjectsHeading")} align="left" />
        <div className="mt-8 flex flex-wrap gap-3">
          {subjects.map((subject) => (
            <Button key={subject.slug} href={`/subjects/${subject.slug}`} variant="outline" size="sm">
              {tSubjects(subject.slug)}
            </Button>
          ))}
        </div>
      </Section>
      <Section className="bg-white">
        <SectionIntro title={tItem("tutorsHeading")} align="left" />
        {matches.length > 0 ? (
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {matches.map((tutor) => (
              <TutorCard key={tutor.id} tutor={tutor} />
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center text-slate">{tItem("tutorsEmpty")}</div>
        )}
      </Section>
      <Section className="bg-navy text-white">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-extrabold md:text-4xl">{tItem("becomeTutor.title")}</h2>
          <p className="mt-4 text-lg leading-8 text-white/76">{tItem("becomeTutor.description")}</p>
          <div className="mt-8">
            <Button href="/become-a-tutor" size="lg">
              {tItem("becomeTutor.cta")}
            </Button>
          </div>
        </div>
      </Section>
    </MarketingShell>
  );
}
