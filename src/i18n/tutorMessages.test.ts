import { createTranslator } from "use-intl/core";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

const tutorNamespaces = [
  "dashboard.nav",
  "dashboard.tutor",
  "quickMatch.tutorInvitation",
  "tutorAvailability",
  "tutorPayouts",
  "tutorProfileForm",
  "tutorDocuments",
  "tutorTraining",
  "tutorExam",
] as const;

const interpolationValues = {
  amount: "40.00",
  complete: 2,
  count: 2,
  currency: "CAD",
  date: "Jan 15, 2026",
  minutes: 15,
  name: "Taylor",
  number: 2,
  score: 85,
  subject: "Mathematics",
  total: 3,
};

function valueAtPath(source: object, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[key];
  }, source);
}

function leafKeys(source: unknown, prefix = ""): string[] {
  if (!source || typeof source !== "object" || Array.isArray(source)) return [prefix];
  return Object.entries(source).flatMap(([key, value]) => leafKeys(value, prefix ? `${prefix}.${key}` : key));
}

describe("FUI-3 Tutor message resolution", () => {
  for (const [locale, messages] of [["en", en], ["fr", fr]] as const) {
    it(`resolves every scoped Tutor message in ${locale}`, () => {
      for (const namespace of tutorNamespaces) {
        const namespaceMessages = valueAtPath(messages, namespace);
        expect(namespaceMessages, `${locale}:${namespace}`).toBeDefined();

        const translate = createTranslator({
          locale,
          messages,
          namespace,
          onError: (error) => {
            throw error;
          },
        }) as unknown as (key: string, values?: Record<string, string | number>) => string;

        for (const key of leafKeys(namespaceMessages)) {
          const rendered = translate(key, interpolationValues);
          expect(rendered, `${locale}:${namespace}.${key}`).not.toBe(`${namespace}.${key}`);
          expect(rendered, `${locale}:${namespace}.${key}`).not.toMatch(/^[A-Za-z][\w-]*(?:\.[\w-]+)+$/);
        }
      }
    });
  }
});
