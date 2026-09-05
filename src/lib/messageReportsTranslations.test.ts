import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

const REASONS = ["INAPPROPRIATE_CONTENT", "HARASSMENT", "OFF_PLATFORM_REQUEST", "SAFETY_CONCERN", "SPAM", "OTHER"] as const;
const STATUSES = ["OPEN", "UNDER_REVIEW", "RESOLVED"] as const;

describe("item 51/52 — messaging.report and admin.messageReports translations", () => {
  for (const locale of ["en", "fr"] as const) {
    const messages = locale === "en" ? en : fr;

    it(`${locale} has every report-dialog key and reason label`, () => {
      expect(messages.messaging.report.action).toBeTruthy();
      expect(messages.messaging.report.title).toBeTruthy();
      expect(messages.messaging.report.submit).toBeTruthy();
      expect(messages.messaging.report.success).toBeTruthy();
      expect(messages.messaging.report.alreadyReported).toBeTruthy();
      expect(messages.messaging.report.error).toBeTruthy();
      for (const reason of REASONS) {
        expect((messages.messaging.report.reasons as Record<string, string>)[reason], `missing ${locale} report.reasons.${reason}`).toBeTruthy();
      }
    });

    it(`${locale} has every admin.messageReports key`, () => {
      expect(messages.admin.messageReports.title).toBeTruthy();
      expect(messages.admin.messageReports.empty).toBeTruthy();
      for (const status of STATUSES) {
        expect((messages.admin.messageReports.status as Record<string, string>)[status], `missing ${locale} status.${status}`).toBeTruthy();
      }
      for (const reason of REASONS) {
        expect((messages.admin.messageReports.reason as Record<string, string>)[reason], `missing ${locale} messageReports.reason.${reason}`).toBeTruthy();
      }
      expect(messages.admin.messageReports.actions.markUnderReview).toBeTruthy();
      expect(messages.admin.messageReports.actions.markResolved).toBeTruthy();
    });

    it(`${locale} has the nav label`, () => {
      expect(messages.dashboard.nav.messageReports).toBeTruthy();
    });
  }
});

describe("item 33 — the message-reports nav entry uses a dedicated, not-auto-granted permission", () => {
  it("adminNav.ts gates /admin/message-reports on ADMIN_MESSAGE_REPORTS_READ, not an existing/reused permission", () => {
    const source = readFileSync(join(__dirname, "adminNav.ts"), "utf8");
    expect(source).toMatch(/href: "\/admin\/message-reports", group: "operationsGroup", permission: "ADMIN_MESSAGE_REPORTS_READ"/);
  });
});
