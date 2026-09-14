import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Header } from "@/components/marketing/Header";
import { Hero } from "@/components/marketing/Hero";
import { SubjectGrid } from "@/components/marketing/SubjectGrid";
import { FeaturedTutors } from "@/components/marketing/FeaturedTutors";
import { LearningModes } from "@/components/marketing/LearningModes";
import { TutorCTA } from "@/components/marketing/TutorCTA";
import { FAQ } from "@/components/marketing/FAQ";
import { FinalCTA } from "@/components/marketing/FinalCTA";
import { Footer } from "@/components/marketing/Footer";
import { HomeStory } from "@/components/marketing/HomeStory";
import { Section } from "@/components/ui/Section";
import { Link } from "@/i18n/navigation";
import { site } from "@/content/site";
import { faqItemIds } from "@/content/faq";
import { publicPageMetadata } from "@/lib/publicMetadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "site" });
  return publicPageMetadata({ locale, path: "/", title: t("tagline"), description: t("description") });
}

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, tFaq, tExplore] = await Promise.all([
    getTranslations({ locale, namespace: "site" }),
    getTranslations({ locale, namespace: "faq" }),
    getTranslations({ locale, namespace: "publicExperience.home.explore" }),
  ]);

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItemIds.map((id) => ({
      "@type": "Question",
      name: tFaq(`items.${id}.question`),
      acceptedAnswer: {
        "@type": "Answer",
        text: tFaq(`items.${id}.answer`),
      },
    })),
  };

  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    url: site.url,
    description: t("description"),
    areaServed: "CA",
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <Header />
      <main id="main" className="flex-1">
        <Hero />
        <HomeStory />
        <SubjectGrid />
        <FeaturedTutors locale={locale} />
        <LearningModes />
        <TutorCTA />
        <Section className="bg-white pt-0">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue">{tExplore("heading")}</p>
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
              <Link href="/tutoring/edmonton" className="font-semibold text-navy hover:text-blue">{tExplore("edmonton")}</Link>
              <Link href="/resources" className="font-semibold text-navy hover:text-blue">{tExplore("resources")}</Link>
            </div>
          </div>
        </Section>
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
