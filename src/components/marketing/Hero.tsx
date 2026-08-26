import { useTranslations } from "next-intl";
import { Check, MoveRight } from "lucide-react";
import Image from "next/image";
import { Container } from "@/components/ui/Container";
import { TutorSearch } from "@/components/marketing/TutorSearch";
import { Link } from "@/i18n/navigation";

export function Hero() {
  const t = useTranslations("hero");
  const trust = useTranslations("trustStrip");
  return (
    <section className="relative overflow-hidden bg-[#f8f6f1]">
      <div className="relative lg:min-h-[650px]">
        <div className="relative aspect-[16/10] w-full overflow-hidden sm:aspect-[16/8] lg:absolute lg:inset-y-0 lg:right-0 lg:aspect-auto lg:w-[69%]">
          <Image
            src="/images/parents-students-hero.png"
            alt={t("imageAlt")}
            fill
            priority
            sizes="(min-width: 1024px) 69vw, 100vw"
            className="object-cover object-[57%_center] sm:object-[55%_center] lg:object-[60%_center]"
          />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#f8f6f1]/35 via-transparent to-transparent lg:bg-gradient-to-r lg:from-[#f8f6f1] lg:from-0% lg:via-[#f8f6f1]/88 lg:via-24% lg:to-transparent lg:to-58%" />
        </div>

        <Container className="relative z-10 -mt-5 pb-10 pt-0 sm:-mt-10 lg:mt-0 lg:pb-28 lg:pt-16">
          <div className="max-w-[700px] rounded-t-3xl bg-[#f8f6f1] px-1 pt-8 sm:px-6 lg:rounded-none lg:bg-transparent lg:px-0 lg:pt-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue md:text-sm">{t("eyebrow")}</p>
            <h1 className="mt-5 text-balance font-serif text-[2.5rem] font-semibold leading-[0.96] tracking-[-0.045em] text-navy sm:text-6xl md:text-7xl lg:text-[4.5rem]">
              <span className="block">{t("titleLine1")}</span>
              <span className="mt-2 block text-blue">{t("titleLine2")}</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate md:text-xl">{t("description")}</p>
            <Link href="/how-it-works" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-md px-1 text-sm font-bold text-navy outline-none transition-colors hover:text-blue focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-4">
              {t("secondaryCta")}<MoveRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </Container>
      </div>

      <Container className="relative z-20 pb-10 lg:-mt-28">
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
