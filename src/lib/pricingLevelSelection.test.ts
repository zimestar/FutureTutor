import { describe, it, expect } from "vitest";
import { resolveInitialAcademicLevel } from "./pricingLevelSelection";

const LEVELS = [{ id: "elementary" }, { id: "middleSchool" }, { id: "highSchool" }];

describe("resolveInitialAcademicLevel", () => {
  it("preselects the student's academic level when it is one of the offered levels", () => {
    expect(resolveInitialAcademicLevel("middleSchool", LEVELS)).toBe("middleSchool");
  });

  it("returns empty (unresolved) when the student has no academic level on file", () => {
    expect(resolveInitialAcademicLevel(null, LEVELS)).toBe("");
    expect(resolveInitialAcademicLevel(undefined, LEVELS)).toBe("");
  });

  it("returns empty when the student's academic level is not one of the offered levels — e.g. the tutor doesn't teach it", () => {
    expect(resolveInitialAcademicLevel("university", LEVELS)).toBe("");
  });

  it("returns empty when the offered levels list is empty, regardless of the student's own level", () => {
    expect(resolveInitialAcademicLevel("elementary", [])).toBe("");
  });

  it("never returns a falsy-but-wrong value like undefined or null — always a string", () => {
    expect(resolveInitialAcademicLevel(null, LEVELS)).toBe("");
    expect(typeof resolveInitialAcademicLevel(null, LEVELS)).toBe("string");
  });
});
