import { Construction } from "lucide-react";
import { Section } from "@/components/ui/Section";

/**
 * UX-404 — the shared, pure (no client hooks, no next-intl server calls) 404
 * content used by both src/app/[locale]/not-found.tsx (explicit notFound()
 * from inside a matched route, e.g. an invalid tutor slug) and
 * src/app/global-not-found.tsx (a genuinely unmatched URL — see that file's
 * own comment for why this app's dynamic-segment root layout needs the
 * separate global-not-found mechanism, and why it cannot use next-intl's
 * server APIs at all: they throw "No intl context found" there, confirmed
 * empirically against a local dev server, since global-not-found bypasses
 * the normal render pipeline next-intl's plugin hooks into).
 *
 * Deliberately renders plain `<a>` tags (styled to match the site's Button
 * component) instead of using next-intl's `Link`/the shared `Button`
 * component — both callers pass already locale-prefixed hrefs, so this
 * component has zero dependency on next-intl request context and is safe to
 * render identically from either file.
 */
const primaryClasses =
  "inline-flex h-11 items-center justify-center gap-2 rounded-md bg-blue px-5 text-[15px] font-semibold text-white transition-colors duration-200 hover:bg-blue-hover focus-visible:outline-2 focus-visible:outline-blue focus-visible:outline-offset-2";
const outlineClasses =
  "inline-flex h-11 items-center justify-center gap-2 rounded-md border border-neutral-300 bg-transparent px-5 text-[15px] font-semibold text-navy transition-colors duration-200 hover:border-navy hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-blue focus-visible:outline-offset-2";

export function NotFoundContent({
  title,
  description,
  homeHref,
  homeLabel,
  findTutorHref,
  findTutorLabel,
}: {
  title: string;
  description: string;
  homeHref: string;
  homeLabel: string;
  findTutorHref: string;
  findTutorLabel: string;
}) {
  return (
    <Section className="bg-off-white">
      <div className="mx-auto flex max-w-xl flex-col items-center py-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-md bg-blue/10 text-blue">
          <Construction size={26} aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-3xl font-bold tracking-tight text-navy md:text-4xl">{title}</h1>
        <p className="mt-4 text-lg leading-relaxed text-slate">{description}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a href={homeHref} className={primaryClasses}>
            {homeLabel}
          </a>
          <a href={findTutorHref} className={outlineClasses}>
            {findTutorLabel}
          </a>
        </div>
      </div>
    </Section>
  );
}
