import { useTranslations } from "next-intl";
import { Laptop, Home, Check } from "lucide-react";
import Image from "next/image";
import { Section } from "@/components/ui/Section";
import { DotCluster, HalfCircles, Ring, Sparkle } from "@/components/marketing/Decor";

/**
 * HOME-COLOR — online vs in-person, as two bright photo cards (blue and
 * coral) on a warm sun background, framed by the site's playful shapes.
 */
const columns = [
  {
    key: "online" as const,
    icon: Laptop,
    image: "/images/online-tutoring.png",
    card: "bg-blue text-white",
    chip: "bg-white text-blue",
    check: "bg-sun text-navy",
    body: "text-white/90",
  },
  {
    key: "inPerson" as const,
    icon: Home,
    image: "/images/library-tutoring.webp",
    card: "bg-coral text-navy",
    chip: "bg-white text-[#c2410c]",
    check: "bg-navy text-white",
    body: "text-navy/85",
  },
];

export function LearningModes() {
  const t = useTranslations("learningModes");

  return (
    <Section id="learning-modes" ariaLabelledby="learning-modes-heading" className="relative overflow-hidden bg-sun-50">
      <Sparkle className="left-[6%] top-16 hidden w-10 text-sun md:block" />
      <DotCluster delay={500} className="right-[5%] top-20 hidden w-16 text-lilac md:block" />
      <HalfCircles delay={900} className="bottom-6 left-[4%] hidden w-24 text-coral md:block" />
      <Ring className="-right-12 bottom-24 hidden size-32 text-blue/30 md:block" />
      <div className="reveal relative mx-auto max-w-2xl text-center">
        <h2 id="learning-modes-heading" className="text-[2rem] font-extrabold leading-[1.1] tracking-[-0.02em] text-navy md:text-[2.75rem]">
          {t("heading")}
        </h2>
        <p className="mt-4 text-lg leading-8 text-text-secondary">{t("subheading")}</p>
      </div>

      <div className="reveal-stagger relative mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
        {columns.map((col, index) => {
          const points = t.raw(`${col.key}.points`) as string[];
          return (
            <article key={col.key} className={`motion-lift relative flex flex-col overflow-hidden rounded-[32px] ${col.card}`}>
              <div className="relative m-3 aspect-[16/10] overflow-hidden rounded-[24px]">
                <Image
                  src={col.image}
                  alt={index === 0 ? t("imageAlt") : ""}
                  fill
                  sizes="(min-width: 768px) 560px, 92vw"
                  className="object-cover object-center"
                />
                <span className={`absolute left-4 top-4 flex size-12 items-center justify-center rounded-2xl shadow-(--shadow-pop) ${col.chip}`}>
                  <col.icon className="size-6" aria-hidden="true" />
                </span>
              </div>
              <div className="relative flex-1 px-7 pb-8 pt-4">
                <h3 className="text-2xl font-extrabold tracking-[-0.02em]">{t(`${col.key}.title`)}</h3>
                <ul className="mt-5 flex flex-col gap-3">
                  {points.map((point) => (
                    <li key={point} className={`flex items-start gap-3 ${col.body}`}>
                      <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${col.check}`}>
                        <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
                      </span>
                      <span className="font-medium">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          );
        })}
      </div>
    </Section>
  );
}
