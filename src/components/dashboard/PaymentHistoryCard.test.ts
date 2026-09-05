import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "PaymentHistoryCard.tsx"), "utf8");
const sourceWithoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("PaymentHistoryCard.tsx", () => {
  it("never renders a raw Stripe identifier or tutor-payout field", () => {
    for (const forbidden of [
      "stripePaymentIntentId",
      "stripeChargeId",
      "stripeBalanceTransactionId",
      "stripeCustomerId",
      "disputeStatus",
      "tutorPayoutCents",
      "payerUserId",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("never uses receipt/invoice terminology in rendered UI — no tax/legal-invoice data exists in this schema", () => {
    expect(sourceWithoutComments.toLowerCase()).not.toContain("receipt");
    expect(sourceWithoutComments.toLowerCase()).not.toContain("invoice");
  });

  it("renders safely when booking is null: the session-context section and deep link are both conditional on payment.booking", () => {
    expect(source).toMatch(/payment\.booking \?/);
    expect(source).toMatch(/\{payment\.booking && /);
  });

  it("a refund history section only ever renders persisted Refund rows, never a recomputed entitlement", () => {
    expect(source).toContain("payment.refunds.map");
    expect(source).not.toMatch(/calculateCancellationRefund|describeCancellationConsequence/);
  });

  it("uses only responsive/existing design-system classes, no fixed pixel widths that would break on mobile", () => {
    expect(source).not.toMatch(/width:\s*\d+px/);
    expect(source).toContain("min-w-0");
    expect(source).toContain("flex-wrap");
  });

  it("the deep link to a booking's session goes through the i18n-aware Link", () => {
    expect(source).toContain('import { Link } from "@/i18n/navigation"');
    expect(source).toMatch(/<Link href=\{`\/session\/\$\{payment\.booking\.id\}`\}/);
  });
});
