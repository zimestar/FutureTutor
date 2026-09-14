import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingPageHero } from "@/components/marketing/MarketingPageHero";
import { SectionIntro } from "@/components/marketing/SectionIntro";
import { Section } from "@/components/ui/Section";
import { Breadcrumbs } from "@/components/ui/Navigation";
import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";
import { listPublishedResourceArticles } from "@/content/resources";
import { publicPageMetadata } from "@/lib/publicMetadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "resourceHub" });
  return publicPageMetadata({ locale, path: "/resources", title: t("metaTitle"), description: t("metaDescription") });
}

export default async function ResourcesIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "resourceHub" });
  const tArticles = await getTranslations({ locale, namespace: "resourceArticles.items" });
  const articles = listPublishedResourceArticles();

  return (
    <MarketingShell>
      <Section className="bg-off-white pb-0">
        <Breadcrumbs items={[{ label: t("breadcrumbHome"), href: "/" }, { label: t("breadcrumbLabel") }]} />
      </Section>
      <MarketingPageHero eyebrow={t("hero.eyebrow")} title={t("hero.title")} description={t("hero.description")} primary={{ label: t("hero.primary"), href: "/find-tutors" }} secondary={{ label: t("hero.secondary"), href: "/become-a-tutor" }} />
      <Section className="bg-white">
        <SectionIntro eyebrow={t("list.eyebrow")} title={t("list.title")} align="left" />
        {articles.length > 0 ? (
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {articles.map((article) => (
              <Link key={article.slug} href={`/resources/${article.slug}`} className="group flex flex-col rounded-2xl border border-border bg-white p-7 shadow-card transition-shadow hover:shadow-pop">
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue">{t(`categories.${article.category}`)}</p>
                <h3 className="mt-3 text-xl font-extrabold text-navy">{tArticles(`${article.slug}.title`)}</h3>
                <p className="mt-3 flex-1 leading-7 text-text-secondary">{tArticles(`${article.slug}.metaDescription`)}</p>
                <span className="mt-6 inline-flex items-center gap-2 font-bold text-blue group-hover:text-blue-hover">
                  {t("readMore")}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-10 rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center text-slate">{t("empty")}</div>
        )}
      </Section>
    </MarketingShell>
  );
}
