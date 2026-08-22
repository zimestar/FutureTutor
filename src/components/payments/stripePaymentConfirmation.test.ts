import { describe, it, expect, vi } from "vitest";
import { runStripePaymentConfirmation, type StripeConfirmationClient, type StripeConfirmationElements } from "./stripePaymentConfirmation";

describe("runStripePaymentConfirmation", () => {
  it("calls elements.submit() before stripe.confirmPayment()", async () => {
    const callOrder: string[] = [];
    const elements: StripeConfirmationElements = {
      submit: vi.fn(async () => {
        callOrder.push("elements.submit");
        return {};
      }),
    };
    const stripe: StripeConfirmationClient = {
      confirmPayment: vi.fn(async () => {
        callOrder.push("stripe.confirmPayment");
        return { paymentIntent: { id: "pi_123", status: "succeeded" } };
      }),
    };

    const result = await runStripePaymentConfirmation(stripe, elements);

    expect(callOrder).toEqual(["elements.submit", "stripe.confirmPayment"]);
    expect(result).toEqual({ outcome: "authorized", paymentIntentId: "pi_123" });
  });

  it("does not call confirmPayment when elements.submit() returns an error", async () => {
    const elements: StripeConfirmationElements = {
      submit: vi.fn(async () => ({ error: { message: "incomplete card details" } })),
    };
    const confirmPayment = vi.fn();
    const stripe: StripeConfirmationClient = { confirmPayment };

    const result = await runStripePaymentConfirmation(stripe, elements);

    expect(confirmPayment).not.toHaveBeenCalled();
    expect(result).toEqual({ outcome: "error" });
  });

  it("surfaces a definite error outcome when confirmPayment resolves with an error", async () => {
    const elements: StripeConfirmationElements = { submit: vi.fn(async () => ({})) };
    const stripe: StripeConfirmationClient = {
      confirmPayment: vi.fn(async () => ({ error: { message: "card_declined" } })),
    };

    const result = await runStripePaymentConfirmation(stripe, elements);

    expect(result).toEqual({ outcome: "error" });
  });

  it("never lets a rejected confirmPayment promise propagate silently", async () => {
    const elements: StripeConfirmationElements = { submit: vi.fn(async () => ({})) };
    const stripe: StripeConfirmationClient = {
      // Simulates the exact real-world failure mode this fix targets: an
      // integration error (e.g. elements.submit() was skipped) makes
      // confirmPayment reject instead of resolving with `{ error }`.
      confirmPayment: vi.fn(async () => {
        throw new Error("IntegrationError: elements.submit() must be called before confirmPayment()");
      }),
    };

    const result = await runStripePaymentConfirmation(stripe, elements);

    expect(result).toEqual({ outcome: "error" });
  });

  it("never lets a rejected elements.submit() promise propagate silently", async () => {
    const elements: StripeConfirmationElements = {
      submit: vi.fn(async () => {
        throw new Error("network error");
      }),
    };
    const confirmPayment = vi.fn();
    const stripe: StripeConfirmationClient = { confirmPayment };

    const result = await runStripePaymentConfirmation(stripe, elements);

    expect(confirmPayment).not.toHaveBeenCalled();
    expect(result).toEqual({ outcome: "error" });
  });

  it("treats a paymentIntent left in a non-terminal status as an error, not a silent no-op", async () => {
    const elements: StripeConfirmationElements = { submit: vi.fn(async () => ({})) };
    const stripe: StripeConfirmationClient = {
      confirmPayment: vi.fn(async () => ({ paymentIntent: { id: "pi_123", status: "requires_action" } })),
    };

    const result = await runStripePaymentConfirmation(stripe, elements);

    expect(result).toEqual({ outcome: "error" });
  });

  it("accepts requires_capture (manual-capture PaymentIntents, this app's mode) as authorized", async () => {
    const elements: StripeConfirmationElements = { submit: vi.fn(async () => ({})) };
    const stripe: StripeConfirmationClient = {
      confirmPayment: vi.fn(async () => ({ paymentIntent: { id: "pi_456", status: "requires_capture" } })),
    };

    const result = await runStripePaymentConfirmation(stripe, elements);

    expect(result).toEqual({ outcome: "authorized", paymentIntentId: "pi_456" });
  });
});
