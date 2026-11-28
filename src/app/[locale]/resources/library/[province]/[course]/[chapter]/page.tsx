import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ExternalLink, HeartHandshake, Lightbulb, PenLine, Target, TriangleAlert } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Section } from "@/components/ui/Section";
import { Breadcrumbs } from "@/components/ui/Navigation";
import { Button } from "@/components/ui/Button";
import { DotCluster, HalfCircles, Sparkle } from "@/components/marketing/Decor";
import { Link } from "@/i18n/navigation";
import { getLibraryChapter, getLibraryProvince, libraryProvinces, pick } from "@/content/library";
import { publicPageMetadata } from "@/lib/publicMetadata";

type Params = { locale: string; province: string; course: string; chapter: string };

export function generateStaticParams() {
  return libraryProvinces.flatMap((p) =>
    p.courses.flatMap((c) => c.strands.flatMap((s) => s.chapters.map((ch) => ({ province: p.slug, course: c.slug, chapter: ch.slug }))))
  );
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { locale, province, course, chapter } = await params;
  const found = getLibraryChapter(province, course, chapter);
  if (!found) return {};
  const title = `${pick(found.chapter.title, locale)} — ${pick(found.course.title, locale)} | FutureTutor`;
  const description = pick(found.chapter.sheet?.summary ?? found.chapter.goal, locale);
  // Only tutor-reviewed sheets are offered to search engines.
  const index = found.chapter.sheet?.reviewStatus === "reviewed";
  return publicPageMetadata({ locale, path: `/resources/library/${province}/${course}/${chapter}`, title, description, index });
}

