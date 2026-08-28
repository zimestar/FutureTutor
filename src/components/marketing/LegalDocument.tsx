import { Container } from "@/components/ui/Container";
import type { LegalDocumentContent } from "@/content/legal/types";

/** FG-LEGAL1A — renders a full structured legal document (Terms today;
 * Privacy Policy will reuse this in a later task). A plain Server
 * Component: the legal text is readable without any client-side
 * JavaScript, per the mission's own requirement. Proper heading hierarchy
 * (h1 title, h2 per numbered section) for accessibility and readability. */
export function LegalDocument({
  title,
  effectiveDateLabel,
  lastUpdatedLabel,
  content,
}: {
  title: string;
  effectiveDateLabel: string;
  lastUpdatedLabel: string;
  content: LegalDocumentContent;
}) {
  return (
    <Container as="article" className="py-12 md:py-16">
      <header className="border-b border-neutral-200 pb-8">
        <h1 className="text-3xl font-bold tracking-tight text-navy md:text-4xl">{title}</h1>
        <dl className="mt-4 flex flex-col gap-1 text-sm text-slate">
          <div className="flex gap-2">
            <dt className="font-semibold text-navy">{effectiveDateLabel}:</dt>
            <dd>{content.effectiveDate}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-semibold text-navy">{lastUpdatedLabel}:</dt>
            <dd>{content.lastUpdated}</dd>
          </div>
        </dl>
      </header>

      <div className="mt-10 flex flex-col gap-10">
        {content.sections.map((section) => (
          <div key={section.number}>
            {section.partTitle && (
              <h2 className="mb-6 border-b border-neutral-200 pb-2 text-xs font-bold tracking-wide text-blue uppercase">
                {section.partTitle}
              </h2>
            )}
            <section id={`section-${section.number}`} aria-labelledby={`section-${section.number}-heading`}>
              <h3 id={`section-${section.number}-heading`} className="text-lg font-bold text-navy md:text-xl">
                {section.number}. {section.heading}
              </h3>
              <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-slate md:text-[15px]">
                {section.blocks.map((block, index) => {
                  if (block.type === "p") {
                    return (
                      <p key={index} className="whitespace-pre-line">
                        {block.text}
                      </p>
                    );
                  }
                  const ListTag = block.type === "ol" ? "ol" : "ul";
                  return (
                    <ListTag key={index} className={block.type === "ol" ? "list-decimal space-y-1.5 pl-5" : "list-disc space-y-1.5 pl-5"}>
                      {block.items.map((item, itemIndex) => (
                        <li key={itemIndex}>{item}</li>
                      ))}
                    </ListTag>
                  );
                })}
              </div>
            </section>
          </div>
        ))}
      </div>
    </Container>
  );
}
