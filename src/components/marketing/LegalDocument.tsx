import { Container } from "@/components/ui/Container";
import { Link } from "@/i18n/navigation";
import type { LegalDocumentContent } from "@/content/legal/types";

/** FG-LEGAL1A — renders a full structured legal document (Terms, Privacy
 * Policy, and — as of FG-LEGAL1C — the Cookie Policy all reuse this same
 * component). A plain Server Component: the legal text is readable without
 * any client-side JavaScript, per the mission's own requirement. Proper
 * heading hierarchy (h1 title, h2 per numbered section) for accessibility
 * and readability. */
export function LegalDocument({
  title,
  effectiveDateLabel,
  lastUpdatedLabel,
  content,
  relatedLinks,
}: {
  title: string;
  effectiveDateLabel: string;
  lastUpdatedLabel: string;
  content: LegalDocumentContent;
  /** FG-LEGAL1C — cross-links to FutureTutor's other legal documents,
   * rendered after the document body so a reader of one policy can reach
   * the others without hunting for the footer. */
  relatedLinks?: { href: string; label: string }[];
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
                  if (block.type === "table") {
                    return (
                      <div key={index} className="overflow-x-auto">
                        <table className="w-full min-w-[420px] border-collapse text-left text-sm">
                          <thead>
                            <tr>
                              {block.headers.map((header, headerIndex) => (
                                <th
                                  key={headerIndex}
                                  className="border-b border-neutral-300 py-2 pr-4 font-semibold text-navy"
                                >
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {block.rows.map((row, rowIndex) => (
                              <tr key={rowIndex}>
                                {row.map((cell, cellIndex) => (
                                  <td key={cellIndex} className="border-b border-neutral-200 py-2 pr-4 align-top">
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
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

      {relatedLinks && relatedLinks.length > 0 && (
        <div className="mt-12 flex flex-wrap gap-x-6 gap-y-2 border-t border-neutral-200 pt-6 text-sm">
          {relatedLinks.map((link) => (
            <Link key={link.href} href={link.href} className="font-semibold text-blue hover:text-blue-hover">
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </Container>
  );
}