function Block({ icon, title, tone, children }: { icon: React.ReactNode; title: string; tone: string; children: React.ReactNode }) {
  return (
    <section className="reveal rounded-3xl border border-border bg-white p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${tone}`}>{icon}</span>
        <h2 className="text-xl font-extrabold text-navy sm:text-2xl">{title}</h2>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default async function LibraryChapterPage({ params }: { params: Promise<Params> }) {
  const { locale, province: provinceSlug, course: courseSlug, chapter: chapterSlug } = await params;
  const province = getLibraryProvince(provinceSlug);
  const found = getLibraryChapter(provinceSlug, courseSlug, chapterSlug);
  if (!province || !found) notFound();
  setRequestLocale(locale);
  const [t, tSubjects] = await Promise.all([
    getTranslations({ locale, namespace: "library" }),
    getTranslations({ locale, namespace: "subjects.items" }),
  ]);
  const { course, strand, chapter } = found;
  const sheet = chapter.sheet;
  const p = (text: { fr: string; en: string }) => pick(text, locale);
  const courseHref = `/resources/library/${province.slug}/${course.slug}`;

  return (
    <MarketingShell>
      <Section className="border-b border-border bg-white py-3.5 md:py-3.5">
        <Breadcrumbs
          items={[
            { label: t("breadcrumbLibrary"), href: "/resources/library" },
            { label: p(province.name), href: `/resources/library/${province.slug}` },
            { label: p(course.title), href: courseHref },
            { label: p(chapter.title) },
          ]}
        />
      </Section>

      <section className="relative overflow-hidden bg-mint py-14 text-navy md:py-20">
        <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-sun" />
        <DotCluster delay={300} className="right-[26%] top-10 hidden w-14 text-blue md:block" />
        <Sparkle delay={800} className="bottom-12 right-[14%] hidden w-9 text-white md:block" />
        <HalfCircles delay={1100} className="bottom-6 right-[4%] hidden w-24 text-coral md:block" />
        <div className="relative mx-auto w-full max-w-(--container-page) px-5 md:px-10">
          <p className="motion-intro text-sm font-bold uppercase tracking-[0.18em] text-navy/70">
            {p(course.title)} · {p(strand.title)}
          </p>
          <h1 className="motion-intro mt-3 max-w-3xl text-4xl font-extrabold tracking-[-0.025em] [--motion-delay:80ms] md:text-5xl">{p(chapter.title)}</h1>
          <p className="motion-intro mt-5 flex max-w-2xl items-start gap-2 text-lg leading-8 text-navy/85 [--motion-delay:160ms]">
            <Target className="mt-1.5 size-5 shrink-0" aria-hidden="true" />
            <span><span className="font-bold">{t("sheet.goal")} : </span>{p(chapter.goal)}</span>
          </p>
        </div>
      </section>

      <Section className="bg-canvas">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-6">
            {sheet ? (
              <>
                {sheet.reviewStatus === "draft" && (
                  <div role="note" className="flex items-start gap-3 rounded-3xl border border-sun-100 bg-sun-50 p-5 text-navy">
                    <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden="true" />
                    <p className="text-sm leading-6"><span className="font-bold">{t("sheet.draftTitle")}. </span>{t("sheet.draftText")}</p>
                  </div>
                )}

                <Block icon={<Lightbulb className="size-5" aria-hidden="true" />} title={t("sheet.summary")} tone="bg-sun text-navy">
                  <p className="text-lg leading-8 text-text-secondary">{p(sheet.summary)}</p>
                </Block>

                <Block icon={<Check className="size-5" strokeWidth={3} aria-hidden="true" />} title={t("sheet.mustKnow")} tone="bg-blue text-white">
                  <ul className="flex flex-col gap-3">
                    {sheet.mustKnow.map((item) => (
                      <li key={item.en} className="flex items-start gap-3 rounded-2xl bg-blue-50 p-4 leading-7 text-navy">
                        <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-blue text-white"><Check className="size-3" strokeWidth={3} aria-hidden="true" /></span>
                        {p(item)}
                      </li>
                    ))}
                  </ul>
                </Block>

                <Block icon={<Lightbulb className="size-5" aria-hidden="true" />} title={t("sheet.explanation")} tone="bg-lilac text-white">
                  <ol className="flex flex-col gap-3">
                    {sheet.explanation.map((item, index) => (
                      <li key={item.en} className="flex items-start gap-3 leading-7 text-text-secondary">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-lilac-50 text-sm font-extrabold text-[#6d5bd0]">{index + 1}</span>
                        {p(item)}
                      </li>
                    ))}
                  </ol>
                </Block>

                <Block icon={<PenLine className="size-5" aria-hidden="true" />} title={t("sheet.examples")} tone="bg-coral text-navy">
                  <div className="grid gap-4 md:grid-cols-2">
                    {sheet.examples.map((example, index) => (
                      <article key={example.problem.en} className="flex flex-col rounded-2xl border border-coral-100 bg-coral-50 p-5">
                        <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#c2410c]">{t("sheet.example", { number: index + 1 })}</p>
                        <p className="mt-2 font-mono text-lg font-bold text-navy">{p(example.problem)}</p>
                        <ol className="mt-3 flex flex-col gap-1.5 text-sm leading-6 text-text-secondary">
                          {example.steps.map((step) => <li key={step.en}>{p(step)}</li>)}
                        </ol>
                        <p className="mt-auto pt-4 text-sm font-bold text-navy">
                          {t("sheet.answer")} : <span className="rounded-md bg-white px-2 py-0.5 font-mono">{p(example.answer)}</span>
                        </p>
                      </article>
                    ))}
                  </div>
                </Block>

                <Block icon={<TriangleAlert className="size-5" aria-hidden="true" />} title={t("sheet.mistakes")} tone="bg-red-600 text-white">
                  <ul className="flex flex-col gap-3">
                    {sheet.commonMistakes.map((item) => (
                      <li key={item.en} className="rounded-2xl border border-red-100 bg-red-50 p-4 leading-7 text-navy">{p(item)}</li>
                    ))}
                  </ul>
                </Block>

                <Block icon={<PenLine className="size-5" aria-hidden="true" />} title={t("sheet.practice")} tone="bg-mint text-navy">
                  <ol className="flex flex-col gap-3">
                    {sheet.practice.map((item, index) => (
                      <li key={item.question.en} className="rounded-2xl border border-mint-100 bg-mint-50 p-4">
                        <p className="font-semibold text-navy"><span className="mr-2 font-extrabold text-emerald-700">{index + 1}.</span>{p(item.question)}</p>
                        <details className="group mt-2">
                          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full bg-white px-3 py-1 text-sm font-bold text-emerald-700 [&::-webkit-details-marker]:hidden">
                            {t("sheet.showAnswer")}
                          </summary>
                          <p className="mt-2 font-mono text-navy">{p(item.answer)}</p>
                        </details>
                      </li>
                    ))}
                  </ol>
                </Block>

                <Block icon={<HeartHandshake className="size-5" aria-hidden="true" />} title={t("sheet.parentTips")} tone="bg-sky text-navy">
                  <ul className="flex flex-col gap-3">
                    {sheet.parentTips.map((item) => (
                      <li key={item.en} className="flex items-start gap-3 leading-7 text-text-secondary">
                        <span className="mt-2 size-2 shrink-0 rounded-full bg-sky" aria-hidden="true" />
                        {p(item)}
                      </li>
                    ))}
                  </ul>
                </Block>
              </>
            ) : (
              <div className="rounded-3xl border-2 border-dashed border-blue-100 bg-white p-8 text-center">
                <p className="text-xl font-extrabold text-navy">{t("sheet.notReadyTitle")}</p>
                <p className="mx-auto mt-2 max-w-md leading-7 text-text-secondary">{t("sheet.notReadyText")}</p>
                <a href={course.officialUrl} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-2 font-bold text-blue hover:text-blue-hover">
                  {t("course.officialCta")} <ExternalLink className="size-4" aria-hidden="true" />
                </a>
              </div>
            )}

            <Link href={courseHref} className="inline-flex w-fit items-center gap-2 font-bold text-blue hover:text-blue-hover">
              <ArrowLeft className="size-4" aria-hidden="true" /> {t("sheet.back")}
            </Link>
          </div>

          <aside className="flex h-fit flex-col gap-5 lg:sticky lg:top-24">
            <div className="relative overflow-hidden rounded-3xl bg-blue p-6 text-white">
              <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full bg-sun" />
              <p className="relative text-lg font-extrabold">{t("sheet.helpTitle")}</p>
              <p className="relative mt-2 text-sm leading-6 text-white/85">{t("sheet.helpText")}</p>
              <Button href={`/find-tutors?subject=${encodeURIComponent(tSubjects(course.subject))}`} variant="inverse" className="relative mt-5 h-auto min-h-12 w-full whitespace-normal py-3 text-center leading-snug">
                {t("sheet.helpCta")} <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
            <div className="rounded-3xl border border-sun-100 bg-sun-50 p-6">
              <p className="inline-flex rounded-full bg-sun px-3 py-1 text-xs font-extrabold uppercase tracking-[0.12em] text-navy">{t("sheet.officialSource")}</p>
              <p className="mt-3 text-sm leading-6 text-text-secondary">{t("sheet.officialText")}</p>
              <a href={course.officialUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-blue hover:text-blue-hover">
                {p(course.officialName)} <ExternalLink className="size-4" aria-hidden="true" />
              </a>
            </div>
          </aside>
        </div>
      </Section>
    </MarketingShell>
  );
}
