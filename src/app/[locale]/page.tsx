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

  const [t, tFaq] = await Promise.all([
    getTranslations({ locale, namespace: "site" }),
    getTranslations({ locale, namespace: "faq" }),
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
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
import type { Metadata } from "next";
