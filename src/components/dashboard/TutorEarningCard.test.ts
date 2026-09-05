import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "TutorEarningCard.tsx"), "utf8");

describe("TutorEarningCard.tsx", () => {
  it("item 17 — never claims funds are already in the tutor's bank account", () => {
    expect(source.toLowerCase()).not.toContain("paid to your bank");
    expect(source.toLowerCase()).not.toContain("in your bank account");
  });

  it("item 22/23 — never renders a customer payment field or a platform-margin field", () => {
    for (const forbidden of [
      "payerUserId",
      "stripeCustomerId",
      "stripePaymentIntentId",
      "platformFeeCentsSnapshot",
      "grossSpreadCents",
      "stripeFeeCents",
      "stripeConnectAccountId",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("item 24 — never imports or calls the Stripe SDK", () => {
    expect(source.toLowerCase()).not.toMatch(/from ["']stripe["']|getstripeclient|stripe\.transfers/);
  });

  it("item 25 — never performs a financial mutation", () => {
    expect(source).not.toMatch(/\.(update|create|delete|updateMany|deleteMany)\(/);
  });

  it("item 18 — links to the session only when a booking id is present, and stays safe otherwise", () => {
    expect(source).toMatch(/\{bookingId && /);
    expect(source).toContain('href={`/session/${bookingId}`}');
  });

  it("item 21 — uses only responsive/existing design-system classes, no fixed pixel widths", () => {
    expect(source).not.toMatch(/width:\s*\d+px/);
    expect(source).toContain("min-w-0");
    expect(source).toContain("sm:flex-row");
  });

  it("eligibility and transfer dates are only rendered when present, never a fabricated placeholder", () => {
    expect(source).toMatch(/\{eligibilityDateLabel && /);
    expect(source).toMatch(/\{transferDateLabel && /);
  });
});
