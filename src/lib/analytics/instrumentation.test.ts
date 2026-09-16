import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { trackingForHref } from "@/components/marketing/heroCtaTracking";

// DATA-1 — source-level regression coverage for the real call sites this
// mission touched: proves the free-text/PII fix in TutorSearch actually
// landed, that the four Tier-1 pages wire TrackPageView with the correct
// event, and that no analytics file reaches into financial code.

const root = join(__dirname, "..", "..");

describe("Header.tsx CTA tracking", () => {
  const source = readFileSync(join(root, "components", "marketing", "Header.tsx"), "utf8");

  it("uses the current event names, not the retired find_tutor_clicked", () => {
    expect(source).toContain("find_tutor_cta_clicked");
    expect(source).not.toContain('"find_tutor_clicked"');
  });

  it("never sends a free-text 'source' property (replaced by the closed cta_location enum)", () => {
    expect(source).not.toMatch(/trackEvent\([^)]*\{\s*source:/);
  });
});

describe("TutorSearch.tsx PII fix", () => {
  const source = readFileSync(join(root, "components", "marketing", "TutorSearch.tsx"), "utf8");

  it("never sends the free-text subject search query to analytics", () => {
    expect(source).not.toMatch(/trackEvent\("search_started",\s*\{\s*subject/);
  });
});

const trackPageViewSites = [
  { file: ["app", "[locale]", "find-tutors", "page.tsx"], event: "futuretutor_page_view" },
  { file: ["app", "[locale]", "tutoring", "[city]", "page.tsx"], event: "local_landing_viewed" },
  { file: ["app", "[locale]", "resources", "[slug]", "page.tsx"], event: "resource_article_viewed" },
  { file: ["app", "[locale]", "subjects", "[subject]", "page.tsx"], event: "subject_page_viewed" },
  // DATA-2 — the homepage, how-it-works, and become-a-tutor pages
  // previously had no page-view-shaped event at all. PageType already
  // declared "homepage"/"how_it_works"/"become_tutor" as certified enum
  // members (types.ts) with zero real call sites — this closes that gap
  // using the existing certified event/property shape, not a new one.
  { file: ["app", "[locale]", "page.tsx"], event: "futuretutor_page_view" },
  { file: ["app", "[locale]", "how-it-works", "page.tsx"], event: "futuretutor_page_view" },
  { file: ["app", "[locale]", "become-a-tutor", "page.tsx"], event: "futuretutor_page_view" },
];

describe("TrackPageView wiring on the seven real page-view-shaped page types", () => {
  it.each(trackPageViewSites)("$file emits $event", ({ file, event }) => {
    const source = readFileSync(join(root, ...file), "utf8");
    expect(source).toContain("TrackPageView");
    expect(source).toContain(`event="${event}"`);
  });

  it("each of these pages renders TrackPageView exactly once — no duplicate custom page-view emission", () => {
    for (const { file } of trackPageViewSites) {
      const source = readFileSync(join(root, ...file), "utf8");
      const occurrences = source.match(/<TrackPageView/g) ?? [];
      expect(occurrences.length, file.join("/")).toBe(1);
    }
  });
});

describe("DATA-2 — MarketingPageHero's href→event tracking map", () => {
  it("maps each certified CTA href to its correct certified event and properties", () => {
    expect(trackingForHref("/find-tutors")).toEqual({ event: "find_tutor_cta_clicked", properties: { cta_location: "hero" } });
    expect(trackingForHref("/become-a-tutor")).toEqual({ event: "become_tutor_cta_clicked", properties: { cta_location: "hero" } });
    expect(trackingForHref("/how-it-works")).toEqual({ event: "how_it_works_cta_clicked", properties: { cta_location: "hero" } });
    expect(trackingForHref("/signup")).toEqual({ event: "signup_started", properties: {} });
    expect(trackingForHref("/login")).toEqual({ event: "login_started", properties: {} });
  });

  it("returns null (untracked, plain Button) for any href outside the certified CTA set", () => {
    expect(trackingForHref("/tutor-resources")).toBeNull();
    expect(trackingForHref("/dashboard/family")).toBeNull();
    expect(trackingForHref("/tutoring/edmonton")).toBeNull();
  });

  it("MarketingPageHero.tsx renders TrackedCtaButton, not a plain Button, whenever tracking exists", () => {
    const source = readFileSync(join(root, "components", "marketing", "MarketingPageHero.tsx"), "utf8");
    expect(source).toContain("TrackedCtaButton");
    expect(source).toContain("primaryTracking");
    expect(source).toContain("secondaryTracking");
  });
});

describe("DATA-2 — homepage CTA instrumentation (previously zero tracked CTAs on the highest-traffic page)", () => {
  it("Hero.tsx fires find_tutor_cta_clicked (hero) and how_it_works_cta_clicked (hero)", () => {
    const source = readFileSync(join(root, "components", "marketing", "Hero.tsx"), "utf8");
    expect(source).toMatch(/event="find_tutor_cta_clicked"[\s\S]{0,80}cta_location:\s*"hero"/);
    expect(source).toMatch(/event="how_it_works_cta_clicked"[\s\S]{0,80}cta_location:\s*"hero"/);
  });

  it("HomeStory.tsx fires how_it_works_cta_clicked (content)", () => {
    const source = readFileSync(join(root, "components", "marketing", "HomeStory.tsx"), "utf8");
    expect(source).toMatch(/event="how_it_works_cta_clicked"[\s\S]{0,80}cta_location:\s*"content"/);
  });

  it("TutorCTA.tsx fires become_tutor_cta_clicked (content)", () => {
    const source = readFileSync(join(root, "components", "marketing", "TutorCTA.tsx"), "utf8");
    expect(source).toMatch(/event="become_tutor_cta_clicked"[\s\S]{0,80}cta_location:\s*"content"/);
  });

  it("FeaturedTutors.tsx fires find_tutor_cta_clicked (content)", () => {
    const source = readFileSync(join(root, "components", "marketing", "FeaturedTutors.tsx"), "utf8");
    expect(source).toMatch(/event="find_tutor_cta_clicked"[\s\S]{0,80}cta_location:\s*"content"/);
  });

  it("FinalCTA.tsx (shared by homepage + how-it-works) fires both find_tutor_cta_clicked and become_tutor_cta_clicked (content)", () => {
    const source = readFileSync(join(root, "components", "marketing", "FinalCTA.tsx"), "utf8");
    expect(source).toMatch(/event="find_tutor_cta_clicked"[\s\S]{0,80}cta_location:\s*"content"/);
    expect(source).toMatch(/event="become_tutor_cta_clicked"[\s\S]{0,80}cta_location:\s*"content"/);
  });
});

describe("DATA-2 — login_started and signup_started, previously zero real call sites", () => {
  it("Header.tsx fires login_started from both the desktop and mobile /login links", () => {
    const source = readFileSync(join(root, "components", "marketing", "Header.tsx"), "utf8");
    const occurrences = source.match(/trackEvent\("login_started",\s*\{\}\)/g) ?? [];
    expect(occurrences.length).toBe(2);
  });

  it("become-a-tutor's closing CTA fires signup_started with user_intent: become_tutor", () => {
    const source = readFileSync(join(root, "app", "[locale]", "become-a-tutor", "page.tsx"), "utf8");
    expect(source).toMatch(/event="signup_started"[\s\S]{0,80}user_intent:\s*"become_tutor"/);
  });
});

describe("SEO-4 — tutor-resources university-students section reuses the certified become_tutor_cta_clicked event, no new taxonomy", () => {
  const source = readFileSync(join(root, "app", "[locale]", "tutor-resources", "page.tsx"), "utf8");

  it("fires become_tutor_cta_clicked with cta_location: content", () => {
    expect(source).toMatch(/event="become_tutor_cta_clicked"[\s\S]{0,80}cta_location:\s*"content"/);
  });

  it("targets the real /become-a-tutor page, not an invented URL", () => {
    expect(source).toContain('href="/become-a-tutor"');
  });

  it("introduces no analytics event or property name outside the certified DATA-2 allowlist", () => {
    const CERTIFIED_EVENTS = [
      "futuretutor_page_view",
      "find_tutor_cta_clicked",
      "become_tutor_cta_clicked",
      "how_it_works_cta_clicked",
      "resource_article_viewed",
      "resource_primary_cta_clicked",
      "subject_page_viewed",
      "local_landing_viewed",
      "signup_started",
      "login_started",
      "search_started",
    ];
    const eventMatches = [...source.matchAll(/event="([a-z_]+)"/g)].map((m) => m[1]);
    for (const event of eventMatches) {
      expect(CERTIFIED_EVENTS, `unexpected event: ${event}`).toContain(event);
    }
  });
});

describe("financial reachability — zero across the entire analytics module", () => {
  // piiDenylist.ts is deliberately excluded: its entire purpose is naming
  // forbidden property-name strings like "stripeaccountid"/"paymentintent"
  // so they can be blocked — that's the denylist working as intended, not
  // a financial-code reference.
  const files = ["types.ts", "slugGuards.ts", "routePolicy.ts", "consent.ts", "environment.ts", "vendors.ts", "track.ts", "index.ts"];

  it.each(files)("%s never references Stripe/payment/pricing/financial symbols", (file) => {
    const source = readFileSync(join(__dirname, file), "utf8");
    expect(source).not.toMatch(/stripe|calculateCustomerPrice|TutorEarning|TutorTransfer|refund|payout/i);
  });

  it("piiDenylist.ts's only financial-adjacent strings are the denylisted property names themselves, not usage", () => {
    const source = readFileSync(join(__dirname, "piiDenylist.ts"), "utf8");
    expect(source).not.toMatch(/import.*stripe|calculateCustomerPrice|TutorEarning|TutorTransfer/i);
  });
});

describe("DATA-2 financial reachability — zero across every file this mission touched", () => {
  const dataTwoFiles = [
    ["app", "[locale]", "page.tsx"],
    ["app", "[locale]", "how-it-works", "page.tsx"],
    ["app", "[locale]", "become-a-tutor", "page.tsx"],
    ["components", "marketing", "Hero.tsx"],
    ["components", "marketing", "HomeStory.tsx"],
    ["components", "marketing", "TutorCTA.tsx"],
    ["components", "marketing", "FeaturedTutors.tsx"],
    ["components", "marketing", "FinalCTA.tsx"],
    ["components", "marketing", "Header.tsx"],
    ["components", "marketing", "MarketingPageHero.tsx"],
    ["components", "marketing", "TrackedCtaButton.tsx"],
    ["components", "marketing", "TrackedLink.tsx"],
  ];

  it.each(dataTwoFiles.map((segments) => ({ segments, label: segments.join("/") })))(
    "$label never references Stripe/payment/pricing/financial symbols",
    ({ segments }) => {
      const source = readFileSync(join(root, ...segments), "utf8");
      expect(source).not.toMatch(/stripe|calculateCustomerPrice|TutorEarning|TutorTransfer|refund|payout/i);
    },
  );
});
