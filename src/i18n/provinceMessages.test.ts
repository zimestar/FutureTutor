import { describe, it, expect } from "vitest";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { CANADIAN_PROVINCES_AND_TERRITORIES } from "@/lib/canadianProvinces";

// BETA-UX-PROVINCES1 — the signup and in-person-location province <select>s
// (SignupForm.tsx, InPersonTutoringLocation.tsx's LocationForm) now render
// tProvinces(code) as the option LABEL while the <option value> stays the
// canonical AB/BC/... code — see the shared `provinces` translation
// namespace both components consume. This file proves that namespace is
// complete and correct; it does not re-test option VALUES (those are
// covered by canadianProvinces.test.ts / studentAgePolicy.test.ts /
// schemas/auth.test.ts, all untouched by this mission and still passing).

describe("BETA-UX-PROVINCES1 — province display-name translations", () => {
  it("EN: shows full names instead of the raw code for the mission's own examples", () => {
    expect(en.provinces.AB).toBe("Alberta");
    expect(en.provinces.ON).toBe("Ontario");
    expect(en.provinces.QC).toBe("Quebec");
  });

  it("FR: shows the localized full name, not the raw code, for the same examples", () => {
    expect(fr.provinces.AB).toBe("Alberta");
    expect(fr.provinces.ON).toBe("Ontario");
    expect(fr.provinces.QC).toBe("Québec");
  });

  for (const [locale, messages] of [
    ["en", en],
    ["fr", fr],
  ] as const) {
    it(`${locale}: all 13 canonical provinces/territories have a display name, and no extras exist`, () => {
      const keys = Object.keys(messages.provinces).sort();
      const expected = [...CANADIAN_PROVINCES_AND_TERRITORIES].sort();
      expect(keys).toEqual(expected);
    });

    it(`${locale}: no province display name is blank or literally just the code (a real translation, not a passthrough)`, () => {
      for (const code of CANADIAN_PROVINCES_AND_TERRITORIES) {
        const label = messages.provinces[code];
        expect(label, code).toBeTruthy();
        expect(label, code).not.toBe(code);
      }
    });
  }

  it("EN and FR agree on exactly the same set of 13 codes (no locale drift)", () => {
    expect(Object.keys(en.provinces).sort()).toEqual(Object.keys(fr.provinces).sort());
  });
});
