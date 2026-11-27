import type { LucideIcon } from "lucide-react";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { SectionIntro } from "@/components/marketing/SectionIntro";

/**
 * DESIGN-SYSTEM3 — building blocks for the informational public pages
 * (/parents, /pricing, /safety, /online-classroom). Content comes from
 * messages `infoPages.*`; these components only lay it out.
 */

export type InfoItem = { title: string; text: string };
export type InfoQuestion = { q: string; a: string };

export function InfoSteps({ eyebrow, title, items, tone = "white" }: { eyebrow: string; title: string; items: InfoItem[]; tone?: "white" | "canvas" }) {
  return (
    <Section className={tone === "white" ? "bg-white" : "bg-canvas"}>
      <SectionIntro eyebrow={eyebrow} title={title} />
      <ol className={`mt-12 grid gap-5 sm:grid-cols-2 ${items.length === 3 ? "lg:grid-cols-3" : items.length >= 6 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
        {items.map((item, index) => (
          <li key={item.title} className="rounded-3xl border border-border bg-white p-7 shadow-(--shadow-card)">
            <span className="flex size-10 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">{index + 1}</span>
            <p className="mt-5 text-lg font-bold text-navy">{item.title}</p>
            <p className="mt-2 leading-7 text-text-secondary">{item.text}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export function InfoFeatures({ eyebrow, title, items, icons, tone = "canvas" }: { eyebrow: string; title: string; items: InfoItem[]; icons: LucideIcon[]; tone?: "white" | "canvas" }) {
  return (
    <Section className={tone === "white" ? "bg-white" : "bg-canvas"}>
      <SectionIntro eyebrow={eyebrow} title={title} />
      <ul className={`mt-12 grid gap-5 sm:grid-cols-2 ${items.length % 3 === 0 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
        {items.map((item, index) => {
          const Icon = icons[index % icons.length];
          return (
            <li key={item.title} className="rounded-3xl border border-border bg-white p-7">
              <span className="flex size-11 items-center justify-center rounded-xl bg-blue/10 text-blue">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <p className="mt-5 text-lg font-bold text-navy">{item.title}</p>
              <p className="mt-2 leading-7 text-text-secondary">{item.text}</p>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function InfoChecklist({ title, items, children }: { title: string; items: string[]; children?: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-navy p-8 text-white sm:p-10">
      <p className="text-2xl font-bold tracking-tight">{title}</p>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-mint/20 text-mint">
              <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
            </span>
            <span className="font-medium text-white/90">{item}</span>
          </li>
        ))}
      </ul>
      {children}
    </div>
  );
}

export function InfoFaq({ title, items }: { title: string; items: InfoQuestion[] }) {
  return (
    <Section className="bg-white">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-center text-[2rem] font-bold leading-[1.1] text-navy md:text-[2.5rem]">{title}</h2>
        <div className="mt-10 divide-y divide-border rounded-3xl border border-border bg-white">
          {items.map((item) => (
            <details key={item.q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left font-semibold text-navy">
                {item.q}
                <ChevronDown className="size-5 shrink-0 text-text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="mt-3 leading-7 text-text-secondary">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}

export function InfoCta({ title, description, primary, secondary }: { title: string; description: string; primary: { label: string; href: string }; secondary?: { label: string; href: string } }) {
  return (
    <Section className="bg-canvas">
      <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-blue to-navy px-8 py-14 text-center text-white sm:px-14">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-white/10 blur-2xl" />
        <h2 className="relative mx-auto max-w-2xl text-[2rem] font-bold leading-[1.1] md:text-[2.5rem]">{title}</h2>
        <p className="relative mx-auto mt-4 max-w-xl text-lg leading-8 text-white/80">{description}</p>
        <div className="relative mt-8 flex flex-wrap justify-center gap-3">
          <Button href={primary.href} variant="inverse" size="lg">
            {primary.label}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
          {secondary && (
            <Button href={secondary.href} variant="ghost-inverse" size="lg">
              {secondary.label}
            </Button>
          )}
        </div>
      </div>
    </Section>
  );
}
