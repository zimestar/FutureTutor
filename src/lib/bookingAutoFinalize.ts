/**
 * The exact guard deciding whether a Direct Booking's single-confirmation
 * flow should auto-submit the booking-finalization form right now, isolated
 * from React so the "exactly once, never duplicated" guarantee is
 * unit-testable without a DOM/jsdom dependency. Extracted for the same
 * reason as stripePaymentConfirmation.ts: the actual defect class here
 * (a silent extra step / a possible double-submit) is exactly the kind of
 * thing a plain function with plain assertions catches far more reliably
 * than reading the effect body.
 *
 * `alreadyFinalizedForKey` is keyed by the booking selection (quoteKey),
 * not a bare boolean — a genuinely new selection (a different quoteKey)
 * must be able to auto-finalize again once IT authorizes, while a stray
 * re-invocation for the SAME already-finalized selection (e.g. a React
 * effect re-run) must never trigger a second submission.
 */
export function shouldAutoFinalizeBooking(params: {
  useStripe: boolean;
  authorizedPiId: string | null;
  quoteKey: string | null;
  alreadyFinalizedForKey: string | null;
}): boolean {
  const { useStripe, authorizedPiId, quoteKey, alreadyFinalizedForKey } = params;
  if (!useStripe) return false; // non-Stripe path has no separate authorization stage to auto-advance from
  if (!authorizedPiId || !quoteKey) return false;
  return alreadyFinalizedForKey !== quoteKey;
}
