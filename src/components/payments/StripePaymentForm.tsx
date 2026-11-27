"use client";

import { useRef, useState, type FormEvent } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { runStripePaymentConfirmation } from "./stripePaymentConfirmation";

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
  errorMessage,
}: {
  onAuthorized: (stripePaymentIntentId: string) => void;
  submitLabel: string;
  pendingLabel: string;
  errorMessage: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submissionInFlight = useRef(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements || submissionInFlight.current) return;
    submissionInFlight.current = true;
    setSubmitting(true);
    setError(null);

    const result = await runStripePaymentConfirmation(stripe, elements);
    if (result.outcome === "authorized") {
      onAuthorized(result.paymentIntentId);
      return;
    }
    setError(errorMessage);
    setSubmitting(false);
    submissionInFlight.current = false;
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
        className="h-12 w-full rounded-xl bg-blue text-[15px] font-bold text-white shadow-sm transition-colors hover:bg-blue/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}

/** DESIGN-SYSTEM2 — Payment Element styled with the FutureTutor tokens
 * (globals.css) so the card form reads as part of the product. */
const STRIPE_APPEARANCE = {
  theme: "stripe" as const,
  variables: {
    colorPrimary: "#2563eb",
    colorText: "#0d1b2a",
    colorTextSecondary: "#475569",
    colorDanger: "#ef4444",
    colorBackground: "#ffffff",
    fontFamily: "Inter, system-ui, sans-serif",
    borderRadius: "12px",
    spacingUnit: "4px",
  },
  rules: {
    ".Input": { borderColor: "#e2e8f0", boxShadow: "none", padding: "12px 14px" },
    ".Input:focus": { borderColor: "#2563eb", boxShadow: "0 0 0 3px rgba(37, 99, 235, 0.15)" },
    ".Label": { fontWeight: "600", color: "#0d1b2a" },
  },
};

export function StripePaymentForm({
  clientSecret,
  publishableKey,
  onAuthorized,
  submitLabel,
  pendingLabel,
  errorMessage,
}: {
  clientSecret: string;
  publishableKey: string;
  onAuthorized: (stripePaymentIntentId: string) => void;
  submitLabel: string;
  pendingLabel: string;
  errorMessage: string;
}) {
  return (
    <Elements stripe={getStripePromise(publishableKey)} options={{ clientSecret, appearance: STRIPE_APPEARANCE }}>
      <InnerForm onAuthorized={onAuthorized} submitLabel={submitLabel} pendingLabel={pendingLabel} errorMessage={errorMessage} />
    </Elements>
  );
}
