import { useTranslations } from "next-intl";
import { CalendarRange, Star, Laptop2, Users2 } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";

const perks = [
  { key: "schedule" as const, icon: CalendarRange },
  { key: "reputation" as const, icon: Star },
  { key: "teach" as const, icon: Laptop2 },
  { key: "manage" as const, icon: Users2 },
];

export function TutorCTA() {
  const t = useTranslations("tutorCta");

  return (
    <Section id="for-tutors" ariaLabelledby="tutor-cta-heading" className="bg-off-white">
      <div className="overflow-hidden rounded-xl bg-navy px-6 py-12 md:px-14 md:py-16">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h2 id="tutor-cta-heading" className="text-3xl font-bold tracking-tight text-white md:text-4xl">
              {t("heading")}
            </h2>
            <p className="mt-4 max-w-lg text-lg leading-relaxed text-white/70">{t("description")}</p>
            <div className="mt-7">
              <Button href="/become-a-tutor" variant="primary" size="lg">
                {t("cta")}
              </Button>
            </div>
          </div>

          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {perks.map((perk) => (
              <li
                key={perk.key}
                className="flex items-center gap-3 rounded-md border border-white/10 bg-white/5 p-4"
              >
                <perk.icon size={18} className="shrink-0 text-mint" aria-hidden="true" />
                <span className="text-sm font-semibold text-white">{t(`perks.${perk.key}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}
