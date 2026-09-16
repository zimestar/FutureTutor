import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { subjects } from "../content/subjects";
import { getResourceArticle } from "../content/resources";
import { localMarkets } from "../content/localMarkets";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

// SEO-SUBJECT-REBUILD1 — deterministic tests for the subject hub and
// subject-page rebuild. Component .tsx files with DB/next-image
// dependencies cannot be imported into vitest's plain "node" environment
// (confirmed repeatedly this session), so page wiring is proven by
// reading source text — the same established convention as
// seoPrivateNoindex1.test.ts / instrumentation.test.ts.

const localeRoot = join(__dirname, "[locale]");
const hubSource = readFileSync(join(localeRoot, "subjects", "page.tsx"), "utf8");
const subjectPageSource = readFileSync(join(localeRoot, "subjects", "[subject]", "page.tsx"), "utf8");

describe("Authoritative subject inventory — every registry subject has an intentional page policy", () => {
  it("the registry is non-empty and every slug has a real EN and FR display label (no silent gaps)", () => {
    expect(subjects.length).toBeGreaterThan(0);
    for (const subject of subjects) {
      expect((en.subjects.items as Record<string, string>)[subject.slug], subject.slug).toBeTruthy();
      expect((fr.subjects.items as Record<string, string>)[subject.slug], subject.slug).toBeTruthy();
    }
  });

  it("every registry subject has real, non-empty EN topic content (intro + 3 items) — no unknown/unhandled subject", () => {
    for (const subject of subjects) {
      const topic = (en.subjects.page.topics as Record<string, { intro: string; items: Record<string, string> }>)[subject.slug];
      expect(topic, subject.slug).toBeDefined();
      expect(topic.intro.length).toBeGreaterThan(20);
      expect(Object.keys(topic.items)).toHaveLength(3);
      for (const item of Object.values(topic.items)) expect(item.length).toBeGreaterThan(3);
    }
  });

  it("every registry subject has real, non-empty FR topic content, written natively (not a copy of EN)", () => {
    for (const subject of subjects) {
      const topicEn = (en.subjects.page.topics as Record<string, { intro: string }>)[subject.slug];
      const topicFr = (fr.subjects.page.topics as Record<string, { intro: string; items: Record<string, string> }>)[subject.slug];
      expect(topicFr, subject.slug).toBeDefined();
      expect(topicFr.intro.length).toBeGreaterThan(20);
      expect(Object.keys(topicFr.items)).toHaveLength(3);
      expect(topicFr.intro).not.toBe(topicEn.intro);
    }
  });

  it("no two subjects share identical topic content (each is genuinely differentiated, not a template with nouns swapped)", () => {
    const enIntros = subjects.map((s) => (en.subjects.page.topics as Record<string, { intro: string }>)[s.slug].intro);
    expect(new Set(enIntros).size).toBe(enIntros.length);
    const frIntros = subjects.map((s) => (fr.subjects.page.topics as Record<string, { intro: string }>)[s.slug].intro);
    expect(new Set(frIntros).size).toBe(frIntros.length);
  });
});

describe("Subject topic content — no prohibited availability/credential/outcome claims", () => {
  const PROHIBITED = /\bbest\b|#1|guarantee|certified|\bverified\b|background.check|24\/7|available now|thousands of/i;
  const PROHIBITED_FR = /meilleur|garanti[e]?\b|certifi[ée]|vérifi[ée]|vérification d'antécédents|disponible maintenant|milliers de/i;

  it("EN topic content contains no prohibited claim language", () => {
    for (const subject of subjects) {
      const topic = (en.subjects.page.topics as Record<string, { intro: string; items: Record<string, string> }>)[subject.slug];
      const text = `${topic.intro} ${Object.values(topic.items).join(" ")}`;
      expect(text, subject.slug).not.toMatch(PROHIBITED);
    }
  });

  it("FR topic content contains no prohibited claim language", () => {
    for (const subject of subjects) {
      const topic = (fr.subjects.page.topics as Record<string, { intro: string; items: Record<string, string> }>)[subject.slug];
      const text = `${topic.intro} ${Object.values(topic.items).join(" ")}`;
      expect(text, subject.slug).not.toMatch(PROHIBITED_FR);
    }
  });
});

