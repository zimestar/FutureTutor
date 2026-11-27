import { useTranslations } from "next-intl";
import { Check, CircleCheck, MoveRight, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { Container } from "@/components/ui/Container";
import { Link } from "@/i18n/navigation";
import { TutorSearch } from "@/components/marketing/TutorSearch";
import { TrackedLink } from "@/components/marketing/TrackedLink";

/**
 * HOME-V2 — split hero. Copy and the real tutor search on the left (they come
 * first in the DOM, so on mobile they sit above the photo), the photo on the
 * right with two small product cues. Four verifiable guarantees underneath.
 */
export function Hero() {
  const t = useTranslations("hero");
  const tv = useTranslations("homeV2.hero");
  const trust = useTranslations("trustStrip");

  const linkClass =
    "group inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold outline-none transition-colors hover:text-blue focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-4";

  return (
    <section className="relative overflow-x-clip bg-white bg-[radial-gradient(1100px_520px_at_88%_-8%,var(--color-blue-100)_0%,transparent_62%)]">
      <Container className="relative pb-10 pt-10 sm:pt-14 lg:pb-12 lg:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14">
          <div data-testid="hero-copy" className="relative z-20 min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full bg-mint-50 px-3.5 py-1.5 text-[13px] font-semibold text-emerald-700">
              <span className="size-2 rounded-full bg-mint" aria-hidden="true" />
              {t("eyebrow")}
            </p>
            <h1
              data-testid="hero-heading"
              className="mt-6 text-[clamp(2.6rem,5vw,3.75rem)] font-extrabold leading-[1.02] tracking-[-0.035em] text-navy"
            >
              <span className="text-blue">{t("titleEmphasis")}</span> <span>{t("titleRest")}</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-text-secondary md:text-xl md:leading-9">{t("description")}</p>

            <div className="mt-8">
              <TutorSearch presentation="panel" />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-1 text-navy">
              <TrackedLink href="/find-tutors" event="find_tutor_cta_clicked" properties={{ cta_location: "hero" }} className={linkClass}>
                {t("primaryCta")}
                <MoveRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </TrackedLink>
              <TrackedLink href="/how-it-works" event="how_it_works_cta_clicked" properties={{ cta_location: "hero" }} className={linkClass}>
                {t("secondaryCta")}
                <MoveRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </TrackedLink>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-blue">
              <Link href="/signup?role=parent" className={linkClass}>{t("parentsLink")}</Link>
              <Link href="/become-a-tutor" className={linkClass}>{tv("tutorLink")}</Link>
            </div>
          </div>

          <div data-testid="hero-visual" className="relative mx-auto w-full max-w-xl lg:max-w-none">
            <div className="relative aspect-[4/3] overflow-hidden rounded-[32px] shadow-(--shadow-pop) lg:aspect-[4/4.3]">
              <Image
                src="/images/home-tutoring-session.webp"
                alt={t("imageAlt")}
                fill
                priority
                sizes="(min-width: 1024px) 560px, 100vw"
                className="object-cover object-[50%_42%]"
              />
            </div>
            <div className="absolute -right-3 top-6 hidden items-center gap-2 rounded-full bg-navy px-4 py-2.5 text-sm font-semibold text-white shadow-(--shadow-pop) sm:flex lg:-right-5 lg:top-10">
              <ShieldCheck className="size-4 text-emerald-300" aria-hidden="true" />
              {tv("verified")}
            </div>
            <div className="absolute -left-3 bottom-8 hidden w-72 items-center gap-3 rounded-2xl border border-border bg-white p-4 shadow-(--shadow-pop) sm:flex lg:-left-8 lg:bottom-14">
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

        <ul data-testid="hero-trust-row" className="mt-14 grid grid-cols-1 gap-4 border-t border-border pt-7 sm:grid-cols-2 lg:grid-cols-4">
          {[trust("verification"), trust("pricing"), trust("onlineInPerson"), trust("bilingual")].map((item) => (
            <li key={item} className="flex items-center gap-3 text-[15px] font-semibold text-neutral-800">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue">
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
