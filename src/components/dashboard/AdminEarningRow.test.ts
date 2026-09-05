import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "AdminEarningRow.tsx"), "utf8");

describe("AdminEarningRow.tsx", () => {
  it("item 35 — renders zero financial action buttons of any kind", () => {
    expect(source).not.toMatch(/<button/i);
    expect(source).not.toMatch(/<form/i);
    for (const forbidden of [
      "Make eligible", "Retry transfer", "Create transfer", "Send payout",
      "Refund", "Reverse transfer", "Release hold", "Override status", "Reconcile",
      "onClick", "action=",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    // "Converge" alone would false-positive on the legitimate
    // AdminEarningReasonKey value "awaitingConvergence" — check the
    // action-button phrasing specifically instead.
    expect(source).not.toMatch(/\bConverge\b/);
  });

  it("item 29/30/31/32/33/34 — never performs a financial mutation or invokes convergence/transfer/refund logic", () => {
    expect(source).not.toMatch(/\.(update|create|delete|updateMany|deleteMany)\(/);
    expect(source).not.toMatch(/convergeTutorEarningFromSession|processEligibleTransfers|createTransferForEarning|markEligibleEarnings/);
  });

  it("item 28 — never imports or calls the Stripe SDK", () => {
    expect(source.toLowerCase()).not.toMatch(/from ["']stripe["']|getstripeclient|stripe\.transfers/);
  });

  it("item 20 — never claims funds are already in the tutor's bank account", () => {
    expect(source.toLowerCase()).not.toMatch(/paid to your bank|already (been )?deposited|in (their|your) bank account/);
  });

  it("never renders a customer payment field, connected-account secret, or platform margin", () => {
    for (const forbidden of [
      "payerUserId", "stripeCustomerId", "stripePaymentIntentId", "stripeConnectAccountId",
      "grossSpreadCents", "platformFeeCentsSnapshot", "stripeFeeCents",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("item 22/23 — links to the booking and the tutor admin detail via the i18n-aware Link", () => {
    expect(source).toContain('import { Link } from "@/i18n/navigation"');
    expect(source).toContain("href={`/admin/bookings/${bookingId}`}");
    expect(source).toContain("href={`/admin/tutors/${tutorProfileId}`}");
  });

  it("uses only responsive/existing design-system classes, no fixed pixel widths", () => {
    expect(source).not.toMatch(/width:\s*\d+px/);
    expect(source).toContain("min-w-0");
    expect(source).toContain("flex-wrap");
  });
});
