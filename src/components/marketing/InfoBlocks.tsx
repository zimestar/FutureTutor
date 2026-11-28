import type { LucideIcon } from "lucide-react";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { SectionIntro } from "@/components/marketing/SectionIntro";
import { DotCluster, HalfCircles, Sparkle } from "@/components/marketing/Decor";

/**
 * DESIGN-SYSTEM3 — building blocks for the informational public pages
 * (/parents, /pricing, /safety, /online-classroom). Content comes from
 * messages `infoPages.*`; these components only lay it out.
 *
 * HOME-COLOR — the same accent palette and scroll motion as the homepage:
 * numbered steps and icon chips rotate through blue, coral, mint, sun and
 * lilac; grids reveal one card after the other.
 */

export type InfoItem = { title: string; text: string };
export type InfoQuestion = { q: string; a: string };

const stepTones = [
  { chip: "bg-blue text-white", card: "border-blue-100 bg-blue-50" },
  { chip: "bg-coral text-navy", card: "border-coral-100 bg-coral-50" },
  { chip: "bg-mint text-navy", card: "border-mint-100 bg-mint-50" },
  { chip: "bg-sun text-navy", card: "border-sun-100 bg-sun-50" },
  { chip: "bg-lilac text-white", card: "border-lilac-100 bg-lilac-50" },
  { chip: "bg-sky text-navy", card: "border-blue-100 bg-sky-50" },
];

const iconTones = [
  "bg-blue-50 text-blue",
  "bg-coral-50 text-[#c2410c]",
  "bg-mint-50 text-emerald-700",
  "bg-sun-50 text-amber-700",
  "bg-lilac-50 text-[#6d5bd0]",
  "bg-sky-50 text-sky-700",
];

export function InfoSteps({ eyebrow, title, items, tone = "white" }: { eyebrow: string; title: string; items: InfoItem[]; tone?: "white" | "canvas" }) {
  return (
    <Section className={tone === "white" ? "bg-white" : "bg-canvas"}>
      <SectionIntro eyebrow={eyebrow} title={title} />
      <ol className={`reveal-stagger mt-12 grid gap-5 sm:grid-cols-2 ${items.length === 3 ? "lg:grid-cols-3" : items.length >= 6 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
        {items.map((item, index) => {
          const t = stepTones[index % stepTones.length];
          return (
            <li key={item.title} className={`rounded-3xl border p-7 ${t.card}`}>
              <span className={`flex size-11 items-center justify-center rounded-full text-base font-extrabold ${t.chip}`}>{index + 1}</span>
              <p className="mt-5 text-lg font-bold text-navy">{item.title}</p>
              <p className="mt-2 leading-7 text-text-secondary">{item.text}</p>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

export function InfoFeatures({ eyebrow, title, items, icons, tone = "canvas" }: { eyebrow: string; title: string; items: InfoItem[]; icons: LucideIcon[]; tone?: "white" | "canvas" }) {
  return (
    <Section className={tone === "white" ? "bg-white" : "bg-canvas"}>
      <SectionIntro eyebrow={eyebrow} title={title} />
      <ul className={`reveal-stagger mt-12 grid gap-5 sm:grid-cols-2 ${items.length % 3 === 0 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
        {items.map((item, index) => {
          const Icon = icons[index % icons.length];
          return (
            <li key={item.title} className="rounded-3xl border border-border bg-white p-7 transition-shadow hover:shadow-(--shadow-card-hover)">
              <span className={`flex size-12 items-center justify-center rounded-2xl ${iconTones[index % iconTones.length]}`}>
                <Icon className="size-6" aria-hidden="true" />
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
    <div className="reveal relative overflow-hidden rounded-3xl bg-navy p-8 text-white sm:p-10">
      <Sparkle className="right-8 top-8 w-8 text-sun" />
      <DotCluster delay={600} className="-bottom-6 -right-6 w-24 text-coral/80" />
      <p className="relative text-2xl font-bold tracking-tight">{title}</p>
      <ul className="relative mt-6 grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-sun text-navy">
              <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
            </span>
            <span className="font-medium text-white/90">{item}</span>
          </li>
        ))}
      </ul>
      <div className="relative">{children}</div>
    </div>
  );
}

export function InfoFaq({ title, items }: { title: string; items: InfoQuestion[] }) {
  return (
    <Section className="bg-white">
      <div className="reveal mx-auto max-w-3xl">
        <h2 className="text-center text-[2rem] font-bold leading-[1.1] text-navy md:text-[2.5rem]">{title}</h2>
        <div className="mt-10 divide-y divide-border rounded-3xl border border-border bg-white">
          {items.map((item) => (
            <details key={item.q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left font-semibold text-navy">
                {item.q}
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue transition-colors group-open:bg-blue group-open:text-white">
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                </span>
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
      <div className="reveal relative overflow-hidden rounded-[32px] bg-blue px-8 py-14 text-center text-white sm:px-14">
        <span aria-hidden="true" className="pointer-events-none absolute -left-16 -top-16 size-56 rounded-full bg-sun" />
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-20 -right-12 size-64 rounded-full bg-coral/90" />
        <Sparkle className="right-[18%] top-10 hidden w-9 text-white sm:block" />
        <HalfCircles delay={800} className="bottom-8 left-[12%] hidden w-24 text-mint sm:block" />
        <h2 className="relative mx-auto max-w-2xl text-[2rem] font-bold leading-[1.1] md:text-[2.5rem]">{title}</h2>
        <p className="relative mx-auto mt-4 max-w-xl text-lg leading-8 text-white/85">{description}</p>
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
