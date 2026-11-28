import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, Info, LockKeyhole, ShieldAlert, UserRoundCheck, Video } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingPageHero } from "@/components/marketing/MarketingPageHero";
import { InfoCta, InfoFaq, InfoFeatures, InfoSteps, type InfoItem, type InfoQuestion } from "@/components/marketing/InfoBlocks";
import { Section } from "@/components/ui/Section";
import { Breadcrumbs } from "@/components/ui/Navigation";
import { Link } from "@/i18n/navigation";
import { publicPageMetadata } from "@/lib/publicMetadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "infoPages.safety" });
  return publicPageMetadata({ locale, path: "/safety", title: t("metaTitle"), description: t("metaDescription") });
}

export default async function SafetyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tCommon] = await Promise.all([
    getTranslations({ locale, namespace: "infoPages.safety" }),
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
        primary={{ label: t("hero.primary"), href: "/report-concern" }}
        secondary={{ label: t("hero.secondary"), href: "/find-tutors" }}
      />
      <InfoSteps eyebrow={t("steps.eyebrow")} title={t("steps.title")} items={t.raw("steps.items") as InfoItem[]} />
      <Section className="bg-white pt-0 md:pt-0">
        <div className="mx-auto flex max-w-4xl items-start gap-4 rounded-3xl border border-blue/15 bg-blue/5 p-7 sm:p-8">
          <Info className="mt-1 size-6 shrink-0 text-blue" aria-hidden="true" />
          <div>
            <h2 className="text-xl font-bold text-navy">{t("honesty.title")}</h2>
            <p className="mt-2 leading-7 text-text-secondary">{t("honesty.text")}</p>
          </div>
        </div>
      </Section>
      <InfoFeatures eyebrow={t("features.eyebrow")} title={t("features.title")} items={t.raw("features.items") as InfoItem[]} icons={[Video, LockKeyhole, ShieldAlert, UserRoundCheck]} />
      <Section className="bg-canvas pt-0 md:pt-0">
        <div className="flex justify-center">
          <Link href="/privacy" className="inline-flex items-center gap-2 font-semibold text-blue hover:text-blue-hover">
            {t("privacyLink")}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </Section>
      <InfoFaq title={tCommon("faqTitle")} items={t.raw("faq") as InfoQuestion[]} />
      <InfoCta
        title={t("cta.title")}
        description={t("cta.description")}
        primary={{ label: t("cta.primary"), href: "/report-concern" }}
        secondary={{ label: t("cta.secondary"), href: "/contact" }}
      />
    </MarketingShell>
  );
}
