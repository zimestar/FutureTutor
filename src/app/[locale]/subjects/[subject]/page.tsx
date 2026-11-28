import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { Breadcrumbs } from "@/components/ui/Navigation";
import { SectionIntro } from "@/components/marketing/SectionIntro";
import { Link } from "@/i18n/navigation";
import { TutorCard } from "@/components/marketing/TutorCard";
import { subjects } from "@/content/subjects";
import { CheckCircle2, Laptop, Home, Sigma, BookOpen, Languages, Microscope, FlaskConical, Atom, Dna, Code2, NotebookPen, GraduationCap, type LucideIcon } from "lucide-react";
import { DotCluster, DotGrid, HalfCircles, Ring, Sparkle } from "@/components/marketing/Decor";
import { getResourceArticle } from "@/content/resources";
import { localMarkets } from "@/content/localMarkets";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFavoritedTutorIds } from "@/lib/favorites";
import { tutorProfileToCardData } from "@/lib/tutorCard";
import { publicPageMetadata } from "@/lib/publicMetadata";
import { TrackPageView } from "@/components/marketing/TrackPageView";
import type { Locale } from "@/lib/analytics";
import { BOOKABLE_TUTOR_WHERE } from "@/lib/tutorBookability";

type Params = { locale: string; subject: string };

/** HOME-COLOR — every subject page gets its own bright tone and icon. */
const subjectIcons: Record<string, LucideIcon> = {
  sigma: Sigma, "book-open": BookOpen, languages: Languages, microscope: Microscope, "flask-conical": FlaskConical,
  atom: Atom, dna: Dna, code: Code2, "notebook-pen": NotebookPen, "graduation-cap": GraduationCap,
};
type Tone = { hero: string; body: string; tile: string; circle: string; dots: string; half: string; button: "primary" | "inverse" };
const toneSet: Record<string, Tone> = {
  blue: { hero: "bg-blue text-white", body: "text-white/85", tile: "bg-white text-blue", circle: "bg-sun", dots: "text-coral", half: "text-mint", button: "inverse" },
  coral: { hero: "bg-coral text-navy", body: "text-navy/80", tile: "bg-white text-[#c2410c]", circle: "bg-sun", dots: "text-blue", half: "text-lilac", button: "primary" },
  mint: { hero: "bg-mint text-navy", body: "text-navy/80", tile: "bg-white text-emerald-700", circle: "bg-sun", dots: "text-blue", half: "text-coral", button: "primary" },
  sun: { hero: "bg-sun text-navy", body: "text-navy/80", tile: "bg-white text-amber-700", circle: "bg-coral", dots: "text-blue", half: "text-mint", button: "primary" },
  lilac: { hero: "bg-lilac text-navy", body: "text-navy/85", tile: "bg-white text-[#6d5bd0]", circle: "bg-sun", dots: "text-coral", half: "text-mint", button: "primary" },
};
const subjectTone: Record<string, keyof typeof toneSet> = {
  math: "blue", english: "coral", french: "lilac", science: "mint", chemistry: "sun",
  physics: "blue", biology: "mint", "computer-science": "lilac", "exam-prep": "coral", elementary: "sun",
};
const cardTones = [
  { card: "border-blue-100 bg-blue-50", icon: "bg-blue text-white" },
  { card: "border-coral-100 bg-coral-50", icon: "bg-coral text-navy" },
  { card: "border-mint-100 bg-mint-50", icon: "bg-mint text-navy" },
  { card: "border-sun-100 bg-sun-50", icon: "bg-sun text-navy" },
  { card: "border-lilac-100 bg-lilac-50", icon: "bg-lilac text-white" },
  { card: "border-blue-100 bg-sky-50", icon: "bg-sky text-navy" },
];

