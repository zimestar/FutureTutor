import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getLibraryChapter, libraryProvinces } from "@/content/library";

describe("LIBRARY-1 — curriculum library content", () => {
  const available = libraryProvinces.filter((p) => p.available);

  it("only lists provinces with real courses as available", () => {
    for (const province of libraryProvinces) {
      expect(province.available).toBe(province.courses.length > 0);
    }
  });

  it("links every course to its official provincial source", () => {
    for (const province of available) {
      for (const course of province.courses) {
        expect(course.officialUrl).toMatch(/^https:\/\/curriculum\.learnalberta\.ca\//);
        expect(course.officialStatus.fr.length).toBeGreaterThan(0);
        expect(course.officialStatus.en.length).toBeGreaterThan(0);
      }
    }
  });

  it("uses unique chapter slugs within a course and resolves every chapter", () => {
    for (const province of available) {
      for (const course of province.courses) {
        const slugs = course.strands.flatMap((s) => s.chapters.map((c) => c.slug));
        expect(new Set(slugs).size).toBe(slugs.length);
        for (const slug of slugs) expect(getLibraryChapter(province.slug, course.slug, slug)).toBeDefined();
      }
    }
  });

  it("gives every sheet bilingual text, worked examples and practice with answers", () => {
    for (const province of available) {
      for (const course of province.courses) {
        for (const chapter of course.strands.flatMap((s) => s.chapters)) {
          const sheet = chapter.sheet;
          if (!sheet) continue;
          expect(sheet.examples.length).toBeGreaterThanOrEqual(2);
          expect(sheet.practice.length).toBeGreaterThanOrEqual(5);
          for (const text of [sheet.summary, ...sheet.mustKnow, ...sheet.explanation, ...sheet.commonMistakes, ...sheet.parentTips, ...sheet.practice.flatMap((p) => [p.question, p.answer])]) {
            expect(text.fr.trim().length).toBeGreaterThan(0);
            expect(text.en.trim().length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("keeps draft sheets out of search engines (index only when reviewed)", () => {
    const page = readFileSync("src/app/[locale]/resources/library/[province]/[course]/[chapter]/page.tsx", "utf8");
    expect(page).toContain('const index = found.chapter.sheet?.reviewStatus === "reviewed";');
    expect(page).toContain('sheet.reviewStatus === "draft"');
  });
});
