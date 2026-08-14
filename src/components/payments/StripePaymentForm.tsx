"use client";

import { useState, type FormEvent } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

// Module-level cache — loadStripe should only ever be called once per
// publishable key for the lifetime of the page.
let cachedStripePromise: Promise<Stripe | null> | null = null;
let cachedKey: string | null = null;
function getStripePromise(publishableKey: string) {
  if (cachedStripePromise && cachedKey === publishableKey) return cachedStripePromise;
  cachedKey = publishableKey;
  cachedStripePromise = loadStripe(publishableKey);
  return cachedStripePromise;
}

function InnerForm({
  onAuthorized,
  submitLabel,
  pendingLabel,
}: {
  onAuthorized: (stripePaymentIntentId: string) => void;
  submitLabel: string;
  pendingLabel: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (confirmError) {
      setSubmitting(false);
      setError(confirmError.message ?? "Payment failed — please try again.");
      return;
    }
    if (paymentIntent && (paymentIntent.status === "requires_capture" || paymentIntent.status === "succeeded")) {
      onAuthorized(paymentIntent.id);
      return;
    }
    setSubmitting(false);
    setError("Payment could not be authorized — please try again.");
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" data-testid="stripe-payment-form">
      <PaymentElement />
      {error && (
        <p role="alert" className="rounded-md bg-error-light px-3 py-2 text-sm font-semibold text-error">
          {error}
        </p>
      )}
      <button
        type="submit"
        data-testid="stripe-payment-submit"
        disabled={!stripe || submitting}
        className="h-12 w-full rounded-md bg-blue text-[15px] font-bold text-white transition-colors hover:bg-blue/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}

export function StripePaymentForm({
  clientSecret,
  publishableKey,
  onAuthorized,
  submitLabel,
  pendingLabel,
}: {
  clientSecret: string;
  publishableKey: string;
  onAuthorized: (stripePaymentIntentId: string) => void;
  submitLabel: string;
  pendingLabel: string;
}) {
  return (
    <Elements stripe={getStripePromise(publishableKey)} options={{ clientSecret }}>
      <InnerForm onAuthorized={onAuthorized} submitLabel={submitLabel} pendingLabel={pendingLabel} />
    </Elements>
  );
}
