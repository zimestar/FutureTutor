import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingPageHero } from "@/components/marketing/MarketingPageHero";
import { SectionIntro } from "@/components/marketing/SectionIntro";
import { Section } from "@/components/ui/Section";
import { Breadcrumbs } from "@/components/ui/Navigation";
import { Link } from "@/i18n/navigation";
import { ArrowRight, Library } from "lucide-react";
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
  const tLibrary = await getTranslations({ locale, namespace: "library" });
  const tArticles = await getTranslations({ locale, namespace: "resourceArticles.items" });
  const articles = listPublishedResourceArticles();

  return (
    <MarketingShell>
      <Section className="border-b border-border bg-white py-3.5 md:py-3.5">
        <Breadcrumbs items={[{ label: t("breadcrumbHome"), href: "/" }, { label: t("breadcrumbLabel") }]} />
      </Section>
      <MarketingPageHero tone="mint" eyebrow={t("hero.eyebrow")} title={t("hero.title")} description={t("hero.description")} primary={{ label: t("hero.primary"), href: "/find-tutors" }} secondary={{ label: t("hero.secondary"), href: "/become-a-tutor" }} />
      <Section className="bg-white pb-0 md:pb-0">
        <Link href="/resources/library" className="motion-lift relative flex flex-col gap-6 overflow-hidden rounded-[32px] bg-blue p-8 text-white hover:shadow-(--shadow-pop) sm:flex-row sm:items-center sm:p-10">
          <span aria-hidden="true" className="pointer-events-none absolute -right-14 -top-16 size-56 rounded-full bg-sun" />
          <span className="relative flex size-16 shrink-0 items-center justify-center rounded-3xl bg-white text-blue">
            <Library className="size-8" aria-hidden="true" />
          </span>
          <span className="relative min-w-0 flex-1">
            <span className="inline-flex rounded-full bg-sun px-3 py-1 text-xs font-extrabold uppercase tracking-[0.12em] text-navy">{tLibrary("homeCard.eyebrow")}</span>
            <span className="mt-3 block text-2xl font-extrabold sm:text-3xl">{tLibrary("homeCard.title")}</span>
            <span className="mt-2 block max-w-2xl leading-7 text-white/85">{tLibrary("homeCard.text")}</span>
          </span>
          <span className="relative inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-5 py-3 font-bold text-navy">
            {tLibrary("homeCard.cta")} <ArrowRight className="size-4" aria-hidden="true" />
          </span>
        </Link>
      </Section>
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
