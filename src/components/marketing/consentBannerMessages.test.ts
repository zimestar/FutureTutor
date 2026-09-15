import { describe, expect, it } from "vitest";
import enMessages from "../../../messages/en.json";
import frMessages from "../../../messages/fr.json";

// DATA-1 Consent Activation — ConsentBanner and CookiePreferencesControl are
// both driven entirely by the "consentBanner" i18n namespace. This locks in
// that every key one of those components calls actually exists, in both
// locales, with real (non-empty) translated text — not a placeholder.

const REQUIRED_KEYS = [
  "heading",
  "description",
  "learnMore",
  "accept",
  "reject",
  "preferencesHeading",
  "statusGranted",
  "statusDenied",
  "statusUndecided",
  "manageCta",
] as const;

describe("consentBanner i18n namespace", () => {
  const en = (enMessages as unknown as Record<string, Record<string, string>>).consentBanner;
  const fr = (frMessages as unknown as Record<string, Record<string, string>>).consentBanner;

  it("exists in both locales", () => {
    expect(en).toBeDefined();
    expect(fr).toBeDefined();
  });

  it("every required key is present with non-empty text in both locales", () => {
    for (const key of REQUIRED_KEYS) {
      expect(en[key], `en.consentBanner.${key}`).toBeTypeOf("string");
      expect(en[key].trim().length, `en.consentBanner.${key}`).toBeGreaterThan(0);
      expect(fr[key], `fr.consentBanner.${key}`).toBeTypeOf("string");
      expect(fr[key].trim().length, `fr.consentBanner.${key}`).toBeGreaterThan(0);
    }
  });

  it("English and French carry the same key set (no drift between locales)", () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });

  it("French text is actually French, not a copy of the English string", () => {
    for (const key of REQUIRED_KEYS) {
      expect(fr[key]).not.toBe(en[key]);
    }
  });
});
