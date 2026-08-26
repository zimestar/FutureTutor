import { useTranslations } from "next-intl";
import { ArrowDown } from "lucide-react";
import Image from "next/image";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { TutorSearch } from "@/components/marketing/TutorSearch";

export function Hero() {
  const t = useTranslations("hero");
  return (
    <section className="relative overflow-hidden bg-navy pb-16 pt-16 md:pb-20 md:pt-24">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_55%_at_82%_15%,rgba(37,99,235,0.35),transparent),radial-gradient(45%_40%_at_100%_85%,rgba(16,185,129,0.25),transparent)]" />
      <Container className="relative grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <div className="max-w-3xl animate-fade-up">
          <span className="inline-flex items-center rounded-pill border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/80">{t("eyebrow")}</span>
          <h1 className="mt-5 max-w-3xl text-balance text-4xl font-extrabold leading-[1.04] tracking-[-0.04em] text-white sm:text-5xl md:text-6xl">{t("title")}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-white/74 md:text-xl">{t("description")}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button href="/find-tutors" size="lg">{t("primaryCta")}</Button>
            <Button href="/how-it-works" variant="ghost-inverse" size="lg">{t("secondaryCta")}</Button>
          </div>
        </div>
        <div className="relative mx-auto aspect-[4/3] w-full max-w-xl overflow-hidden rounded-3xl border border-white/15 shadow-pop">
          <Image src="/images/parents-students-hero.png" alt={t("imageAlt")} fill priority sizes="(min-width: 1024px) 44vw, 92vw" className="object-cover object-center" />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-navy/35 to-transparent" />
        </div>
        <div className="lg:col-span-2">
          <div className="mx-auto max-w-4xl rounded-2xl border border-white/15 bg-white/8 p-3 text-left shadow-pop backdrop-blur-sm md:p-4">
            <p className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold text-white/72"><ArrowDown className="size-4 text-mint" aria-hidden="true" />{t("searchIntro")}</p>
            <TutorSearch />
          </div>
        </div>
      </Container>
    </section>
  );
}
