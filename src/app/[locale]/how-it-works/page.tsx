import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { LearningModes } from "@/components/marketing/LearningModes";
import { FAQ } from "@/components/marketing/FAQ";
import { FinalCTA } from "@/components/marketing/FinalCTA";
import { Section } from "@/components/ui/Section";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.howItWorks" });
  return { title: t("title"), description: t("description") };
}

export default async function HowItWorksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "howItWorks" });

  return (
    <MarketingShell>
      <Section className="bg-navy pb-8 pt-14 text-center text-white md:pt-20">
        <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">{t("pageHeading")}</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-white/70">{t("pageSubheading")}</p>
      </Section>
      <HowItWorks />
      <LearningModes />
      <FAQ />
      <FinalCTA />
    </MarketingShell>
  );
}
