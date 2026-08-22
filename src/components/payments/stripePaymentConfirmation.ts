/** Minimal shape this function needs from `elements`/`stripe` — matches
 * `StripeElements`/`Stripe` closely enough for real usage while staying
 * trivially mockable in a plain (non-DOM) unit test. */
export interface StripeConfirmationElements {
  submit(): Promise<{ error?: { message?: string } }>;
}
export interface StripeConfirmationClient {
  confirmPayment(args: {
    elements: StripeConfirmationElements;
    redirect: "if_required";
  }): Promise<{ error?: { message?: string }; paymentIntent?: { id: string; status: string } }>;
}
export type StripeConfirmationOutcome =
  | { outcome: "authorized"; paymentIntentId: string }
  | { outcome: "error" };

/**
 * The exact, order-dependent Stripe Payment Element confirmation sequence,
 * isolated from React so it's unit-testable without a DOM/jsdom dependency.
 * `elements.submit()` MUST run — and must be awaited — before
 * `stripe.confirmPayment()`; per @stripe/stripe-js's own documentation
 * ("Before confirming payment, call elements.submit() to validate the state
 * of the Payment Element and collect any data required for wallets"),
 * skipping it means confirmPayment never actually reaches Stripe at all —
 * this was the root cause of a P1 where clicking "Confirm Booking" appeared
 * to do nothing (no booking, no error, no Stripe confirmation attempt
 * recorded). Any exception here (e.g. confirmPayment rejecting instead of
 * resolving with an `error` field) must never propagate silently — the
 * caller always gets a definite outcome instead of an unhandled rejection.
 */
export async function runStripePaymentConfirmation(
  stripe: StripeConfirmationClient,
  elements: StripeConfirmationElements
): Promise<StripeConfirmationOutcome> {
  try {
    const { error: submitError } = await elements.submit();
    if (submitError) return { outcome: "error" };

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (confirmError) return { outcome: "error" };
    if (paymentIntent && (paymentIntent.status === "requires_capture" || paymentIntent.status === "succeeded")) {
      return { outcome: "authorized", paymentIntentId: paymentIntent.id };
    }
    return { outcome: "error" };
  } catch {
    return { outcome: "error" };
  }
}
