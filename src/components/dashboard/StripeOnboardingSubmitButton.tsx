"use client";

import { useFormStatus } from "react-dom";

export function StripeOnboardingSubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      data-testid="start-stripe-onboarding"
      disabled={pending}
      aria-disabled={pending}
      className="min-h-11 rounded-md bg-blue px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
