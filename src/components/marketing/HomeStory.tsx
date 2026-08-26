import { useTranslations } from "next-intl";
import { ArrowRight, CheckCircle2, Compass, Lightbulb, MessageCircleMore, Route, ShieldCheck, UsersRound } from "lucide-react";
import Image from "next/image";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { SectionIntro } from "@/components/marketing/SectionIntro";

const pathIcons = [Compass, UsersRound, MessageCircleMore, Route];
const trustIcons = [ShieldCheck, CheckCircle2, Lightbulb];

export function HomeStory() {
  const t = useTranslations("publicExperience.home");
  return (
    <>
      <Section className="bg-white">
        <div className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <SectionIntro eyebrow={t("problem.eyebrow")} title={t("problem.title")} description={t("problem.description")} align="left" />
          <div className="relative rounded-3xl border border-border bg-off-white p-7 md:p-10">
            <div aria-hidden="true" className="absolute left-10 top-10 h-[calc(100%-5rem)] w-px bg-gradient-to-b from-blue via-mint to-transparent" />
            <p className="relative pl-12 text-xl font-bold leading-8 text-navy">{t("problem.before")}</p>
            <p className="relative mt-8 pl-12 text-xl font-bold leading-8 text-blue">{t("problem.after")}</p>
          </div>
        </div>
      </Section>

      <Section className="bg-off-white">
        <SectionIntro eyebrow={t("path.eyebrow")} title={t("path.title")} description={t("path.description")} />
        <ol className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {pathIcons.map((Icon, index) => (
            <li key={index} className="relative rounded-2xl border border-border bg-white p-6 shadow-card">
              <span className="flex size-11 items-center justify-center rounded-xl bg-blue/10 text-blue"><Icon className="size-5" aria-hidden="true" /></span>
              <p className="mt-5 text-sm font-bold uppercase tracking-wider text-blue">{t("path.step", { number: index + 1 })}</p>
              <h3 className="mt-2 text-xl font-extrabold text-navy">{t(`path.items.${index}.title`)}</h3>
              <p className="mt-3 leading-7 text-text-secondary">{t(`path.items.${index}.description`)}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex justify-center"><Button href="/how-it-works" variant="outline">{t("path.cta")}<ArrowRight className="size-4" aria-hidden="true" /></Button></div>
      </Section>

      <Section className="bg-navy text-white">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <SectionIntro eyebrow={t("trust.eyebrow")} title={t("trust.title")} description={t("trust.description")} align="left" inverse />
          <div className="grid gap-4 sm:grid-cols-3">
            {trustIcons.map((Icon, index) => (
              <div key={index} className="rounded-2xl border border-white/12 bg-white/6 p-5">
                <Icon className="size-6 text-mint" aria-hidden="true" />
                <h3 className="mt-5 font-bold text-white">{t(`trust.items.${index}.title`)}</h3>
                <p className="mt-2 text-sm leading-6 text-white/68">{t(`trust.items.${index}.description`)}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section className="bg-white">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_0.95fr] lg:gap-16">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-blue">{t("possibility.eyebrow")}</p>
            <blockquote className="mt-5 text-balance text-3xl font-extrabold leading-tight text-navy md:text-5xl">{t("possibility.statement")}</blockquote>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-text-secondary">{t("possibility.description")}</p>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-border shadow-pop">
            <Image src="/images/learning-breakthrough.png" alt={t("possibility.imageAlt")} fill sizes="(min-width: 1024px) 44vw, 92vw" className="object-cover object-center" />
          </div>
        </div>
      </Section>
    </>
  );
}