function getSubject(slug: string) {
  return subjects.find((s) => s.slug === slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { locale, subject: slug } = await params;
  const subject = getSubject(slug);
  if (!subject) return {};

  const t = await getTranslations({ locale, namespace: "subjects" });
  const label = t(`items.${slug}`);

  return publicPageMetadata({ locale, path: `/subjects/${slug}`, title: t("page.title", { subject: label }), description: t("page.metaDescription", { subject: label }) });
}

export default async function SubjectPage({ params }: { params: Promise<Params> }) {
  const { locale, subject: slug } = await params;
  const subject = getSubject(slug);
  if (!subject) notFound();

  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "subjects" });
  const tSubjects = await getTranslations({ locale, namespace: "subjects.items" });
  const tResourceArticle = await getTranslations({ locale, namespace: "resourceArticles.items" });
  const tLevels = await getTranslations({ locale, namespace: "gradeLevels" });
  const tSearch = await getTranslations({ locale, namespace: "search" });
  const label = t(`items.${slug}`);
  const levelKeys = ["elementary", "middleSchool", "highSchool", "cegepCollege", "university", "adultLearner"] as const;

  const session = await auth();
  const [tutorProfiles, favoritedIds] = await Promise.all([
    db.tutorProfile.findMany({
      where: {
        ...BOOKABLE_TUTOR_WHERE,
        subjects: { some: { subject: { slug } } },
      },
      include: {
        user: { select: { name: true } },
        subjects: { select: { subject: { select: { slug: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    getFavoritedTutorIds(session),
  ]);

  const matches = tutorProfiles.map((tutor) => tutorProfileToCardData(tutor, tSubjects, favoritedIds));
  const relatedArticle = getResourceArticle("how-to-choose-a-tutor");
  const tone = toneSet[subjectTone[slug] ?? "blue"];
  const SubjectIcon = subjectIcons[subject.icon] ?? BookOpen;
  const primaryMarket = localMarkets[0];

  return (
    <MarketingShell>
      <TrackPageView event="subject_page_viewed" properties={{ locale: locale as Locale, subject_slug: slug }} />
      <Section className="border-b border-border bg-white py-3.5 md:py-3.5">
        <Breadcrumbs
          items={[
            { label: t("page.breadcrumbHome"), href: "/" },
            { label: t("page.breadcrumbSubjects"), href: "/subjects" },
            { label },
          ]}
        />
      </Section>
      <section className={`relative isolate overflow-hidden py-16 md:py-20 ${tone.hero}`}>
        <span aria-hidden="true" className="pointer-events-none absolute -left-40 -top-40 size-[460px] rounded-full bg-white/15" />
        <DotGrid className="left-[46%] top-8 hidden w-20 opacity-30 lg:block" />
        <div className="relative mx-auto grid w-full max-w-(--container-page) items-center gap-12 px-5 md:px-10 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <h1 className="motion-intro text-4xl font-extrabold leading-[1.05] tracking-[-0.025em] md:text-6xl">
              {t("page.title", { subject: label })}
            </h1>
            <p className={`motion-intro mt-5 max-w-xl text-lg leading-8 [--motion-delay:100ms] md:text-xl ${tone.body}`}>{t("page.description", { subject: label })}</p>
            <div className="motion-intro mt-8 [--motion-delay:200ms]">
              <Button href={`/find-tutors?subject=${encodeURIComponent(label)}`} variant={tone.button} size="lg">{t("page.searchAll")}</Button>
            </div>
          </div>
          <div aria-hidden="true" className="relative mx-auto hidden size-72 sm:block lg:size-80">
            <span className={`motion-settle absolute inset-6 rounded-full ${tone.circle}`} />
            <Ring className="inset-0 size-full text-white/40" />
            <span className="motion-pop absolute inset-0 m-auto flex size-36 items-center justify-center rounded-[36px] bg-white shadow-(--shadow-pop) [--motion-delay:300ms]">
              <SubjectIcon className={`size-16 ${tone.tile.split(" ")[1]}`} />
            </span>
            <DotCluster delay={400} className={`-left-4 top-4 w-16 ${tone.dots}`} />
            <Sparkle delay={900} className="-right-2 top-10 w-10 text-white" />
            <HalfCircles delay={1200} className={`bottom-2 right-4 w-24 ${tone.half}`} />
          </div>
        </div>
      </section>

      <Section className="bg-white pb-0">
        <SectionIntro title={t("page.topicsHeading", { subject: label })} description={t(`page.topics.${slug}.intro`)} align="left" />
        <ul className="reveal-stagger mt-8 grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <li key={index} className={`flex items-start gap-3 rounded-3xl border p-5 text-[15px] font-semibold leading-6 text-navy ${cardTones[index].card}`}>
              <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${cardTones[index].icon}`}>
                <CheckCircle2 className="size-5" aria-hidden="true" />
              </span>
              {t(`page.topics.${slug}.items.${index}`)}
            </li>
          ))}
        </ul>
      </Section>

      <Section className="bg-white">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionIntro title={t("page.levelsHeading")} description={t("page.levelsDescription", { subject: label })} align="left" />
            <ul className="reveal-stagger mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {levelKeys.map((key, index) => (
                <li key={key} className={`flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-sm font-semibold text-navy ${cardTones[index % cardTones.length].card}`}>
                  <CheckCircle2 className="size-4 shrink-0 text-navy/60" aria-hidden="true" />
                  {tLevels(key)}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm leading-6 text-text-muted">{t("page.levelsNote", { subject: label })}</p>
          </div>
          <div>
            <SectionIntro title={t("page.modeHeading")} description={t("page.modeDescription", { subject: label })} align="left" />
            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3 rounded-3xl bg-blue p-5 text-white">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white text-blue"><Laptop className="size-6" aria-hidden="true" /></span>
                <span className="font-bold">{tSearch("online")}</span>
              </div>
              <div className="flex items-center gap-3 rounded-3xl bg-coral p-5 text-navy">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#c2410c]"><Home className="size-6" aria-hidden="true" /></span>
                <span className="font-bold">{tSearch("inPerson")}</span>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section className="bg-off-white pt-0">
        {matches.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {matches.map((tutor) => (
              <TutorCard key={tutor.id} tutor={tutor} />
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border-2 border-dashed border-lilac-100 bg-lilac-50 p-10 text-center font-medium text-navy/75">
            {t("page.empty", { subject: label })}
          </div>
        )}
      </Section>

      {(relatedArticle || primaryMarket) && (
        <Section className="bg-off-white pt-0">
          <div className="mx-auto flex max-w-2xl flex-col gap-3 border-t border-border pt-8 text-center">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue">{t("page.relatedHeading")}</p>
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
              {relatedArticle && (
                <Link href={`/resources/${relatedArticle.slug}`} className="font-semibold text-navy hover:text-blue">
                  {tResourceArticle(`${relatedArticle.slug}.title`)}
                </Link>
              )}
              {primaryMarket && (
                <Link href={`/tutoring/${primaryMarket.slug}`} className="font-semibold text-navy hover:text-blue">
                  {t("page.relatedLocal", { subject: label, city: primaryMarket.city })}
                </Link>
              )}
            </div>
          </div>
        </Section>
      )}
    </MarketingShell>
  );
}
