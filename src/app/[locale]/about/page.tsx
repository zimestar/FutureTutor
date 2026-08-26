import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, HeartHandshake, MoveRight, Telescope, Waypoints } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingPageHero } from "@/components/marketing/MarketingPageHero";
import { SectionIntro } from "@/components/marketing/SectionIntro";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { publicPageMetadata } from "@/lib/publicMetadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "publicExperience.about" });
  return publicPageMetadata({ locale, path: "/about", title: t("metaTitle"), description: t("metaDescription") });
}

const principleIcons = [Waypoints, HeartHandshake, MoveRight];

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "publicExperience.about" });
  return (
    <MarketingShell>
      <MarketingPageHero eyebrow={t("hero.eyebrow")} title={t("hero.title")} description={t("hero.description")} primary={{ label: t("hero.primary"), href: "/how-it-works" }} secondary={{ label: t("hero.secondary"), href: "/find-tutors" }} image="/images/about-mission.png" imageAlt={t("hero.imageAlt")} imagePosition="65% center" />
      <Section className="bg-white">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
          <SectionIntro eyebrow={t("why.eyebrow")} title={t("why.title")} description={t("why.description")} align="left" />
          <blockquote className="rounded-3xl border border-blue/15 bg-off-white p-8 text-2xl font-extrabold leading-10 text-navy md:p-10 md:text-3xl">{t("why.statement")}</blockquote>
        </div>
      </Section>
      <Section className="bg-off-white">
        <SectionIntro eyebrow={t("belief.eyebrow")} title={t("belief.title")} description={t("belief.description")} />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {principleIcons.map((Icon, index) => <article key={index} className="rounded-2xl border border-border bg-white p-7 shadow-card"><Icon className="size-7 text-blue" aria-hidden="true" /><h3 className="mt-6 text-xl font-extrabold text-navy">{t(`belief.items.${index}.title`)}</h3><p className="mt-3 leading-7 text-text-secondary">{t(`belief.items.${index}.description`)}</p></article>)}
        </div>
      </Section>
      <Section className="bg-navy text-white">
        <div className="mx-auto max-w-3xl text-center"><Telescope className="mx-auto size-8 text-mint" aria-hidden="true" /><h2 className="mt-6 text-balance text-3xl font-extrabold md:text-5xl">{t("future.title")}</h2><p className="mt-5 text-lg leading-8 text-white/72">{t("future.description")}</p><div className="mt-8"><Button href="/find-tutors" size="lg">{t("future.cta")}<ArrowRight className="size-4" aria-hidden="true" /></Button></div></div>
      </Section>
    </MarketingShell>
  );
}
