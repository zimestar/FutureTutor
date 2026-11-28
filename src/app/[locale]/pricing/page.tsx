import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, BookOpen, Clock3, GraduationCap } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingPageHero } from "@/components/marketing/MarketingPageHero";
import { InfoChecklist, InfoCta, InfoFaq, InfoFeatures, InfoSteps, type InfoItem, type InfoQuestion } from "@/components/marketing/InfoBlocks";
import { Section } from "@/components/ui/Section";
import { Breadcrumbs } from "@/components/ui/Navigation";
import { Link } from "@/i18n/navigation";
import { publicPageMetadata } from "@/lib/publicMetadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "infoPages.pricing" });
  return publicPageMetadata({ locale, path: "/pricing", title: t("metaTitle"), description: t("metaDescription") });
}

export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tCommon] = await Promise.all([
    getTranslations({ locale, namespace: "infoPages.pricing" }),
    getTranslations({ locale, namespace: "infoPages.common" }),
  ]);
  return (
    <MarketingShell>
      <Section className="border-b border-border bg-white py-3.5 md:py-3.5">
        <Breadcrumbs items={[{ label: tCommon("breadcrumbHome"), href: "/" }, { label: t("breadcrumb") }]} />
      </Section>
      <MarketingPageHero tone="lilac"
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        description={t("hero.description")}
        primary={{ label: t("hero.primary"), href: "/find-tutors" }}
        secondary={{ label: t("hero.secondary"), href: "/signup" }}
      />
      <InfoFeatures eyebrow={t("factors.eyebrow")} title={t("factors.title")} items={t.raw("factors.items") as InfoItem[]} icons={[BookOpen, GraduationCap, Clock3]} tone="white" />
      <InfoSteps eyebrow={t("steps.eyebrow")} title={t("steps.title")} items={t.raw("steps.items") as InfoItem[]} tone="canvas" />
      <Section className="bg-canvas pt-0 md:pt-0">
        <InfoChecklist title={t("promises.title")} items={t.raw("promises.items") as string[]}>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 border-t border-white/15 pt-6 text-sm font-semibold">
            <Link href="/terms" className="inline-flex items-center gap-1.5 text-white hover:text-mint">
              {t("termsLink")}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link href="/resources/cost-of-tutoring" className="inline-flex items-center gap-1.5 text-white hover:text-mint">
              {t("guideLink")}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </InfoChecklist>
      </Section>
      <InfoFaq title={tCommon("faqTitle")} items={t.raw("faq") as InfoQuestion[]} />
      <InfoCta
        title={t("cta.title")}
        description={t("cta.description")}
        primary={{ label: t("cta.primary"), href: "/find-tutors" }}
        secondary={{ label: t("cta.secondary"), href: "/how-it-works" }}
      />
    </MarketingShell>
  );
}
