import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Section } from "@/components/ui/Section";
import { TrackedCtaButton } from "@/components/marketing/TrackedCtaButton";
import { Breadcrumbs } from "@/components/ui/Navigation";
import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";
import { getResourceArticle, listPublishedResourceArticles } from "@/content/resources";
import { publicPageMetadata } from "@/lib/publicMetadata";
import { TrackPageView } from "@/components/marketing/TrackPageView";
import type { Locale } from "@/lib/analytics";

type Params = { locale: string; slug: string };

const SECTION_INDICES = [0, 1, 2, 3] as const;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const article = getResourceArticle(slug);
  if (!article) return {};

  const t = await getTranslations({ locale, namespace: `resourceArticles.items.${slug}` });
  return publicPageMetadata({
    locale,
    path: `/resources/${slug}`,
    title: t("metaTitle"),
    description: t("metaDescription"),
    index: !article.draft,
  });
}

export default async function ResourceArticlePage({ params }: { params: Promise<Params> }) {
  const { locale, slug } = await params;
  const article = getResourceArticle(slug);
  if (!article) notFound();

  setRequestLocale(locale);
  const tHub = await getTranslations({ locale, namespace: "resourceHub" });
  const t = await getTranslations({ locale, namespace: `resourceArticles.items.${slug}` });
  const tArticles = await getTranslations({ locale, namespace: "resourceArticles.items" });

  const formattedUpdatedAt = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(new Date(article.updatedAt));
  const publishedSlugs = new Set(listPublishedResourceArticles().map((a) => a.slug));
  const relatedArticles = (article.relatedSlugs ?? []).filter((relatedSlug) => publishedSlugs.has(relatedSlug));

  return (
    <MarketingShell>
      <TrackPageView event="resource_article_viewed" properties={{ locale: locale as Locale, resource_slug: slug }} />
      <Section className="bg-off-white pb-0">
        <Breadcrumbs
          items={[
            { label: tHub("breadcrumbHome"), href: "/" },
            { label: tHub("breadcrumbLabel"), href: "/resources" },
            { label: t("title") },
          ]}
        />
      </Section>
      <Section className="bg-off-white pt-6">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue">{tHub(`categories.${article.category}`)}</p>
          <h1 className="mt-3 text-balance text-4xl font-extrabold tracking-tight text-navy md:text-5xl">{t("title")}</h1>
          <p className="mt-5 text-lg leading-8 text-text-secondary">{t("intro")}</p>
          <p className="mt-4 text-sm text-text-muted">{tHub("updatedLabel", { date: formattedUpdatedAt })}</p>
        </div>
      </Section>
      <Section className="bg-white pt-0">
        <div className="mx-auto flex max-w-3xl flex-col gap-10">
          {SECTION_INDICES.map((index) => (
            <article key={index}>
              <h2 className="text-2xl font-extrabold text-navy">{t(`sections.${index}.heading`)}</h2>
              <p className="mt-3 leading-8 text-text-secondary">{t(`sections.${index}.body`)}</p>
            </article>
          ))}
        </div>
      </Section>
      {relatedArticles.length > 0 && (
        <Section className="bg-white pt-0">
          <div className="mx-auto flex max-w-3xl flex-col gap-3 border-t border-border pt-8">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue">{tHub("relatedHeading")}</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {relatedArticles.map((relatedSlug) => (
                <Link key={relatedSlug} href={`/resources/${relatedSlug}`} className="inline-flex items-center gap-1.5 font-semibold text-navy hover:text-blue">
                  {tArticles(`${relatedSlug}.title`)}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </div>
        </Section>
      )}
      <Section className="bg-navy text-white">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-extrabold md:text-4xl">{t("cta.title")}</h2>
          <p className="mt-4 text-lg leading-8 text-white/76">{t("cta.description")}</p>
          <div className="mt-8">
            <TrackedCtaButton href={article.primaryLinkHref} event="resource_primary_cta_clicked" properties={{ resource_slug: slug }} size="lg">
              {t("cta.primary")}
            </TrackedCtaButton>
          </div>
        </div>
      </Section>
    </MarketingShell>
  );
}
