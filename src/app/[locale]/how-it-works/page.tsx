import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarCheck2, Compass, CreditCard, Search, UsersRound, Video } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingPageHero } from "@/components/marketing/MarketingPageHero";
import { SectionIntro } from "@/components/marketing/SectionIntro";
import { LearningModes } from "@/components/marketing/LearningModes";
import { FAQ } from "@/components/marketing/FAQ";
import { FinalCTA } from "@/components/marketing/FinalCTA";
import { Section } from "@/components/ui/Section";
import { publicPageMetadata } from "@/lib/publicMetadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "publicExperience.how" });
  return publicPageMetadata({ locale, path: "/how-it-works", title: t("metaTitle"), description: t("metaDescription") });
}

const stepIcons = [Compass, Search, UsersRound, CreditCard, Video, CalendarCheck2];

export default async function HowItWorksPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "publicExperience.how" });
  return (
    <MarketingShell>
      <MarketingPageHero eyebrow={t("hero.eyebrow")} title={t("hero.title")} description={t("hero.description")} primary={{ label: t("hero.primary"), href: "/find-tutors" }} secondary={{ label: t("hero.secondary"), href: "/signup" }} />
      <Section className="bg-white"><SectionIntro eyebrow={t("journey.eyebrow")} title={t("journey.title")} description={t("journey.description")} /><ol className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{stepIcons.map((Icon, index) => <li key={index} className="rounded-2xl border border-border bg-off-white p-6"><div className="flex items-center justify-between"><span className="flex size-11 items-center justify-center rounded-xl bg-white text-blue shadow-card"><Icon className="size-5" aria-hidden="true" /></span><span className="text-sm font-extrabold text-blue">{String(index + 1).padStart(2, "0")}</span></div><h3 className="mt-6 text-xl font-extrabold text-navy">{t(`journey.items.${index}.title`)}</h3><p className="mt-3 leading-7 text-text-secondary">{t(`journey.items.${index}.description`)}</p></li>)}</ol></Section>
      <LearningModes /><FAQ /><FinalCTA />
    </MarketingShell>
  );
}
