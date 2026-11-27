import { useTranslations } from "next-intl";
import { Check, MoveRight, ShieldCheck, Video } from "lucide-react";
import Image from "next/image";
import { Container } from "@/components/ui/Container";
import { TutorSearch } from "@/components/marketing/TutorSearch";
import { TrackedCtaButton } from "@/components/marketing/TrackedCtaButton";
import { TrackedLink } from "@/components/marketing/TrackedLink";

/**
 * DESIGN-SYSTEM2 — home hero: headline and calls to action beside a framed
 * photo with two floating proof points, then the tutor search as its own
 * elevated card. Two columns from 1024px, stacked below.
 */
export function Hero() {
  const t = useTranslations("hero");
  const trust = useTranslations("trustStrip");

  return (
    <section className="relative overflow-x-clip bg-gradient-to-b from-white via-white to-blue-50">
      <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-40 size-[640px] rounded-full bg-blue/[0.06] blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-32 bottom-0 size-[420px] rounded-full bg-mint/[0.07] blur-3xl" />

      <Container className="relative grid items-center gap-12 pb-12 pt-10 sm:pt-14 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pb-20 lg:pt-20">
        <div data-testid="hero-copy" className="max-w-[640px]">
          <p className="inline-flex items-center gap-2 rounded-full border border-blue/15 bg-white px-3.5 py-1.5 text-[13px] font-semibold text-blue shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
            <span className="size-1.5 rounded-full bg-mint" aria-hidden="true" />
            {t("eyebrow")}
          </p>
          <h1
            data-testid="hero-heading"
            className="mt-6 text-[clamp(2.4rem,4.4vw,3.85rem)] font-extrabold leading-[1.06] text-navy"
          >
            <span className="text-blue">{t("titleEmphasis")}</span> <span>{t("titleRest")}</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-neutral-600 md:text-xl md:leading-9">{t("description")}</p>
          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
            <TrackedCtaButton href="/find-tutors" event="find_tutor_cta_clicked" properties={{ cta_location: "hero" }} size="lg">
              {t("primaryCta")}
            </TrackedCtaButton>
            <TrackedLink
              href="/how-it-works"
              event="how_it_works_cta_clicked"
              properties={{ cta_location: "hero" }}
              className="group inline-flex min-h-11 items-center gap-2 whitespace-nowrap text-[15px] font-semibold text-navy outline-none transition-colors hover:text-blue focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-4"
            >
              {t("secondaryCta")}
              <MoveRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </TrackedLink>
          </div>
          <ul data-testid="hero-trust-row" className="mt-10 grid grid-cols-1 gap-3 text-[15px] font-medium text-neutral-700 sm:grid-cols-2">
            {[trust("personalized"), trust("onlineInPerson"), trust("flexible"), trust("verification")].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-mint/15 text-emerald-700">
                  <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div data-testid="hero-visual" className="relative mx-auto w-full max-w-[560px] lg:max-w-none">
          <div className="relative aspect-[4/5] overflow-hidden rounded-[32px] shadow-(--shadow-pop) sm:aspect-square lg:aspect-[4/5]">
            <Image
              src="/images/parents-students-hero.png"
              alt={t("imageAlt")}
              fill
              priority
              sizes="(min-width: 1024px) 560px, 100vw"
              className="object-cover object-[58%_center]"
            />
          </div>
          <div className="absolute -left-3 top-8 flex items-center gap-3 rounded-2xl bg-white/95 px-4 py-3 shadow-(--shadow-pop) backdrop-blur sm:-left-6">
            <span className="flex size-10 items-center justify-center rounded-xl bg-mint/15 text-emerald-700">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold text-navy">{t("floatingApproved")}</span>
          </div>
          <div className="absolute -right-3 bottom-10 flex items-center gap-3 rounded-2xl bg-white/95 px-4 py-3 shadow-(--shadow-pop) backdrop-blur sm:-right-6">
            <span className="flex size-10 items-center justify-center rounded-xl bg-blue/10 text-blue">
              <Video className="size-5" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold text-navy">{t("floatingModes")}</span>
          </div>
        </div>
      </Container>

      <Container className="relative pb-16 lg:pb-24">
        <p className="mb-4 text-lg font-semibold text-navy">{t("searchIntro")}</p>
        <TutorSearch presentation="hero" />
      </Container>
    </section>
  );
}
