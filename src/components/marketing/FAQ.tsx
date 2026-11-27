import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { Link } from "@/i18n/navigation";
import { faqItemIds } from "@/content/faq";

/** DESIGN-SYSTEM2 — heading on the left, questions on the right from 1024px. */
export function FAQ() {
  const t = useTranslations("faq");

  return (
    <Section id="faq" ariaLabelledby="faq-heading" className="bg-white">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <h2 id="faq-heading" className="text-[2rem] font-extrabold leading-[1.12] text-navy md:text-[2.6rem]">
            {t("heading")}
          </h2>
          <p className="mt-5 max-w-md text-lg leading-8 text-neutral-600">
            {t("subheading")}{" "}
            <Link href="/contact" className="font-semibold text-blue hover:text-blue-hover">
              {t("contactLink")}
            </Link>
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {faqItemIds.map((id) => (
            <details key={id} className="group rounded-2xl border border-border bg-white px-6 transition-colors open:border-blue/25 open:bg-blue-50/40">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left text-base font-semibold text-navy marker:content-none">
                {t(`items.${id}.question`)}
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 transition-transform duration-200 group-open:rotate-45 group-open:bg-blue group-open:text-white">
                  <Plus size={16} aria-hidden="true" />
                </span>
              </summary>
              <p className="pb-6 leading-7 text-neutral-600">{t(`items.${id}.answer`)}</p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}
