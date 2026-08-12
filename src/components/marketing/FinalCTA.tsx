import { useTranslations } from "next-intl";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";

export function FinalCTA() {
  const t = useTranslations("finalCta");

  return (
    <Section className="bg-off-white">
      <div className="mx-auto flex max-w-2xl flex-col items-center rounded-xl border border-neutral-200 bg-white px-6 py-14 text-center shadow-card md:px-12 md:py-16">
        <h2 className="text-3xl font-bold tracking-tight text-navy md:text-4xl">{t("heading")}</h2>
        <p className="mt-3 text-lg text-slate">{t("description")}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button href="/find-tutors" variant="primary" size="lg">
            {t("findTutor")}
          </Button>
          <Button href="/become-a-tutor" variant="outline" size="lg">
            {t("becomeATutor")}
          </Button>
        </div>
      </div>
    </Section>
  );
}
