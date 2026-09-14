import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { Breadcrumbs } from "@/components/ui/Navigation";
import { getResourceArticle } from "@/content/resources";
import { publicPageMetadata } from "@/lib/publicMetadata";

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

  const formattedUpdatedAt = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(new Date(article.updatedAt));

  return (
    <MarketingShell>
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
      <Section className="bg-navy text-white">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-extrabold md:text-4xl">{t("cta.title")}</h2>
          <p className="mt-4 text-lg leading-8 text-white/76">{t("cta.description")}</p>
          <div className="mt-8">
            <Button href="/find-tutors" size="lg">
              {t("cta.primary")}
            </Button>
          </div>
        </div>
      </Section>
    </MarketingShell>
  );
}
