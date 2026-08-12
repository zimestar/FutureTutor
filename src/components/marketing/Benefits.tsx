import { useTranslations } from "next-intl";
import { Target, Route, CalendarClock, LineChart, type LucideIcon } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { benefits, type Benefit } from "@/content/benefits";

const iconMap: Record<Benefit["icon"], LucideIcon> = {
  target: Target,
  route: Route,
  "calendar-clock": CalendarClock,
  "line-chart": LineChart,
};

export function Benefits() {
  const t = useTranslations("benefits");

  return (
    <Section id="why-futuretutor" ariaLabelledby="benefits-heading" className="bg-white">
      <div className="mx-auto max-w-2xl text-center">
        <h2 id="benefits-heading" className="text-3xl font-bold tracking-tight text-navy md:text-4xl">
          {t("heading")}
        </h2>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {benefits.map((benefit) => {
          const Icon = iconMap[benefit.icon];
          return (
            <div key={benefit.id}>
              <span className="flex h-12 w-12 items-center justify-center rounded-md bg-mint/10 text-success">
                <Icon size={22} aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-lg font-bold text-navy">{t(`items.${benefit.id}.title`)}</h3>
              <p className="mt-2 leading-relaxed text-slate">{t(`items.${benefit.id}.description`)}</p>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
