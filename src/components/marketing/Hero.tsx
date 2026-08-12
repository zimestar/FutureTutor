import { useTranslations } from "next-intl";
import { Star, CalendarCheck2, ShieldCheck } from "lucide-react";
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

        <div className="relative hidden lg:block" aria-hidden="true">
          <div className="relative mx-auto aspect-[4/5] w-full max-w-sm">
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue/30 via-navy to-mint/20" />
            <div className="absolute inset-0 rounded-xl border border-white/10" />

            <div className="absolute left-6 top-8 w-64 rounded-lg border border-white/10 bg-white p-4 shadow-pop">
              <p className="text-xs font-semibold text-slate">{t("visual.sessionSubject")}</p>
              <p className="mt-1 text-base font-bold text-navy">{t("visual.sessionWith")}</p>
              <div className="mt-3 flex items-center gap-1 text-warning">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} size={14} fill="currentColor" strokeWidth={0} />
                ))}
                <span className="ml-1 text-xs font-semibold text-neutral-500">4.9</span>
              </div>
            </div>

            <div className="absolute bottom-24 right-2 flex items-center gap-2 rounded-lg border border-white/10 bg-white px-4 py-3 shadow-pop">
              <CalendarCheck2 size={18} className="text-blue" />
              <span className="text-sm font-semibold text-navy">{t("visual.booked")}</span>
            </div>

            <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-lg border border-white/10 bg-white px-4 py-3 shadow-pop">
              <ShieldCheck size={18} className="text-mint" />
              <span className="text-sm font-semibold text-navy">{t("visual.verification")}</span>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
