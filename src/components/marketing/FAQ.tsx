import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { faqItemIds } from "@/content/faq";

export function FAQ() {
  const t = useTranslations("faq");

  return (
    <Section id="faq" ariaLabelledby="faq-heading" className="bg-white">
      <div className="mx-auto max-w-2xl text-center">
        <h2 id="faq-heading" className="text-3xl font-bold tracking-tight text-navy md:text-4xl">
          {t("heading")}
        </h2>
      </div>

      <div className="mx-auto mt-10 flex max-w-3xl flex-col divide-y divide-neutral-200 border-t border-b border-neutral-200">
        {faqItemIds.map((id) => (
          <details key={id} className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-bold text-navy marker:content-none">
              {t(`items.${id}.question`)}
              <ChevronDown
                size={20}
                className="shrink-0 text-slate transition-transform duration-200 group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <p className="mt-3 leading-relaxed text-slate">{t(`items.${id}.answer`)}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
