import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

describe("item 1 — Messages nav entry", () => {
  it("appears in the student/parent nav (learning group)", () => {
    const source = readFileSync(join(__dirname, "dashboardNav.ts"), "utf8");
    expect(source).toMatch(/tNav\("messages"\), href: "\/messages"/);
  });

  it("appears in the approved-tutor nav (tutoring group)", () => {
    const source = readFileSync(join(__dirname, "tutorNav.ts"), "utf8");
    expect(source).toMatch(/tNav\("messages"\), href: "\/messages"/);
  });

  it("does NOT appear in the not-yet-approved tutor's onboarding nav — messaging requires an APPROVED tutor", () => {
    const source = readFileSync(join(__dirname, "tutorNav.ts"), "utf8");
    const approvalBranch = source.slice(source.indexOf("return [\n    { label: tNav(\"applicationOverview\")"));
    expect(approvalBranch).not.toContain('href: "/messages"');
  });
});

describe("item 37/38 — messaging translations", () => {
  for (const locale of ["en", "fr"] as const) {
    const messages = locale === "en" ? en : fr;

    it(`${locale} has every list/thread/composer key used by the UI`, () => {
      expect(messages.messaging.list.title).toBeTruthy();
      expect(messages.messaging.list.emptyTitle).toBeTruthy();
      expect(messages.messaging.list.emptyDescription).toBeTruthy();
      expect(messages.messaging.list.guardianTitle).toBeTruthy();
      expect(messages.messaging.list.noMessagesYet).toBeTruthy();
      expect(messages.messaging.thread.you).toBeTruthy();
      expect(messages.messaging.thread.readOnlyWindow).toBeTruthy();
      expect(messages.messaging.thread.upcomingSession).toBeTruthy();
      expect(messages.messaging.thread.recentSession).toBeTruthy();
      expect(messages.messaging.thread.loadEarlier).toBeTruthy();
      expect(messages.messaging.thread.newMessages).toBeTruthy();
      expect(messages.messaging.composer.send).toBeTruthy();
      expect(messages.messaging.composer.contactInfoWarning).toBeTruthy();
      expect(messages.messaging.composer.error.VALIDATION).toBeTruthy();
      expect(messages.messaging.composer.error.NOT_AUTHORIZED).toBeTruthy();
      expect(messages.messaging.composer.error.READ_ONLY).toBeTruthy();
      expect(messages.messaging.composer.error.UNAVAILABLE).toBeTruthy();
    });

    it(`${locale} nav has a messages label`, () => {
      expect(messages.dashboard.nav.messages).toBeTruthy();
    });

    it(`${locale} read-only window copy never implies account suspension`, () => {
      const copy = messages.messaging.thread.readOnlyWindow.toLowerCase();
      expect(copy).not.toMatch(/suspend|suspendu|banned|banni/);
    });
  }
});
