import { getTranslations, setRequestLocale } from "next-intl/server";
import { Header } from "@/components/marketing/Header";
import { Hero } from "@/components/marketing/Hero";
import { TrustStrip } from "@/components/marketing/TrustStrip";
import { SubjectGrid } from "@/components/marketing/SubjectGrid";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { FeaturedTutors } from "@/components/marketing/FeaturedTutors";
import { Benefits } from "@/components/marketing/Benefits";
import { LearningModes } from "@/components/marketing/LearningModes";
import { FutureVision } from "@/components/marketing/FutureVision";
import { ParentTrust } from "@/components/marketing/ParentTrust";
import { TutorCTA } from "@/components/marketing/TutorCTA";
import { FAQ } from "@/components/marketing/FAQ";
import { FinalCTA } from "@/components/marketing/FinalCTA";
import { Footer } from "@/components/marketing/Footer";
import { site } from "@/content/site";
import { faqItemIds } from "@/content/faq";

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "site" });
  const tFaq = await getTranslations({ locale, namespace: "faq" });

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
        <TrustStrip />
        <SubjectGrid />
        <HowItWorks />
        <FeaturedTutors />
        <Benefits />
        <LearningModes />
        <FutureVision />
        <ParentTrust />
        <TutorCTA />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
