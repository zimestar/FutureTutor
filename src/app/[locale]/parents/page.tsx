import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CreditCard, ShieldAlert, ShieldCheck, UsersRound } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingPageHero } from "@/components/marketing/MarketingPageHero";
import { InfoCta, InfoFaq, InfoFeatures, InfoSteps, type InfoItem, type InfoQuestion } from "@/components/marketing/InfoBlocks";
import { Section } from "@/components/ui/Section";
import { Breadcrumbs } from "@/components/ui/Navigation";
import { publicPageMetadata } from "@/lib/publicMetadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "infoPages.parents" });
  return publicPageMetadata({ locale, path: "/parents", title: t("metaTitle"), description: t("metaDescription") });
}

export default async function ParentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tCommon] = await Promise.all([
    getTranslations({ locale, namespace: "infoPages.parents" }),
    getTranslations({ locale, namespace: "infoPages.common" }),
  ]);
  return (
    <MarketingShell>
      <Section className="border-b border-border bg-white py-3.5 md:py-3.5">
        <Breadcrumbs items={[{ label: tCommon("breadcrumbHome"), href: "/" }, { label: t("breadcrumb") }]} />
      </Section>
      <MarketingPageHero
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        description={t("hero.description")}
        primary={{ label: t("hero.primary"), href: "/signup?role=parent" }}
        secondary={{ label: t("hero.secondary"), href: "/find-tutors" }}
        image="/images/parent-homework-help-v2.webp"
        imageAlt={t("hero.imageAlt")}
      />
      <InfoSteps eyebrow={t("steps.eyebrow")} title={t("steps.title")} items={t.raw("steps.items") as InfoItem[]} />
      <InfoFeatures eyebrow={t("features.eyebrow")} title={t("features.title")} items={t.raw("features.items") as InfoItem[]} icons={[UsersRound, CreditCard, ShieldCheck, ShieldAlert]} />
      <InfoFaq title={tCommon("faqTitle")} items={t.raw("faq") as InfoQuestion[]} />
      <InfoCta
        title={t("cta.title")}
        description={t("cta.description")}
        primary={{ label: t("cta.primary"), href: "/signup?role=parent" }}
        secondary={{ label: t("cta.secondary"), href: "/pricing" }}
      />
    </MarketingShell>
  );
}
