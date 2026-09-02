import { describe, it, expect } from "vitest";
import { CANADIAN_PROVINCES_AND_TERRITORIES, isCanadianProvinceCode } from "./canadianProvinces";

describe("CANADIAN_PROVINCES_AND_TERRITORIES", () => {
  it("has exactly 13 entries — every Canadian province and territory", () => {
    expect(CANADIAN_PROVINCES_AND_TERRITORIES).toHaveLength(13);
  });

  it("has no duplicates", () => {
    expect(new Set(CANADIAN_PROVINCES_AND_TERRITORIES).size).toBe(13);
  });
});

describe("isCanadianProvinceCode", () => {
  it("accepts every canonical code", () => {
    for (const code of CANADIAN_PROVINCES_AND_TERRITORIES) {
      expect(isCanadianProvinceCode(code)).toBe(true);
    }
  });

  it("rejects a lowercase code — no implicit normalization", () => {
    expect(isCanadianProvinceCode("on")).toBe(false);
  });

  it("rejects a full province name", () => {
    expect(isCanadianProvinceCode("Ontario")).toBe(false);
  });

  it("rejects an unrelated/foreign region code", () => {
    expect(isCanadianProvinceCode("CA")).toBe(false);
    expect(isCanadianProvinceCode("NY")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isCanadianProvinceCode("")).toBe(false);
  });
});
