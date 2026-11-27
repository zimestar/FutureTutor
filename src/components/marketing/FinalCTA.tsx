import { useTranslations } from "next-intl";
import { Section } from "@/components/ui/Section";
import { TrackedCtaButton } from "@/components/marketing/TrackedCtaButton";

/** DESIGN-SYSTEM2 — closing call to action as a bold blue card. */
export function FinalCTA() {
  const t = useTranslations("finalCta");

  return (
    <Section className="bg-white pt-0">
      <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-blue via-[#1d4ed8] to-navy px-6 py-16 text-center text-white shadow-(--shadow-pop) md:px-16 md:py-20">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-16 size-80 rounded-full bg-mint/20 blur-3xl" />
        <h2 className="relative mx-auto max-w-2xl text-[2rem] font-extrabold leading-[1.12] md:text-[2.6rem]">{t("heading")}</h2>
        <p className="relative mx-auto mt-5 max-w-xl text-lg leading-8 text-white/80">{t("description")}</p>
        <div className="relative mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <TrackedCtaButton href="/find-tutors" event="find_tutor_cta_clicked" properties={{ cta_location: "content" }} variant="inverse" size="lg">
            {t("findTutor")}
          </TrackedCtaButton>
          <TrackedCtaButton href="/become-a-tutor" event="become_tutor_cta_clicked" properties={{ cta_location: "content" }} variant="ghost-inverse" size="lg">
            {t("becomeATutor")}
          </TrackedCtaButton>
        </div>
      </div>
    </Section>
  );
}
