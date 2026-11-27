import { useTranslations } from "next-intl";
import { Check, MoveRight, ShieldCheck, Video } from "lucide-react";
import Image from "next/image";
import { Container } from "@/components/ui/Container";
import { Link } from "@/i18n/navigation";
import { TutorSearch } from "@/components/marketing/TutorSearch";
import { TrackedCtaButton } from "@/components/marketing/TrackedCtaButton";
import { TrackedLink } from "@/components/marketing/TrackedLink";

/**
 * DESIGN-SYSTEM3 — home hero. Everything a visitor needs to act is in the
 * first screen: a short promise, the real tutor search, the two key paths
 * (browse tutors / how it works, parents) and four verifiable guarantees.
 * The wide visual follows underneath instead of competing with the search.
 */
export function Hero() {
  const t = useTranslations("hero");
  const trust = useTranslations("trustStrip");

  return (
    <section className="relative overflow-x-clip bg-gradient-to-b from-white via-white to-blue-50">
      <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-40 size-[640px] rounded-full bg-blue/[0.06] blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-32 top-1/3 size-[420px] rounded-full bg-mint/[0.07] blur-3xl" />

      <Container className="relative pb-12 pt-12 sm:pt-16 lg:pt-20">
        <div data-testid="hero-copy" className="mx-auto max-w-4xl text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-blue/15 bg-white px-3.5 py-1.5 text-[13px] font-semibold text-blue shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
            <span className="size-1.5 rounded-full bg-mint" aria-hidden="true" />
            {t("eyebrow")}
          </p>
          <h1 data-testid="hero-heading" className="mt-6 text-[clamp(2.5rem,5.4vw,4.6rem)] font-bold leading-[1.04] text-navy">
            <span className="text-blue">{t("titleEmphasis")}</span> <span>{t("titleRest")}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-text-secondary md:text-xl md:leading-9">{t("description")}</p>
        </div>

        <div className="relative z-20 mx-auto mt-10 max-w-5xl text-left">
          <TutorSearch presentation="hero" />
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-x-7 gap-y-3">
          <TrackedCtaButton href="/find-tutors" event="find_tutor_cta_clicked" properties={{ cta_location: "hero" }} variant="outline">
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
          <Link
            href="/parents"
            className="group inline-flex min-h-11 items-center gap-2 whitespace-nowrap text-[15px] font-semibold text-navy transition-colors hover:text-blue"
          >
            {t("parentsLink")}
            <MoveRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>

        <ul data-testid="hero-trust-row" className="mx-auto mt-8 flex max-w-6xl flex-wrap justify-center gap-x-7 gap-y-3 text-[15px] font-medium text-neutral-700">
          {[trust("verification"), trust("pricing"), trust("onlineInPerson"), trust("bilingual")].map((item) => (
            <li key={item} className="flex items-center gap-2">
              <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-mint/15 text-emerald-700">
                <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Container>

      <Container className="relative pb-16 lg:pb-24">
        <div data-testid="hero-visual" className="relative mx-auto max-w-6xl">
          <div className="relative aspect-[4/3] overflow-hidden rounded-[32px] shadow-(--shadow-pop) sm:aspect-[16/9] lg:aspect-[21/9]">
            <Image
              src="/images/parents-students-hero.png"
              alt={t("imageAlt")}
              fill
              priority
              sizes="(min-width: 1280px) 1152px, 100vw"
              className="object-cover object-[58%_35%]"
            />
          </div>
          <div className="absolute -left-2 top-6 hidden items-center gap-3 sm:flex rounded-2xl bg-white/95 px-4 py-3 shadow-(--shadow-pop) backdrop-blur sm:-left-6 sm:top-10">
            <span className="flex size-10 items-center justify-center rounded-xl bg-mint/15 text-emerald-700">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold text-navy">{t("floatingApproved")}</span>
          </div>
          <div className="absolute -right-2 bottom-6 hidden items-center gap-3 sm:flex rounded-2xl bg-white/95 px-4 py-3 shadow-(--shadow-pop) backdrop-blur sm:-right-6 sm:bottom-10">
            <span className="flex size-10 items-center justify-center rounded-xl bg-blue/10 text-blue">
              <Video className="size-5" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold text-navy">{t("floatingModes")}</span>
          </div>
        </div>
      </Container>
    </section>
  );
}
