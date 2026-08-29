/** FG-LEGAL1A — structural types for full legal-document content (Terms of
 * Service today; the Privacy Policy will reuse this same shape in a later
 * task). Deliberately separate from messages/*.json's flat UI-string
 * namespace — a 65-section bilingual legal document is structured document
 * content, not a set of short interface strings, and mixing the two would
 * bloat the shared messages file with content unrelated to UI localization. */

export type LegalBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  /** FG-LEGAL1C — a small, factual summary table (e.g. the Cookie Policy's
   * current-practices table). Every row must have the same length as
   * `headers`. Not intended for arbitrary layout — just a faithful
   * rendering of a source document's own tabular content. */
  | { type: "table"; headers: string[]; rows: string[][] };

export interface LegalSection {
  number: number;
  heading: string;
  /** Shown as a part divider immediately before this section, when present. */
  partTitle?: string;
  blocks: LegalBlock[];
}

export interface LegalDocumentContent {
  effectiveDate: string;
  lastUpdated: string;
  sections: LegalSection[];
}
