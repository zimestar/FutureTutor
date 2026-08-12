import { useTranslations } from "next-intl";
import Image from "next/image";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { TutorSearch } from "@/components/marketing/TutorSearch";

export function Hero() {
  const t = useTranslations("hero");

  return (
    <section className="relative overflow-hidden bg-navy pb-20 pt-14 md:pb-28 md:pt-20">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 55% at 82% 15%, rgba(37,99,235,0.35), transparent), radial-gradient(45% 40% at 100% 85%, rgba(16,185,129,0.25), transparent)",
        }}
      />

      <Container className="relative grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
        <div>
          <span className="inline-flex items-center rounded-pill border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/80">
            {t("eyebrow")}
          </span>

          <h1 className="mt-5 max-w-xl text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl md:text-6xl">
            {t("title")}
          </h1>

          <p className="mt-5 max-w-lg text-lg leading-relaxed text-white/70">{t("description")}</p>

          <div className="mt-8 max-w-2xl">
            <TutorSearch />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Button href="/become-a-tutor" variant="ghost-inverse" size="md" className="pl-0">
              {t("becomeATutor")} →
            </Button>
          </div>
        </div>

        <div className="relative hidden lg:block">
          <div className="relative mx-auto aspect-[4/5] w-full max-w-sm overflow-hidden rounded-xl shadow-pop">
            <Image
              src="/images/hero-tutoring-session.png"
              alt={t("imageAlt")}
              fill
              priority
              sizes="(min-width: 1024px) 384px, 0px"
              className="object-cover"
            />
          </div>
        </div>
      </Container>
    </section>
  );
}
