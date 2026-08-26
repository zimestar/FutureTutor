import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarRange, CheckCircle2, FileCheck2, Presentation, UserRoundCheck } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingPageHero } from "@/components/marketing/MarketingPageHero";
import { SectionIntro } from "@/components/marketing/SectionIntro";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { publicPageMetadata } from "@/lib/publicMetadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "publicExperience.forTutors" });
  return publicPageMetadata({ locale, path: "/become-a-tutor", title: t("metaTitle"), description: t("metaDescription") });
}

const valueIcons = [Presentation, CalendarRange, UserRoundCheck];
const processIcons = [UserRoundCheck, FileCheck2, CalendarRange, CheckCircle2];

export default async function BecomeATutorPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "publicExperience.forTutors" });
  return (
    <MarketingShell>
      <MarketingPageHero eyebrow={t("hero.eyebrow")} title={t("hero.title")} description={t("hero.description")} primary={{ label: t("hero.primary"), href: "/signup" }} secondary={{ label: t("hero.secondary"), href: "/tutor-resources" }} image="/images/tutor-hero.png" imageAlt={t("hero.imageAlt")} imagePosition="center" />
      <Section className="bg-white">
        <SectionIntro eyebrow={t("value.eyebrow")} title={t("value.title")} description={t("value.description")} />
        <div className="mt-12 grid gap-5 md:grid-cols-3">{valueIcons.map((Icon, index) => <article key={index} className="rounded-2xl border border-border p-7"><Icon className="size-7 text-blue" aria-hidden="true" /><h3 className="mt-6 text-xl font-extrabold text-navy">{t(`value.items.${index}.title`)}</h3><p className="mt-3 leading-7 text-text-secondary">{t(`value.items.${index}.description`)}</p></article>)}</div>
      </Section>
      <Section className="bg-off-white">
        <SectionIntro eyebrow={t("process.eyebrow")} title={t("process.title")} description={t("process.description")} />
        <ol className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">{processIcons.map((Icon, index) => <li key={index} className="rounded-2xl border border-border bg-white p-6 shadow-card"><span className="flex size-11 items-center justify-center rounded-xl bg-blue/10 text-blue"><Icon className="size-5" aria-hidden="true" /></span><p className="mt-5 text-sm font-bold text-blue">{t("process.step", { number: index + 1 })}</p><h3 className="mt-2 font-extrabold text-navy">{t(`process.items.${index}.title`)}</h3><p className="mt-2 text-sm leading-6 text-text-secondary">{t(`process.items.${index}.description`)}</p></li>)}</ol>
      </Section>
      <Section className="bg-navy text-white"><div className="mx-auto max-w-3xl text-center"><h2 className="text-balance text-3xl font-extrabold md:text-5xl">{t("cta.title")}</h2><p className="mt-5 text-lg leading-8 text-white/72">{t("cta.description")}</p><div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><Button href="/signup" size="lg">{t("cta.primary")}</Button><Button href="/tutor-resources" variant="ghost-inverse" size="lg">{t("cta.secondary")}</Button></div></div></Section>
    </MarketingShell>
  );
}
