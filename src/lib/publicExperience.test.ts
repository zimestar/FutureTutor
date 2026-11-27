import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

function keyShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(keyShape);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, keyShape(child)]),
    );
  }
  return typeof value;
}

describe("public experience regression boundary", () => {
  it("uses approved database-backed tutor profiles instead of demo identities", () => {
    const featured = readFileSync("src/components/marketing/FeaturedTutors.tsx", "utf8");
    const sitemap = readFileSync("src/app/sitemap.ts", "utf8");

    // RW-03 — APPROVED (and account-not-deactivated) via the shared rule.
    expect(featured).toContain("...BOOKABLE_TUTOR_WHERE");
    expect(readFileSync("src/lib/tutorBookability.ts", "utf8")).toContain('applicationStatus: "APPROVED"');
    expect(featured).toContain("tutorProfileToCardData");
    expect(featured).not.toMatch(/demoTutors|DemoTutor/);
    expect(sitemap).not.toMatch(/demoTutors|DemoTutor/);
    expect(existsSync("src/content/demoTutors.ts")).toBe(false);
    expect(existsSync("src/components/marketing/DemoTutorCard.tsx")).toBe(false);
  });

  it("keeps the public route inventory discoverable without fabricated tutor URLs", () => {
    const sitemap = readFileSync("src/app/sitemap.ts", "utf8");

    for (const route of ["/about", "/contact", "/tutor-resources", "/find-tutors"]) {
      expect(sitemap).toContain(`"${route}"`);
    }
    expect(sitemap).not.toContain("demo-tutor");
  });

  it("keeps the new public narrative structurally aligned in English and French", () => {
    expect(keyShape(en.publicExperience)).toEqual(keyShape(fr.publicExperience));
  });

  it("wraps, but does not replace, the established authentication forms", () => {
    const routes = {
      login: "LoginForm",
      signup: "SignupForm",
      "forgot-password": "ForgotPasswordForm",
      "reset-password": "ResetPasswordForm",
    } as const;

    for (const [route, form] of Object.entries(routes)) {
      const page = readFileSync(`src/app/[locale]/${route}/page.tsx`, "utf8");
      expect(page).toContain("AuthExperienceShell");
      expect(page).toContain(`<${form}`);
    }

    expect(readFileSync("src/components/marketing/LoginForm.tsx", "utf8")).toContain(
      'from "@/lib/actions/auth"',
    );
    expect(readFileSync("src/components/marketing/SignupForm.tsx", "utf8")).toContain(
      'from "@/lib/actions/auth"',
    );
  });

  it("references every approved editorial image through the public presentation layer", () => {
    const files = [
      "home-tutoring-session-v2.webp",
      "parent-homework-help-v2.webp",
      "online-classroom-session.webp",
      "tutor-desk-session.webp",
      "tutor-teaching-online.webp",
      "student-learning-home.webp",
      "student-math-confidence.webp",
      "online-tutoring.png",
      "learning-breakthrough.png",
      ...Array.from({ length: 5 }, (_, index) => `auth-portrait-${index + 1}.webp`),
    ];
    for (const file of files) expect(existsSync(`public/images/${file}`)).toBe(true);

    const presentation = [
      "src/components/marketing/Hero.tsx",
      "src/components/marketing/HomeStory.tsx",
      "src/components/marketing/HomeSections.tsx",
      "src/app/[locale]/parents/page.tsx",
      "src/app/[locale]/online-classroom/page.tsx",
      "src/components/marketing/LearningModes.tsx",
      "src/components/marketing/AuthEditorialPortrait.tsx",
      "src/components/marketing/authEditorialPortraits.ts",
      "src/app/[locale]/become-a-tutor/page.tsx",
      "src/app/[locale]/how-it-works/page.tsx",
      "src/app/[locale]/subjects/page.tsx",
      "src/app/[locale]/about/page.tsx",
    ].map((file) => readFileSync(file, "utf8")).join("\n");
    for (const file of files) expect(presentation).toContain(file);
  });

  it("keeps the homepage hero bright, editorial and connected to the real search", () => {
    const hero = readFileSync("src/components/marketing/Hero.tsx", "utf8");
    const search = readFileSync("src/components/marketing/TutorSearch.tsx", "utf8");

    // HOME-V2 — bright white backdrop with a soft blue glow, display face from the theme (no serif).
    expect(hero).toContain("bg-white bg-[radial-gradient(");
    expect(hero).not.toContain("font-serif");
    expect(hero).toContain('<TutorSearch presentation="panel"');
    expect(hero).toContain("home-tutoring-session-v2.webp");
    expect(hero).not.toContain("bg-navy pb-16");
    expect(search).toContain('presentation?: "default" | "hero" | "panel"');
    expect(search).toContain('router.push(`${resultsPath}?${params.toString()}`)');
    expect(en.hero.title).toBe("The right person changes everything.");
    expect(en.hero.titleEmphasis).toBe("The right person");
    expect(fr.hero.title).toBe("La bonne personne change tout.");
    expect(fr.hero.titleEmphasis).toBe("La bonne personne");
    expect(search).toContain('role="combobox"');
    expect(search).toContain('role="listbox"');
    expect(search).not.toContain("<datalist");
  });
});
