import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingPageHero } from "@/components/marketing/MarketingPageHero";
import { SubjectGrid } from "@/components/marketing/SubjectGrid";
import { SectionIntro } from "@/components/marketing/SectionIntro";
import { Section } from "@/components/ui/Section";
import { Link } from "@/i18n/navigation";
import { publicPageMetadata } from "@/lib/publicMetadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "publicExperience.subjects" });
  return publicPageMetadata({ locale, path: "/subjects", title: t("metaTitle"), description: t("metaDescription") });
}

export default async function SubjectsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "publicExperience.subjects" });
  return (
    <MarketingShell>
      <MarketingPageHero eyebrow={t("hero.eyebrow")} title={t("hero.title")} description={t("hero.description")} primary={{ label: t("hero.primary"), href: "/find-tutors" }} secondary={{ label: t("hero.secondary"), href: "/how-it-works" }} />
      <SubjectGrid showHeader={false} />
      <Section className="bg-white">
        <SectionIntro title={t("guidance.heading")} description={t("guidance.description")} align="left" />
      </Section>
      <Section className="bg-off-white pt-0">
        <div className="mx-auto flex max-w-2xl flex-col gap-3 border-t border-border pt-8 text-center">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue">{t("explore.heading")}</p>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
            <Link href="/resources/how-to-choose-a-tutor" className="font-semibold text-navy hover:text-blue">{t("explore.chooseATutor")}</Link>
            <Link href="/resources/when-to-get-a-tutor" className="font-semibold text-navy hover:text-blue">{t("explore.whenToGetATutor")}</Link>
            <Link href="/how-it-works" className="font-semibold text-navy hover:text-blue">{t("explore.howItWorks")}</Link>
            <Link href="/tutoring/edmonton" className="font-semibold text-navy hover:text-blue">{t("explore.edmonton")}</Link>
          </div>
        </div>
      </Section>
    </MarketingShell>
  );
}
