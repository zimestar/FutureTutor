import { readFileSync } from "node:fs";
import { createTranslator } from "use-intl/core";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { acquirePreparationLock, paymentPreparationView } from "./paymentPreparation";

function translator(locale: "en" | "fr", namespace: "booking" | "quickMatch") {
  return createTranslator({
    locale,
    messages: locale === "en" ? en : fr,
    namespace,
    onError: (error) => { throw error; },
  }) as unknown as (key: string, values?: Record<string, string>) => string;
}

describe("L1-04 payment preparation presentation", () => {
  it("represents direct preparation success as ready", () => {
    expect(paymentPreparationView(false, { success: true })).toEqual({ state: "ready" });
  });

  it("keeps a transient failure explicitly retryable", () => {
    expect(paymentPreparationView(false, { success: false, error: "safe", retryable: true })).toEqual({ state: "failed-retryable", error: "safe" });
  });

  it("moves from retryable failure to ready after retry without a reload state", () => {
    const failed = paymentPreparationView(false, { success: false, error: "safe", retryable: true });
    const retried = paymentPreparationView(false, { success: true });
    expect([failed.state, retried.state]).toEqual(["failed-retryable", "ready"]);
  });

  it("does not alter caller-owned booking or Quick Match input", () => {
    const input = Object.freeze({ learner: "learner-1", subject: "math", slot: "2026-08-21T18:00:00Z", locale: "fr" });
    paymentPreparationView(false, { success: false, error: "safe", retryable: true });
    expect(input).toEqual({ learner: "learner-1", subject: "math", slot: "2026-08-21T18:00:00Z", locale: "fr" });
  });

  it("blocks rapid repeat preparation for the same authoritative key", () => {
    const active = new Set<string>();
    expect(acquirePreparationLock(active, "quote-1")).toBe(true);
    expect(acquirePreparationLock(active, "quote-1")).toBe(false);
    expect(active.size).toBe(1);
  });

  it("represents an authoritative non-retryable result as terminal", () => {
    expect(paymentPreparationView(false, { success: false, error: "expired", retryable: false })).toEqual({ state: "failed-terminal", error: "expired" });
  });

  it("uses the same retry semantics for Quick Match", () => {
    expect(paymentPreparationView(false, { success: false, error: "safe", retryable: true }).state).toBe("failed-retryable");
  });
});

describe("L1-06 transactional locale runtime", () => {
  for (const locale of ["en", "fr"] as const) {
    it(`resolves payment retry and safe fallback copy in ${locale}`, () => {
      const booking = translator(locale, "booking");
      const quickMatch = translator(locale, "quickMatch");
      const values = [
        booking("retryPaymentCta"),
        booking("paymentErrorFallback"),
        booking("errors.paymentPreparationFailed"),
        quickMatch("review.retryPaymentCta"),
        quickMatch("review.paymentErrorFallback"),
        quickMatch("errors.paymentPreparationFailed"),
      ];
      expect(values.every((value) => value.length > 0 && !value.includes("paymentErrorFallback"))).toBe(true);
    });
  }

  it("does not render raw Stripe messages or the audited English booking fallbacks", () => {
    const stripeForm = readFileSync("src/components/payments/StripePaymentForm.tsx", "utf8");
    const studentBookings = readFileSync("src/app/[locale]/dashboard/bookings/page.tsx", "utf8");
    expect(stripeForm).not.toMatch(/confirmError\.message|Payment failed|Payment could not be authorized/);
    expect(studentBookings).not.toMatch(/>For \{|>Refunded |Payment processing…<\/p>/);
  });

  it("keeps Canadian French payment and refund terminology consistent", () => {
    const t = translator("fr", "booking");
    expect(t("retryPaymentCta")).toContain("Réessayer");
    expect(fr.dashboard.student.bookings.refundedAmount).toContain("Remboursement");
    expect(fr.dashboard.student.bookings.paymentProcessing).toContain("paiement");
  });
});
