import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarClock, Globe, Maximize, MicVocal, MonitorUp, Timer } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingPageHero } from "@/components/marketing/MarketingPageHero";
import { InfoChecklist, InfoCta, InfoFaq, InfoFeatures, InfoSteps, type InfoItem, type InfoQuestion } from "@/components/marketing/InfoBlocks";
import { Section } from "@/components/ui/Section";
import { Breadcrumbs } from "@/components/ui/Navigation";
import { publicPageMetadata } from "@/lib/publicMetadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "infoPages.classroom" });
  return publicPageMetadata({ locale, path: "/online-classroom", title: t("metaTitle"), description: t("metaDescription") });
}

export default async function OnlineClassroomPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tCommon] = await Promise.all([
    getTranslations({ locale, namespace: "infoPages.classroom" }),
    getTranslations({ locale, namespace: "infoPages.common" }),
  ]);
  return (
    <MarketingShell>
      <Section className="border-b border-border bg-white py-3.5 md:py-3.5">
        <Breadcrumbs items={[{ label: tCommon("breadcrumbHome"), href: "/" }, { label: t("breadcrumb") }]} />
      </Section>
      <MarketingPageHero tone="blue"
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        description={t("hero.description")}
        primary={{ label: t("hero.primary"), href: "/find-tutors" }}
        secondary={{ label: t("hero.secondary"), href: "/how-it-works" }}
        image="/images/online-classroom-session.webp"
        imagePosition="62% center"
        imageAlt={t("hero.imageAlt")}
      />
      <InfoFeatures eyebrow={t("features.eyebrow")} title={t("features.title")} items={t.raw("features.items") as InfoItem[]} icons={[Globe, MicVocal, MonitorUp, Timer, Maximize, CalendarClock]} tone="white" />
      <InfoSteps eyebrow={t("steps.eyebrow")} title={t("steps.title")} items={t.raw("steps.items") as InfoItem[]} tone="canvas" />
      <Section className="bg-canvas pt-0 md:pt-0">
        <InfoChecklist title={t("requirements.title")} items={t.raw("requirements.items") as string[]} />
      </Section>
      <InfoFaq title={tCommon("faqTitle")} items={t.raw("faq") as InfoQuestion[]} />
      <InfoCta
        title={t("cta.title")}
        description={t("cta.description")}
        primary={{ label: t("cta.primary"), href: "/find-tutors" }}
        secondary={{ label: t("cta.secondary"), href: "/signup" }}
      />
    </MarketingShell>
  );
}
