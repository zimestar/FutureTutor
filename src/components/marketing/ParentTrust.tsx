import { useTranslations } from "next-intl";
import { FileText, DollarSign, CalendarDays, History, LineChart, MessageCircle } from "lucide-react";
import { Section } from "@/components/ui/Section";

const points = [
  { key: "profiles" as const, icon: FileText },
  { key: "pricing" as const, icon: DollarSign },
  { key: "scheduling" as const, icon: CalendarDays },
  { key: "history" as const, icon: History },
  { key: "progress" as const, icon: LineChart },
  { key: "communication" as const, icon: MessageCircle },
];

export function ParentTrust() {
  const t = useTranslations("parentTrust");

  return (
    <Section id="parent-trust" ariaLabelledby="parent-trust-heading" className="bg-white">
      <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 id="parent-trust-heading" className="text-3xl font-bold tracking-tight text-navy md:text-4xl">
            {t("heading")}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-slate">{t("description")}</p>
        </div>

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {points.map((point) => (
            <li
              key={point.key}
              className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-off-white p-4"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue/10 text-blue">
                <point.icon size={18} aria-hidden="true" />
              </span>
              <span className="text-sm font-semibold text-navy">{t(`points.${point.key}`)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
