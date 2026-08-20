import { readFileSync } from "node:fs";
import { createTranslator } from "use-intl/core";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { quickMatchCustomerView } from "./quickMatchCustomerFlow";

describe("Quick Match customer flow", () => {
  it("shows the form with no prior request", () => expect(quickMatchCustomerView(null, null, false)).toBe("form"));
  it("shows the current price review", () => expect(quickMatchCustomerView("PRICED", "PRICED", false)).toBe("price-review"));
  it.each(["DRAFT", "CONFIRMED", "MATCHING", "PAYMENT_PENDING"] as const)(
    "keeps active %s state authoritative",
    (status) => expect(quickMatchCustomerView(status, "BOOKED", true)).toBe("active-status")
  );
  it("shows booked success before starting another request", () => expect(quickMatchCustomerView(null, "BOOKED", false)).toBe("terminal-status"));
  it("allows a new request after booked success", () => expect(quickMatchCustomerView(null, "BOOKED", true)).toBe("form"));
  it("allows a new request after payment failure", () => expect(quickMatchCustomerView(null, "PAYMENT_FAILED", true)).toBe("form"));
  it.each(["CANCELLED", "EXPIRED", "NO_TUTOR_FOUND", "FAILED"] as const)(
    "does not let terminal %s block the form",
    (status) => expect(quickMatchCustomerView(null, status, false)).toBe("form")
  );
  it("does not introduce historical request or booking deletion", () => {
    const route = readFileSync("src/app/[locale]/dashboard/quick-match/page.tsx", "utf8");
    const creation = readFileSync("src/services/tutoringRequestCreation.ts", "utf8");
    expect(`${route}\n${creation}`).not.toMatch(/\.delete(?:Many)?\s*\(/);
  });
  it.each([["en", en], ["fr", fr]] as const)("resolves the new-request CTA in %s", (locale, messages) => {
    const t = createTranslator({ locale, messages, namespace: "quickMatch", onError: (error) => { throw error; } });
    expect(t("startNewCta")).not.toContain("startNewCta");
  });
});