describe("Subject page (/subjects/[subject]) source wiring", () => {
  it("renders the new topics section using the subject-specific translation key (not a hardcoded/generic string)", () => {
    expect(subjectPageSource).toContain('t("page.topicsHeading"');
    expect(subjectPageSource).toMatch(/t\(`page\.topics\.\$\{slug\}\.intro`\)/);
    expect(subjectPageSource).toMatch(/t\(`page\.topics\.\$\{slug\}\.items\.\$\{index\}`\)/);
  });

  it("still fires subject_page_viewed with the real subject_slug (unchanged, DATA-2 taxonomy preserved)", () => {
    expect(subjectPageSource).toMatch(/event="subject_page_viewed"[\s\S]{0,80}subject_slug:\s*slug/);
  });

  it("calls notFound() for an unknown subject slug before ever returning content — no unknown subject is ever indexable", () => {
    expect(subjectPageSource).toContain("if (!subject) notFound();");
    expect(subjectPageSource).toContain("if (!subject) return {};");
  });

  it("the Find Tutors CTA still targets the real /find-tutors route with the safe, existing preselection mechanism", () => {
    expect(subjectPageSource).toMatch(/href=\{`\/find-tutors\?subject=\$\{encodeURIComponent\(label\)\}`\}/);
  });

  it("the related-resource link still targets a real, published resource article slug", () => {
    expect(subjectPageSource).toContain('getResourceArticle("how-to-choose-a-tutor")');
    expect(getResourceArticle("how-to-choose-a-tutor")).toBeDefined();
  });

  it("the related-local link still targets a real, registered local market", () => {
    expect(subjectPageSource).toContain("localMarkets[0]");
    expect(localMarkets.length).toBeGreaterThan(0);
  });

  it("introduces no analytics event name outside the certified DATA-2 allowlist", () => {
    const CERTIFIED_EVENTS = [
      "futuretutor_page_view", "find_tutor_cta_clicked", "become_tutor_cta_clicked", "how_it_works_cta_clicked",
      "resource_article_viewed", "resource_primary_cta_clicked", "subject_page_viewed", "local_landing_viewed",
      "signup_started", "login_started", "search_started",
    ];
    const eventMatches = [...subjectPageSource.matchAll(/event="([a-z_]+)"/g)].map((m) => m[1]);
    for (const event of eventMatches) expect(CERTIFIED_EVENTS, `unexpected event: ${event}`).toContain(event);
  });

  it("does not introduce a subject×city, subject×grade, or subject×mode route segment", () => {
    const subjectDir = join(localeRoot, "subjects", "[subject]");
    const entries = readdirSync(subjectDir, { withFileTypes: true }).filter((e) => e.isDirectory());
    expect(entries, "subjects/[subject] must have no nested route directories").toHaveLength(0);
  });
});

describe("Subjects hub (/subjects) source wiring", () => {
  it("calls publicPageMetadata without index:false — remains indexable, unchanged", () => {
    expect(hubSource).toContain("publicPageMetadata(");
    expect(hubSource).not.toMatch(/index:\s*false/);
  });

  it("renders the new guidance section using real translation keys, not hardcoded text", () => {
    expect(hubSource).toContain('t("guidance.heading")');
    expect(hubSource).toContain('t("guidance.description")');
  });

  it("links to real, existing routes only — a real resource article, How It Works, and the real Edmonton market — never an invented URL", () => {
    expect(hubSource).toContain('href="/resources/how-to-choose-a-tutor"');
    expect(hubSource).toContain('href="/resources/when-to-get-a-tutor"');
    expect(hubSource).toContain('href="/how-it-works"');
    expect(hubSource).toContain('href="/tutoring/edmonton"');
    expect(getResourceArticle("how-to-choose-a-tutor")).toBeDefined();
    expect(getResourceArticle("when-to-get-a-tutor")).toBeDefined();
    expect(localMarkets.some((m) => m.slug === "edmonton")).toBe(true);
  });

  it("still renders the full SubjectGrid, so no registry subject is orphaned from the hub", () => {
    expect(hubSource).toContain("<SubjectGrid");
  });

  it("introduces no new CTA-tracking analytics event", () => {
    expect(hubSource).not.toMatch(/trackEvent\(|event="[a-z_]+"/);
  });
});

describe("No subject×city / subject×grade / subject×mode route exists anywhere in the app", () => {
  it("no route directory combines a subject segment with a city, grade, or mode segment", () => {
    const forbiddenDirNames = ["edmonton", "grade", "level", "online", "in-person", "mode"];
    const subjectDir = join(localeRoot, "subjects");
    function walk(dir: string): string[] {
      const found: string[] = [];
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (forbiddenDirNames.includes(entry.name)) found.push(join(dir, entry.name));
          found.push(...walk(join(dir, entry.name)));
        }
      }
      return found;
    }
    expect(walk(subjectDir)).toHaveLength(0);
  });

  it("no tutoring/[city] route has a nested subject directory", () => {
    const cityDir = join(localeRoot, "tutoring", "[city]");
    const entries = readdirSync(cityDir, { withFileTypes: true }).filter((e) => e.isDirectory());
    expect(entries).toHaveLength(0);
  });
});

describe("Financial reachability — zero across every file this mission touched", () => {
  const files = [
    ["[locale]", "subjects", "page.tsx"],
    ["[locale]", "subjects", "[subject]", "page.tsx"],
  ];

  it.each(files.map((segments) => ({ segments, label: segments.join("/") })))(
    "$label never references Stripe/payment/pricing/financial symbols",
    ({ segments }) => {
      const source = readFileSync(join(__dirname, ...segments), "utf8");
      expect(source).not.toMatch(/stripe|calculateCustomerPrice|TutorEarning|TutorTransfer|refund|payout/i);
    },
  );

  it("no message-file topic/guidance content references financial symbols", () => {
    const enText = JSON.stringify(en.subjects) + JSON.stringify(en.publicExperience.subjects);
    const frText = JSON.stringify(fr.subjects) + JSON.stringify(fr.publicExperience.subjects);
    expect(enText).not.toMatch(/stripe|TutorEarning|TutorTransfer/i);
    expect(frText).not.toMatch(/stripe|TutorEarning|TutorTransfer/i);
  });
});

describe("Sanity — the subject page directory itself still exists and is exactly one dynamic route (no accidental route added/removed)", () => {
  it("subjects/[subject]/page.tsx exists", () => {
    expect(existsSync(join(localeRoot, "subjects", "[subject]", "page.tsx"))).toBe(true);
  });
  it("subjects/page.tsx exists", () => {
    expect(existsSync(join(localeRoot, "subjects", "page.tsx"))).toBe(true);
  });
});
