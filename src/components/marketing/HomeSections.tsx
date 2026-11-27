import { useTranslations } from "next-intl";
import Image from "next/image";
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  CalendarCheck,
  Check,
  CreditCard,
  FileCheck2,
  GraduationCap,
  LockKeyhole,
  Mic,
  MonitorUp,
  Receipt,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
  Video,
  Zap,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { SectionIntro } from "@/components/marketing/SectionIntro";
import { resourceArticles } from "@/content/resources";

/**
 * DESIGN-SYSTEM3 — homepage sections. Every statement here describes how the
 * platform actually works (see the review notes in each block); no invented
 * figures, ratings or testimonials. Visual "mini UIs" use skeleton bars, never
 * fake tutors or prices.
 */

/* ---------------------------------------------------------------- trust bar */

export function HomeTrustBar() {
  const t = useTranslations("homePremium.trust");
  const items = [
    { key: "verification", icon: BadgeCheck },
    { key: "pricing", icon: Receipt },
    { key: "secure", icon: LockKeyhole },
    { key: "classroom", icon: Video },
  ] as const;
  return (
    <section aria-label={t("label")} className="border-y border-border bg-white">
      <div className="mx-auto grid max-w-(--container-page) grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
        {items.map(({ key, icon: Icon }) => (
          <div key={key} className="flex items-start gap-4 bg-white px-6 py-7 lg:px-8">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue/10 text-blue">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-bold text-navy">{t(`${key}.title`)}</p>
              <p className="mt-1 text-sm leading-6 text-text-secondary">{t(`${key}.text`)}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- how it works */

function SkeletonBar({ className }: { className: string }) {
  return <span aria-hidden="true" className={`block h-2.5 rounded-full bg-neutral-200 ${className}`} />;
}

function StepVisual({ step }: { step: 0 | 1 | 2 }) {
  const t = useTranslations("homePremium.how.visual");
  if (step === 0) {
    return (
      <div aria-hidden="true" className="flex flex-col gap-2.5">
        {[t("subject"), t("level"), t("mode")].map((label) => (
          <div key={label} className="flex items-center justify-between rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm font-semibold text-navy">
            {label}
            <Check className="size-4 text-emerald-600" />
          </div>
        ))}
        <div className="flex items-center justify-center gap-2 rounded-xl bg-blue py-2.5 text-sm font-bold text-white">
          <Search className="size-4" />
          {t("search")}
        </div>
      </div>
    );
  }
  if (step === 1) {
    return (
      <div aria-hidden="true" className="rounded-xl border border-border bg-white p-4">
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2, 3, 4, 5].map((slot) => (
            <span key={slot} className={`h-8 rounded-lg border ${slot === 1 ? "border-blue bg-blue" : "border-border bg-white"}`} />
          ))}
        </div>
        <div className="mt-4 space-y-2.5 border-t border-border pt-4">
          <div className="flex justify-between"><SkeletonBar className="w-20" /><SkeletonBar className="w-12" /></div>
          <div className="flex justify-between"><SkeletonBar className="w-28" /><SkeletonBar className="w-10" /></div>
          <div className="flex items-center justify-between pt-1 text-sm font-bold text-navy">
            {t("total")}
            <SkeletonBar className="w-16 bg-navy/80" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-xl border border-border bg-navy">
      <div className="grid grid-cols-2 gap-1.5 p-1.5">
        <div className="flex aspect-video items-center justify-center rounded-lg bg-white/10 text-white/60"><UserRoundCheck className="size-6" /></div>
        <div className="flex aspect-video items-center justify-center rounded-lg bg-white/10 text-white/60"><GraduationCap className="size-6" /></div>
      </div>
      <div className="flex justify-center gap-2 pb-3 pt-1.5">
        {[Mic, Video, MonitorUp].map((Icon, index) => (
          <span key={index} className="flex size-8 items-center justify-center rounded-full bg-white/15 text-white"><Icon className="size-4" /></span>
        ))}
      </div>
    </div>
  );
}

export function HomeHowItWorks() {
  const t = useTranslations("homePremium.how");
  const steps = [0, 1, 2] as const;
  return (
    <Section className="bg-white" ariaLabelledby="home-how-title">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-blue">{t("eyebrow")}</p>
          <h2 id="home-how-title" className="mt-4 text-[2rem] font-bold leading-[1.1] text-navy md:text-[2.75rem]">{t("title")}</h2>
        </div>
        <Link href="/how-it-works" className="group inline-flex items-center gap-2 font-semibold text-blue">
          {t("cta")}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      </div>
      <ol className="mt-12 grid gap-6 lg:grid-cols-3">
        {steps.map((step) => (
          <li key={step} className="flex flex-col rounded-3xl border border-border bg-canvas p-6 sm:p-7">
            <div className="flex min-h-[236px] flex-col justify-center rounded-2xl bg-neutral-100/80 p-4">
              <StepVisual step={step} />
            </div>
            <p className="mt-6 text-sm font-bold text-blue">{t("stepLabel", { number: step + 1 })}</p>
            <h3 className="mt-1.5 text-xl font-bold text-navy">{t(`steps.${step}.title`)}</h3>
            <p className="mt-2 leading-7 text-text-secondary">{t(`steps.${step}.text`)}</p>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex flex-col items-start gap-4 rounded-3xl border border-blue/15 bg-blue/5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue text-white">
            <Zap className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-bold text-navy">{t("quickMatch.title")}</p>
            <p className="mt-1 leading-7 text-text-secondary">{t("quickMatch.text")}</p>
          </div>
        </div>
        <Button href="/signup" variant="primary" className="shrink-0">
          {t("quickMatch.cta")}
        </Button>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ parents */

export function HomeParents() {
  const t = useTranslations("homePremium.parents");
  const features = [
    { key: "children", icon: UsersRound },
    { key: "payment", icon: CreditCard },
    { key: "follow", icon: CalendarCheck },
    { key: "safety", icon: ShieldCheck },
  ] as const;
  return (
    <Section className="bg-canvas" ariaLabelledby="home-parents-title">
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
        <div className="relative order-last lg:order-first">
          <div className="relative aspect-[4/3] overflow-hidden rounded-[28px] shadow-(--shadow-pop)">
            <Image src="/images/parent-homework-help-v2.webp" alt={t("imageAlt")} fill sizes="(min-width: 1024px) 560px, 100vw" className="object-cover" />
          </div>
        </div>
        <div>
          <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-blue">{t("eyebrow")}</p>
          <h2 id="home-parents-title" className="mt-4 text-[2rem] font-bold leading-[1.1] text-navy md:text-[2.75rem]">{t("title")}</h2>
          <p className="mt-5 text-lg leading-8 text-text-secondary">{t("description")}</p>
          <ul className="mt-8 grid gap-5 sm:grid-cols-2">
            {features.map(({ key, icon: Icon }) => (
              <li key={key} className="flex items-start gap-3.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue shadow-(--shadow-card)">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-bold text-navy">{t(`features.${key}.title`)}</p>
                  <p className="mt-1 text-sm leading-6 text-text-secondary">{t(`features.${key}.text`)}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Button href="/signup?role=parent" size="lg">{t("primaryCta")}</Button>
            <Link href="/parents" className="group inline-flex items-center gap-2 font-semibold text-navy hover:text-blue">
              {t("secondaryCta")}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------- safety */

export function HomeSafety() {
  const t = useTranslations("homePremium.safety");
  const steps = [0, 1, 2, 3, 4, 5] as const;
  return (
    <Section className="bg-white" ariaLabelledby="home-safety-title">
      <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <div>
          <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-blue">{t("eyebrow")}</p>
          <h2 id="home-safety-title" className="mt-4 text-[2rem] font-bold leading-[1.1] text-navy md:text-[2.75rem]">{t("title")}</h2>
          <p className="mt-5 text-lg leading-8 text-text-secondary">{t("description")}</p>
          <div className="mt-8 flex flex-col gap-3">
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-canvas p-4">
              <LockKeyhole className="mt-0.5 size-5 shrink-0 text-blue" aria-hidden="true" />
              <p className="text-sm leading-6 text-text-secondary">{t("payment")}</p>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-canvas p-4">
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-red-600" aria-hidden="true" />
              <p className="text-sm leading-6 text-text-secondary">
                {t("report")}{" "}
                <Link href="/report-concern" className="font-semibold text-blue hover:text-blue-hover">{t("reportLink")}</Link>
              </p>
            </div>
          </div>
          <Link href="/safety" className="group mt-8 inline-flex items-center gap-2 font-semibold text-blue">
            {t("cta")}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>
        <ol className="relative grid gap-3">
          {steps.map((step) => (
            <li key={step} className="flex items-start gap-4 rounded-2xl border border-border bg-white p-5 shadow-(--shadow-card)">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">{step + 1}</span>
              <div>
                <p className="font-bold text-navy">{t(`steps.${step}.title`)}</p>
                <p className="mt-1 text-sm leading-6 text-text-secondary">{t(`steps.${step}.text`)}</p>
              </div>
            </li>
          ))}
          <li className="flex items-center gap-3 rounded-2xl bg-mint/10 p-5 text-sm font-semibold text-emerald-800">
            <FileCheck2 className="size-5 shrink-0" aria-hidden="true" />
            {t("note")}
          </li>
        </ol>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ pricing */

export function HomePricing() {
  const t = useTranslations("homePremium.pricing");
  const factors = [0, 1, 2] as const;
  const promises = [0, 1, 2] as const;
  return (
    <Section className="bg-canvas" ariaLabelledby="home-pricing-title">
      <SectionIntro eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />
      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {factors.map((factor) => (
          <div key={factor} className="rounded-3xl border border-border bg-white p-7 shadow-(--shadow-card)">
            <p className="text-sm font-bold text-blue">{t("factorLabel", { number: factor + 1 })}</p>
            <p className="mt-2 text-xl font-bold text-navy">{t(`factors.${factor}.title`)}</p>
            <p className="mt-2 leading-7 text-text-secondary">{t(`factors.${factor}.text`)}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-col gap-6 rounded-3xl bg-navy p-7 text-white sm:p-9 lg:flex-row lg:items-center lg:justify-between">
        <ul className="grid gap-3 sm:grid-cols-3 lg:gap-8">
          {promises.map((promise) => (
            <li key={promise} className="flex items-start gap-2.5">
              <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-mint/20 text-mint">
                <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
              </span>
              <span className="font-semibold">{t(`promises.${promise}`)}</span>
            </li>
          ))}
        </ul>
        <Button href="/pricing" variant="inverse" className="shrink-0">{t("cta")}</Button>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- resources */

export function HomeResources() {
  const t = useTranslations("homePremium.resources");
  const tItems = useTranslations("resourceArticles.items");
  const tCategories = useTranslations("resourceHub.categories");
  // Newest first, so recently published guides surface on the homepage.
  const articles = resourceArticles
    .filter((article) => !article.draft)
    .toSorted((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 3);
  return (
    <Section className="bg-white" ariaLabelledby="home-resources-title">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-blue">{t("eyebrow")}</p>
          <h2 id="home-resources-title" className="mt-4 text-[2rem] font-bold leading-[1.1] text-navy md:text-[2.75rem]">{t("title")}</h2>
        </div>
        <Link href="/resources" className="group inline-flex items-center gap-2 font-semibold text-blue">
          {t("cta")}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      </div>
      <ul className="mt-10 grid gap-5 md:grid-cols-3">
        {articles.map((article) => (
          <li key={article.slug}>
            <Link
              href={`/resources/${article.slug}`}
              className="group flex h-full flex-col rounded-3xl border border-border bg-white p-7 transition-all hover:-translate-y-0.5 hover:shadow-(--shadow-card-hover)"
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-blue/10 text-blue">
                <BookOpen className="size-5" aria-hidden="true" />
              </span>
              <p className="mt-5 text-xs font-bold uppercase tracking-[0.12em] text-text-muted">{tCategories(article.category)}</p>
              <p className="mt-2 text-lg font-bold leading-snug text-navy group-hover:text-blue">{tItems(`${article.slug}.title`)}</p>
              <p className="mt-2 flex-1 text-sm leading-6 text-text-secondary">{tItems(`${article.slug}.metaDescription`)}</p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-blue">
                {t("read")}
                <ArrowRight className="size-4" aria-hidden="true" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
