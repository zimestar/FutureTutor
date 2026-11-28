import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, BookOpen, ExternalLink, Sigma } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { SectionIntro } from "@/components/marketing/SectionIntro";
import { Section } from "@/components/ui/Section";
import { Breadcrumbs } from "@/components/ui/Navigation";
import { Link } from "@/i18n/navigation";
import { countSheets, getLibraryProvince, libraryProvinces, pick } from "@/content/library";
import { publicPageMetadata } from "@/lib/publicMetadata";

type Params = { locale: string; province: string };

export function generateStaticParams() {
  return libraryProvinces.filter((p) => p.available).map((p) => ({ province: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { locale, province: slug } = await params;
  const province = getLibraryProvince(slug);
  if (!province) return {};
  const t = await getTranslations({ locale, namespace: "library" });
  return publicPageMetadata({ locale, path: `/resources/library/${slug}`, title: `${pick(province.name, locale)} — ${t("metaTitle")}`, description: t("metaDescription") });
}

const courseTones = [
  { card: "border-blue-100 bg-blue-50", chip: "bg-blue text-white" },
  { card: "border-coral-100 bg-coral-50", chip: "bg-coral text-navy" },
  { card: "border-mint-100 bg-mint-50", chip: "bg-mint text-navy" },
];

export default async function LibraryProvincePage({ params }: { params: Promise<Params> }) {
  const { locale, province: slug } = await params;
  const province = getLibraryProvince(slug);
  if (!province) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "library" });

  return (
    <MarketingShell>
      <Section className="border-b border-border bg-white py-3.5 md:py-3.5">
        <Breadcrumbs items={[{ label: t("breadcrumbResources"), href: "/resources" }, { label: t("breadcrumbLibrary"), href: "/resources/library" }, { label: pick(province.name, locale) }]} />
      </Section>
      <section className="relative overflow-hidden bg-blue py-14 text-white md:py-20">
        <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-sun" />
        <div className="relative mx-auto w-full max-w-(--container-page) px-5 md:px-10">
          <p className="motion-intro text-sm font-bold uppercase tracking-[0.18em] text-sun-ink">{t("breadcrumbLibrary")}</p>
          <h1 className="motion-intro mt-3 text-4xl font-extrabold tracking-[-0.025em] [--motion-delay:80ms] md:text-6xl">{pick(province.name, locale)}</h1>
          {province.officialHomeUrl && (
            <a href={province.officialHomeUrl} target="_blank" rel="noopener noreferrer" className="motion-intro mt-6 inline-flex items-center gap-2 font-semibold text-white/90 underline-offset-4 [--motion-delay:160ms] hover:underline">
              {t("province.official")} <ExternalLink className="size-4" aria-hidden="true" />
            </a>
          )}
        </div>
      </section>

      <Section className="bg-white">
        <SectionIntro eyebrow={t("province.eyebrow")} title={t("province.title")} align="left" />
        <ul className="reveal-stagger mt-10 grid gap-5 md:grid-cols-2">
          {province.courses.map((course, index) => {
            const tone = courseTones[index % courseTones.length];
            const chapterCount = course.strands.reduce((n, s) => n + s.chapters.length, 0);
            return (
              <li key={course.slug}>
                <Link href={`/resources/library/${province.slug}/${course.slug}`} className={`motion-lift flex h-full flex-col rounded-3xl border p-7 hover:shadow-(--shadow-card-hover) ${tone.card}`}>
                  <span className={`flex size-14 items-center justify-center rounded-2xl ${tone.chip}`}>
                    {course.subject === "math" ? <Sigma className="size-7" aria-hidden="true" /> : <BookOpen className="size-7" aria-hidden="true" />}
                  </span>
                  <span className="mt-5 text-sm font-bold text-navy/60">{pick(course.level, locale)}</span>
                  <span className="mt-1 text-2xl font-extrabold text-navy">{pick(course.title, locale)}</span>
                  <span className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-navy">{t("province.chapters", { count: chapterCount })}</span>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-700">{t("province.sheets", { count: countSheets(course) })}</span>
                  </span>
                  <span className="mt-auto inline-flex items-center gap-2 pt-6 font-bold text-blue">
                    {t("course.open")} <ArrowRight className="size-4" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Section>
    </MarketingShell>
  );
}
