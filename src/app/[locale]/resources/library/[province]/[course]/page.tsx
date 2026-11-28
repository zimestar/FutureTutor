import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, ExternalLink, FileCheck2, Hourglass } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Section } from "@/components/ui/Section";
import { Breadcrumbs } from "@/components/ui/Navigation";
import { DotCluster, Sparkle } from "@/components/marketing/Decor";
import { Link } from "@/i18n/navigation";
import { getLibraryCourse, getLibraryProvince, libraryProvinces, pick } from "@/content/library";
import { publicPageMetadata } from "@/lib/publicMetadata";

type Params = { locale: string; province: string; course: string };

export function generateStaticParams() {
  return libraryProvinces.flatMap((p) => p.courses.map((c) => ({ province: p.slug, course: c.slug })));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { locale, province, course: slug } = await params;
  const course = getLibraryCourse(province, slug);
  if (!course) return {};
  const t = await getTranslations({ locale, namespace: "library" });
  return publicPageMetadata({ locale, path: `/resources/library/${province}/${slug}`, title: `${pick(course.title, locale)} — ${t("metaTitle")}`, description: t("metaDescription") });
}

const strandTones = [
  { head: "bg-blue text-white", card: "border-blue-100 bg-blue-50" },
  { head: "bg-coral text-navy", card: "border-coral-100 bg-coral-50" },
  { head: "bg-mint text-navy", card: "border-mint-100 bg-mint-50" },
  { head: "bg-lilac text-white", card: "border-lilac-100 bg-lilac-50" },
];

export default async function LibraryCoursePage({ params }: { params: Promise<Params> }) {
  const { locale, province: provinceSlug, course: slug } = await params;
  const province = getLibraryProvince(provinceSlug);
  const course = getLibraryCourse(provinceSlug, slug);
  if (!province || !course) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "library" });

  return (
    <MarketingShell>
      <Section className="border-b border-border bg-white py-3.5 md:py-3.5">
        <Breadcrumbs
          items={[
            { label: t("breadcrumbLibrary"), href: "/resources/library" },
            { label: pick(province.name, locale), href: `/resources/library/${province.slug}` },
            { label: pick(course.title, locale) },
          ]}
        />
      </Section>

      <section className="relative overflow-hidden bg-coral py-14 text-navy md:py-20">
        <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-sun" />
        <DotCluster delay={300} className="right-[24%] top-10 hidden w-14 text-blue md:block" />
        <Sparkle delay={800} className="bottom-10 right-[12%] hidden w-9 text-white md:block" />
        <div className="relative mx-auto w-full max-w-(--container-page) px-5 md:px-10">
          <p className="motion-intro text-sm font-bold uppercase tracking-[0.18em] text-navy/70">
            {pick(province.name, locale)} · {pick(course.level, locale)}
          </p>
          <h1 className="motion-intro mt-3 text-4xl font-extrabold tracking-[-0.025em] [--motion-delay:80ms] md:text-6xl">{pick(course.title, locale)}</h1>
        </div>
      </section>

      <Section className="bg-white">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex flex-col gap-12">
            <h2 className="text-[2rem] font-extrabold leading-[1.1] text-navy">{t("course.chaptersTitle")}</h2>
            {course.strands.map((strand, strandIndex) => {
              const tone = strandTones[strandIndex % strandTones.length];
              return (
                <section key={strand.title.en} aria-labelledby={`strand-${strandIndex}`}>
                  <h3 id={`strand-${strandIndex}`} className={`inline-flex rounded-full px-4 py-1.5 text-sm font-extrabold ${tone.head}`}>{pick(strand.title, locale)}</h3>
                  <ul className="reveal-stagger mt-5 grid gap-4 sm:grid-cols-2">
                    {strand.chapters.map((chapter) => (
                      <li key={chapter.slug}>
                        <Link
                          href={`/resources/library/${province.slug}/${course.slug}/${chapter.slug}`}
                          className={`motion-lift flex h-full flex-col rounded-3xl border p-5 hover:shadow-(--shadow-card-hover) ${chapter.sheet ? tone.card : "border-border bg-white"}`}
                        >
                          <span className="font-bold text-navy">{pick(chapter.title, locale)}</span>
                          <span className="mt-2 text-sm leading-6 text-text-secondary">{pick(chapter.goal, locale)}</span>
                          <span className={`mt-4 inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${chapter.sheet ? "bg-white text-emerald-700" : "bg-neutral-100 text-neutral-500"}`}>
                            {chapter.sheet ? <FileCheck2 className="size-3.5" aria-hidden="true" /> : <Hourglass className="size-3.5" aria-hidden="true" />}
                            {chapter.sheet ? t("course.sheetAvailable") : t("course.sheetSoon")}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>

          <aside className="h-fit rounded-3xl border border-sun-100 bg-sun-50 p-6 lg:sticky lg:top-24">
            <p className="inline-flex rounded-full bg-sun px-3 py-1 text-xs font-extrabold uppercase tracking-[0.12em] text-navy">{t("course.officialTitle")}</p>
            <p className="mt-4 font-bold text-navy">{pick(course.officialName, locale)}</p>
            <p className="mt-2 text-sm leading-6 text-text-secondary">{pick(course.officialStatus, locale)}</p>
            <a href={course.officialUrl} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-blue hover:text-blue-hover">
              {t("course.officialCta")} <ExternalLink className="size-4" aria-hidden="true" />
            </a>
            <Link href="/find-tutors" className="mt-6 flex items-center justify-between gap-2 rounded-2xl bg-blue px-4 py-3 text-sm font-bold text-white hover:bg-blue-hover">
              {t("sheet.helpCta")} <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </aside>
        </div>
      </Section>
    </MarketingShell>
  );
}
