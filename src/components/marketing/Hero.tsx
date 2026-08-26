import { useTranslations } from "next-intl";
import { Check, MoveRight } from "lucide-react";
import Image from "next/image";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { TutorSearch } from "@/components/marketing/TutorSearch";
import { Link } from "@/i18n/navigation";

export function Hero() {
  const t = useTranslations("hero");
  const trust = useTranslations("trustStrip");
  return (
    <section className="relative bg-[#f8f6f1]">
      <div className="relative xl:min-h-[690px]">
        <Container className="relative z-10 pb-8 pt-12 sm:pb-10 sm:pt-16 xl:pb-28 xl:pt-20">
          <div data-testid="hero-copy" className="max-w-[620px]">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue md:text-sm">{t("eyebrow")}</p>
            <h1 className="mt-5 text-balance font-sans text-[clamp(2.7rem,8vw,4.5rem)] font-extrabold leading-[0.98] tracking-[-0.05em] text-navy xl:text-[clamp(4rem,5vw,4.75rem)]">
              <span className="text-blue">{t("titleEmphasis")}</span>{" "}
              <span>{t("titleRest")}</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate md:text-xl">{t("description")}</p>
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <Button href="/find-tutors" size="lg">{t("primaryCta")}</Button>
              <Link href="/how-it-works" className="inline-flex min-h-11 items-center gap-2 rounded-md px-1 text-sm font-bold text-navy outline-none transition-colors hover:text-blue focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-4">
                {t("secondaryCta")}<MoveRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </Container>

        <div data-testid="hero-visual" className="relative aspect-[16/10] w-full overflow-hidden sm:aspect-[16/8] xl:absolute xl:inset-y-0 xl:right-0 xl:aspect-auto xl:w-[72%]">
          <Image
            src="/images/parents-students-hero.png"
            alt={t("imageAlt")}
            fill
            priority
            sizes="(min-width: 1280px) 72vw, 100vw"
            className="object-cover object-[57%_center] sm:object-[55%_center] xl:object-[60%_center]"
          />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#f8f6f1]/20 via-transparent to-transparent xl:bg-gradient-to-r xl:from-[#f8f6f1] xl:from-0% xl:via-[#f8f6f1]/90 xl:via-25% xl:to-transparent xl:to-58%" />
        </div>
      </div>

      <Container className="relative z-20 pb-10 xl:-mt-28">
        <div className="mx-auto max-w-6xl">
          <p className="mb-3 text-sm font-semibold text-navy/70">{t("searchIntro")}</p>
          <TutorSearch presentation="hero" />
          <ul className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 px-1 text-sm font-semibold text-navy/72 sm:grid-cols-2 lg:grid-cols-4">
            {[trust("personalized"), trust("onlineInPerson"), trust("flexible"), trust("verification")].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-mint/18 text-emerald-700"><Check className="size-3.5" aria-hidden="true" /></span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </Container>
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 bottom-12 size-64 rounded-full bg-blue/5 blur-3xl" />
    </section>
  );
}
