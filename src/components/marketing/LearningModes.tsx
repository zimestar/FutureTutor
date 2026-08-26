import { useTranslations } from "next-intl";
import { Laptop, Home, Check } from "lucide-react";
import Image from "next/image";
import { Section } from "@/components/ui/Section";

const columns = [
  { key: "online" as const, icon: Laptop },
  { key: "inPerson" as const, icon: Home },
];

export function LearningModes() {
  const t = useTranslations("learningModes");

  return (
    <Section id="learning-modes" ariaLabelledby="learning-modes-heading" className="bg-navy text-white">
      <div className="mx-auto max-w-2xl text-center">
        <h2 id="learning-modes-heading" className="text-3xl font-bold tracking-tight md:text-4xl">
          {t("heading")}
        </h2>
        <p className="mt-3 text-lg text-white/70">{t("subheading")}</p>
      </div>

      <div className="relative mt-10 aspect-[16/8] overflow-hidden rounded-3xl border border-white/12 shadow-pop md:aspect-[16/7]">
        <Image
          src="/images/online-tutoring.png"
          alt={t("imageAlt")}
          fill
          sizes="(min-width: 1280px) 1200px, 92vw"
          className="object-cover object-center"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-navy/20 via-transparent to-navy/10" />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        {columns.map((col) => {
          const points = t.raw(`${col.key}.points`) as string[];
          return (
            <div key={col.key} className="rounded-lg border border-white/10 bg-white/5 p-8">
              <span className="flex h-12 w-12 items-center justify-center rounded-md bg-white/10 text-mint">
                <col.icon size={22} aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-xl font-bold">{t(`${col.key}.title`)}</h3>
              <ul className="mt-4 flex flex-col gap-3">
                {points.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-white/80">
                    <Check size={18} className="mt-0.5 shrink-0 text-mint" aria-hidden="true" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
