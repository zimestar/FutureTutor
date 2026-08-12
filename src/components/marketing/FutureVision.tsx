import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { Badge } from "@/components/ui/Badge";

export function FutureVision() {
  const t = useTranslations("futureVision");

  return (
    <Section id="future-vision" ariaLabelledby="future-vision-heading" className="bg-off-white">
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-md bg-blue/10 text-blue">
          <Sparkles size={22} aria-hidden="true" />
        </span>
        <h2 id="future-vision-heading" className="mt-5 text-3xl font-bold tracking-tight text-navy md:text-4xl">
          {t("heading")}
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-slate">{t("description")}</p>
        <Badge variant="blue" className="mt-5">
          {t("badge")}
        </Badge>
      </div>
    </Section>
  );
}
