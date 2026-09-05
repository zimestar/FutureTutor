import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

const REASON_KEYS = [
  "pendingSessionOutcome",
  "waiting24h",
  "awaitingConvergence",
  "eligible",
  "heldTutorNoShow",
  "heldNoShowUnresolved",
  "heldInterrupted",
  "heldUnknown",
  "transferPending",
  "transferred",
  "transferFailed",
  "cancelled",
] as const;

describe("admin.financialOps translations", () => {
  for (const locale of ["en", "fr"] as const) {
    const messages = locale === "en" ? en : fr;

    it(`${locale} has a label and description for every operational reason`, () => {
      for (const key of REASON_KEYS) {
        const entry = (messages.admin.financialOps.reason as Record<string, { label?: string; description?: string }>)[key];
        expect(entry, `missing ${locale} admin.financialOps.reason.${key}`).toBeTruthy();
        expect(entry!.label).toBeTruthy();
        expect(entry!.description).toBeTruthy();
      }
    });

    it(`${locale} has every summary tile label`, () => {
      for (const key of ["totalCount", "totalAmount", "pendingSessionOutcome", "waiting24h", "awaitingConvergence", "eligible", "held", "transferPending", "transferred", "transferFailed"]) {
        expect((messages.admin.financialOps.summary as Record<string, string>)[key], `missing ${locale} summary.${key}`).toBeTruthy();
      }
    });

    it(`${locale} has all filter labels`, () => {
      for (const key of ["search", "searchPlaceholder", "earningStatus", "transferStatus", "reason", "from", "to", "all", "none", "apply"]) {
        expect((messages.admin.financialOps.filters as Record<string, string>)[key], `missing ${locale} filters.${key}`).toBeTruthy();
      }
    });

    it(`${locale} distinguishes bank deposit status from a completed transfer`, () => {
      expect(messages.admin.financialOps.bankPayoutNote.toLowerCase()).toContain("stripe");
      expect(messages.admin.financialOps.reason.transferred.description.toLowerCase()).not.toMatch(/already (been )?deposited|paid to your bank/);
    });

    it(`${locale} has the nav label`, () => {
      expect(messages.dashboard.nav.financialOps).toBeTruthy();
    });
  }
});
