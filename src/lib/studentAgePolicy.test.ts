import { describe, it, expect } from "vitest";
import {
  ageOfMajorityForProvince,
  calculateAgeAsOf,
  isEligibleForSelfManagedSignup,
} from "./studentAgePolicy";
import { CANADIAN_PROVINCES_AND_TERRITORIES, type CanadianProvinceCode } from "./canadianProvinces";

// BETA-AGE1 — permanent unit tests for the province-aware age-of-majority
// policy. Pure, no I/O, no database — every date here is an explicit
// parameter, never wall-clock time, so these tests are fully deterministic
// regardless of when they run.

const AGE_18_PROVINCES: CanadianProvinceCode[] = ["AB", "MB", "ON", "PE", "QC", "SK"];
const AGE_19_PROVINCES: CanadianProvinceCode[] = ["BC", "NB", "NL", "NT", "NS", "NU", "YT"];

describe("ageOfMajorityForProvince", () => {
  it("returns 18 for every AB/MB/ON/PE/QC/SK province", () => {
    for (const province of AGE_18_PROVINCES) {
      expect(ageOfMajorityForProvince(province)).toBe(18);
    }
  });

  it("returns 19 for every BC/NB/NL/NT/NS/NU/YT province", () => {
    for (const province of AGE_19_PROVINCES) {
      expect(ageOfMajorityForProvince(province)).toBe(19);
    }
  });

  it("covers all 13 canonical provinces/territories — no gaps, no extras", () => {
    const covered = [...AGE_18_PROVINCES, ...AGE_19_PROVINCES].sort();
    const canonical = [...CANADIAN_PROVINCES_AND_TERRITORIES].sort();
    expect(covered).toEqual(canonical);
  });
});

describe("calculateAgeAsOf", () => {
  it("does not compute age as a naive year subtraction — respects month/day", () => {
    // Born 2008-06-15; "today" is 2026-06-14 (one day before the 18th
    // birthday). Naive year subtraction would say 18; the correct answer
    // is 17.
    const dob = new Date("2008-06-15T00:00:00.000Z");
    const asOf = new Date("2026-06-14T00:00:00.000Z");
    expect(calculateAgeAsOf(dob, asOf)).toBe(17);
  });

  it("turns the new age exactly on the birthday", () => {
    const dob = new Date("2008-06-15T00:00:00.000Z");
    const asOf = new Date("2026-06-15T00:00:00.000Z");
    expect(calculateAgeAsOf(dob, asOf)).toBe(18);
  });

  it("stays at the new age the day after the birthday", () => {
    const dob = new Date("2008-06-15T00:00:00.000Z");
    const asOf = new Date("2026-06-16T00:00:00.000Z");
    expect(calculateAgeAsOf(dob, asOf)).toBe(18);
  });

  it("handles a birthday in a later month than the current month correctly", () => {
    // Born December; "today" is in January of what would naively look like
    // the birth-year-plus-N year — must NOT have incremented yet.
    const dob = new Date("2008-12-25T00:00:00.000Z");
    const asOf = new Date("2026-01-10T00:00:00.000Z");
    expect(calculateAgeAsOf(dob, asOf)).toBe(17);
  });

  it("handles a birthday in an earlier month than the current month correctly", () => {
    const dob = new Date("2008-02-01T00:00:00.000Z");
    const asOf = new Date("2026-06-15T00:00:00.000Z");
    expect(calculateAgeAsOf(dob, asOf)).toBe(18);
  });

  it("is exact for the mission's own 19-year-threshold boundary examples", () => {
    const dob = new Date("2007-03-10T00:00:00.000Z");
    const oneDayBefore19th = new Date("2026-03-09T00:00:00.000Z");
    const exact19th = new Date("2026-03-10T00:00:00.000Z");
    expect(calculateAgeAsOf(dob, oneDayBefore19th)).toBe(18);
    expect(calculateAgeAsOf(dob, exact19th)).toBe(19);
  });
});

describe("isEligibleForSelfManagedSignup", () => {
  describe("age-18 provinces (AB/MB/ON/PE/QC/SK)", () => {
    for (const province of AGE_18_PROVINCES) {
      it(`${province}: 17 years 364 days -> ineligible, exact 18th birthday -> eligible, 18+ -> eligible`, () => {
        const dob = new Date("2008-06-15T00:00:00.000Z");
        expect(isEligibleForSelfManagedSignup(dob, province, new Date("2026-06-14T00:00:00.000Z"))).toBe(false);
        expect(isEligibleForSelfManagedSignup(dob, province, new Date("2026-06-15T00:00:00.000Z"))).toBe(true);
        expect(isEligibleForSelfManagedSignup(dob, province, new Date("2027-06-15T00:00:00.000Z"))).toBe(true);
      });
    }
  });

  describe("age-19 provinces (BC/NB/NL/NT/NS/NU/YT)", () => {
    for (const province of AGE_19_PROVINCES) {
      it(`${province}: 18 years 364 days -> ineligible, exact 19th birthday -> eligible, 19+ -> eligible`, () => {
        const dob = new Date("2007-06-15T00:00:00.000Z");
        expect(isEligibleForSelfManagedSignup(dob, province, new Date("2026-06-14T00:00:00.000Z"))).toBe(false);
        expect(isEligibleForSelfManagedSignup(dob, province, new Date("2026-06-15T00:00:00.000Z"))).toBe(true);
        expect(isEligibleForSelfManagedSignup(dob, province, new Date("2027-06-15T00:00:00.000Z"))).toBe(true);
      });
    }
  });

  it("an 18-year-old in an age-19 province is still ineligible", () => {
    const dob = new Date("2008-06-15T00:00:00.000Z");
    const exactlyEighteen = new Date("2026-06-15T00:00:00.000Z");
    expect(isEligibleForSelfManagedSignup(dob, "BC", exactlyEighteen)).toBe(false);
  });

  it("an 18-year-old in an age-18 province is eligible", () => {
    const dob = new Date("2008-06-15T00:00:00.000Z");
    const exactlyEighteen = new Date("2026-06-15T00:00:00.000Z");
    expect(isEligibleForSelfManagedSignup(dob, "ON", exactlyEighteen)).toBe(true);
  });

  it("defaults `asOf` to the current time when omitted", () => {
    const clearlyAdult = new Date("1980-01-01T00:00:00.000Z");
    expect(isEligibleForSelfManagedSignup(clearlyAdult, "ON")).toBe(true);
    const clearlyAMinor = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000); // ~5 years old
    expect(isEligibleForSelfManagedSignup(clearlyAMinor, "ON")).toBe(false);
  });
});
