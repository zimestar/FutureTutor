import { useTranslations } from "next-intl";
import { Construction } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";

export function ComingSoon({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const t = useTranslations("comingSoon");

  return (
    <Section className="bg-off-white">
      <div className="mx-auto flex max-w-xl flex-col items-center py-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-md bg-blue/10 text-blue">
          <Construction size={26} aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-3xl font-bold tracking-tight text-navy md:text-4xl">{title}</h1>
        <p className="mt-4 text-lg leading-relaxed text-slate">{description}</p>
        <div className="mt-8">
          <Button href="/">{t("backHome")}</Button>
        </div>
      </div>
    </Section>
  );
}
