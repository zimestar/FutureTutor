import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { Check, CircleCheck, MoveRight, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { Container } from "@/components/ui/Container";
import { Link } from "@/i18n/navigation";
import { TutorSearch } from "@/components/marketing/TutorSearch";
import { TrackedLink } from "@/components/marketing/TrackedLink";
import { DotCluster, DotGrid, HalfCircles, Ring, Sparkle, Squiggle } from "@/components/marketing/Decor";

const delay = (ms: number) => ({ "--motion-delay": `${ms}ms` }) as CSSProperties;

/**
 * HOME-COLOR — split hero on a solid brand-blue field. Copy and the real
 * tutor search on the left (first in the DOM, so they sit above the photo on
 * mobile); the photo on the right framed by playful shapes and two small
 * product cues. Four verifiable guarantees underneath.
 */
export function Hero() {
  const t = useTranslations("hero");
  const tv = useTranslations("homeV2.hero");
  const trust = useTranslations("trustStrip");

  const linkClass =
    "group inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-blue";

  return (
    <section className="relative overflow-hidden bg-blue text-white">
      {/* Soft background shapes */}
      <span aria-hidden="true" className="pointer-events-none absolute -left-40 -top-40 size-[520px] rounded-full bg-white/[0.06]" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-56 right-[-120px] size-[640px] rounded-full bg-[#1d4ed8]/60" />
      <DotGrid className="left-[46%] top-10 hidden w-24 text-white/25 lg:block" />

      <Container className="relative pb-10 pt-10 sm:pt-14 lg:pb-14 lg:pt-20">
        <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16">
          <div data-testid="hero-copy" className="relative z-20 min-w-0">
            <p className="motion-intro inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-[13px] font-semibold text-white">
              <span className="size-2 rounded-full bg-sun" aria-hidden="true" />
              {t("eyebrow")}
            </p>
            <h1
              data-testid="hero-heading"
              style={delay(80)}
              className="motion-intro mt-6 text-[clamp(2.6rem,5vw,3.75rem)] font-extrabold leading-[1.02] tracking-[-0.035em] text-white"
            >
              <span className="relative inline-block text-sun-ink">
                {t("titleEmphasis")}
                <Squiggle className="-bottom-3 left-0 h-4 w-full text-sun-ink/80" />
              </span>{" "}
              <span>{t("titleRest")}</span>
            </h1>
            <p style={delay(160)} className="motion-intro mt-7 max-w-xl text-lg leading-8 text-white/85 md:text-xl md:leading-9">{t("description")}</p>

            <div style={delay(240)} className="motion-intro mt-8">
              <TutorSearch presentation="panel" />
            </div>

            <div style={delay(320)} className="motion-intro mt-5 flex flex-wrap items-center gap-x-6 gap-y-1 text-white">
              <TrackedLink href="/find-tutors" event="find_tutor_cta_clicked" properties={{ cta_location: "hero" }} className={`${linkClass} hover:text-sun-ink`}>
                {t("primaryCta")}
                <MoveRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </TrackedLink>
              <TrackedLink href="/how-it-works" event="how_it_works_cta_clicked" properties={{ cta_location: "hero" }} className={`${linkClass} hover:text-sun-ink`}>
                {t("secondaryCta")}
                <MoveRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </TrackedLink>
            </div>
            <div style={delay(360)} className="motion-intro flex flex-wrap items-center gap-x-6 gap-y-1 text-sun-ink">
              <Link href="/signup?role=parent" className={`${linkClass} hover:text-white`}>{t("parentsLink")}</Link>
              <Link href="/become-a-tutor" className={`${linkClass} hover:text-white`}>{tv("tutorLink")}</Link>
            </div>
          </div>

          <div data-testid="hero-visual" className="relative mx-auto w-full max-w-xl lg:max-w-none">
            {/* Decorations around the photo */}
            <span aria-hidden="true" style={delay(200)} className="motion-settle pointer-events-none absolute -right-6 -top-8 size-44 rounded-full bg-sun sm:size-56" />
            <Ring className="-bottom-10 -left-10 hidden size-36 text-mint sm:block" />
            <DotCluster delay={400} className="-left-14 top-[16%] hidden w-20 text-coral sm:block" />
            <Sparkle delay={900} className="-right-4 bottom-[30%] z-20 w-10 text-white" />
            <Sparkle delay={1600} className="left-[12%] -top-6 z-20 w-7 text-mint" />
            <HalfCircles delay={1200} className="-bottom-5 right-10 z-20 w-24 text-lilac" />

            <div style={delay(120)} className="motion-settle relative z-10 aspect-[4/3] overflow-hidden rounded-[36px] border-[6px] border-white/90 shadow-[0_40px_80px_-30px_rgba(13,27,42,0.6)] lg:aspect-[4/4.3]">
              <Image
                src="/images/home-tutoring-session-v2.webp"
                alt={t("imageAlt")}
                fill
                priority
                sizes="(min-width: 1024px) 560px, 100vw"
                className="object-cover object-[62%_50%]"
              />
            </div>
            <div style={delay(600)} className="motion-pop absolute -right-3 top-8 z-20 hidden items-center gap-2 rounded-full bg-navy px-4 py-2.5 text-sm font-semibold text-white shadow-(--shadow-pop) sm:flex lg:-right-6 lg:top-12">
              <ShieldCheck className="size-4 text-emerald-300" aria-hidden="true" />
              {tv("verified")}
            </div>
            <div style={delay(850)} className="motion-pop absolute -left-3 bottom-10 z-20 hidden w-72 items-center gap-3 rounded-2xl bg-white p-4 text-navy shadow-(--shadow-pop) sm:flex lg:-left-10 lg:bottom-16">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-mint-50 text-emerald-600">
                <CircleCheck className="size-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-bold text-navy">{tv("confirmedTitle")}</span>
                <span className="mt-0.5 block text-[13px] text-text-muted">{tv("confirmedMeta")}</span>
              </span>
            </div>
          </div>
        </div>

        <ul data-testid="hero-trust-row" className="reveal-stagger mt-16 grid grid-cols-1 gap-4 border-t border-white/20 pt-7 sm:grid-cols-2 lg:grid-cols-4">
          {[trust("verification"), trust("pricing"), trust("onlineInPerson"), trust("bilingual")].map((item) => (
            <li key={item} className="flex items-center gap-3 text-[15px] font-semibold text-white">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sun text-navy">
                <Check className="size-4" strokeWidth={3} aria-hidden="true" />
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
