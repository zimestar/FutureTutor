import { useTranslations } from "next-intl";
import { Section } from "@/components/ui/Section";
import { TrackedCtaButton } from "@/components/marketing/TrackedCtaButton";

export function FinalCTA() {
  const t = useTranslations("finalCta");

  return (
    <Section className="bg-off-white">
      <div className="mx-auto flex max-w-2xl flex-col items-center rounded-xl border border-neutral-200 bg-white px-6 py-14 text-center shadow-card md:px-12 md:py-16">
        <h2 className="text-3xl font-bold tracking-tight text-navy md:text-4xl">{t("heading")}</h2>
        <p className="mt-3 text-lg text-slate">{t("description")}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <TrackedCtaButton href="/find-tutors" event="find_tutor_cta_clicked" properties={{ cta_location: "content" }} variant="primary" size="lg">
            {t("findTutor")}
          </TrackedCtaButton>
          <TrackedCtaButton href="/become-a-tutor" event="become_tutor_cta_clicked" properties={{ cta_location: "content" }} variant="outline" size="lg">
            {t("becomeATutor")}
          </TrackedCtaButton>
        </div>
      </div>
    </Section>
  );
}
