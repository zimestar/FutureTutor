import { useTranslations } from "next-intl";
import { ClipboardList, Users, Rocket } from "lucide-react";
import { Section } from "@/components/ui/Section";

const steps = [
  { key: "step1" as const, icon: ClipboardList },
  { key: "step2" as const, icon: Users },
  { key: "step3" as const, icon: Rocket },
];

export function HowItWorks() {
  const t = useTranslations("howItWorks");

  return (
    <Section id="how-it-works" ariaLabelledby="how-it-works-heading" className="bg-white">
      <div className="mx-auto max-w-2xl text-center">
        <h2 id="how-it-works-heading" className="text-3xl font-bold tracking-tight text-navy md:text-4xl">
          {t("heading")}
        </h2>
        <p className="mt-3 text-lg text-slate">{t("subheading")}</p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-6">
        {steps.map((step) => (
          <div key={step.key} className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-navy text-white">
              <step.icon size={22} aria-hidden="true" />
            </div>
            <p className="mt-5 text-sm font-bold tracking-wide text-blue uppercase">
              {t(`steps.${step.key}.label`)}
            </p>
            <h3 className="mt-1 text-xl font-bold text-navy">{t(`steps.${step.key}.title`)}</h3>
            <p className="mt-2 leading-relaxed text-slate">{t(`steps.${step.key}.description`)}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
