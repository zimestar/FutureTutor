import { libraryProvinces, pick, type LibrarySheet } from "@/content/library";

/**
 * ASSISTANT-1 — the FutureTutor library rendered as plain text for the
 * assistant's system prompt. Deterministic (same input, same bytes) so the
 * prompt prefix can be cached across requests.
 */
function renderSheet(sheet: LibrarySheet, locale: string): string {
  const p = (t: { fr: string; en: string }) => pick(t, locale);
  const lines = [
    p(sheet.summary),
    ...sheet.mustKnow.map((t) => `- ${p(t)}`),
    ...sheet.examples.map((e) => `Ex: ${p(e.problem)} -> ${e.steps.map(p).join(" ")} = ${p(e.answer)}`),
    ...sheet.commonMistakes.map((t) => `! ${p(t)}`),
  ];
  return lines.join("\n");
}

const cache = new Map<string, string>();

export function libraryKnowledge(locale: string): string {
  const key = locale === "fr" ? "fr" : "en";
  const hit = cache.get(key);
  if (hit) return hit;
  const parts: string[] = [];
  for (const province of libraryProvinces.filter((pr) => pr.available)) {
    for (const course of province.courses) {
      parts.push(`# ${pick(province.name, key)} — ${pick(course.title, key)} (${pick(course.officialName, key)})`);
      parts.push(`Official source: ${course.officialUrl}`);
      for (const strand of course.strands) {
        parts.push(`## ${pick(strand.title, key)}`);
        for (const chapter of strand.chapters) {
          const path = `/${key}/resources/library/${province.slug}/${course.slug}/${chapter.slug}`;
          parts.push(`### ${pick(chapter.title, key)} [${path}]`);
          parts.push(pick(chapter.goal, key));
          if (chapter.sheet) parts.push(renderSheet(chapter.sheet, key));
        }
      }
    }
  }
  const text = parts.join("\n");
  cache.set(key, text);
  return text;
}
