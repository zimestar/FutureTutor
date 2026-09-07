import { describe, expect, it } from "vitest";
import robots from "./robots";
import { site } from "@/content/site";

// ANALYTICS-SEO1 — regression coverage for two fixes this mission made:
// (1) the robots.txt Sitemap: directive was pointing at a non-existent
// "www.futuretutor.ca" host; (2) robots.txt previously had zero Disallow
// rules despite the app's extensive authenticated/private surface. Note
// throughout: robots.txt is crawler GUIDANCE, never a security boundary —
// these tests confirm the guidance is now correct, not that private routes
// are "protected" by it (they're protected by real server-side auth
// checks, unchanged and untouched by this mission).

describe("robots()", () => {
  const result = robots();

  it("the Sitemap: directive uses the real, DNS-resolving production hostname (regression for the www.futuretutor.ca defect)", () => {
    expect(result.sitemap).toBe(`${site.url}/sitemap.xml`);
    expect(result.sitemap).not.toContain("www.futuretutor.ca");
  });

  it("still allows crawling of public content generally", () => {
    const rule = Array.isArray(result.rules) ? result.rules[0]! : result.rules;
    expect(rule.userAgent).toBe("*");
    expect(rule.allow).toBe("/");
  });

  it("explicitly disallows every known private/authenticated route class named in this mission (dashboard, admin, messages, session, api)", () => {
    const rule = Array.isArray(result.rules) ? result.rules[0]! : result.rules;
    const disallow = rule.disallow as string | string[];
    const list = Array.isArray(disallow) ? disallow : [disallow];
    for (const expected of ["/api/", "/*/dashboard", "/*/tutor/", "/*/admin", "/*/messages", "/*/session/", "/*/notifications", "/*/family"]) {
      expect(list).toContain(expected);
    }
  });

  it("does NOT disallow the public plural /tutors/[slug] directory or tutor-adjacent marketing pages — only the singular authenticated /tutor/ prefix", () => {
    const rule = Array.isArray(result.rules) ? result.rules[0]! : result.rules;
    const disallow = rule.disallow as string | string[];
    const list = Array.isArray(disallow) ? disallow : [disallow];
    expect(list).not.toContain("/*/tutors");
    expect(list.some((p) => p.includes("tutor-resources") || p.includes("tutor-agreement") || p.includes("become-a-tutor"))).toBe(false);
  });
});
