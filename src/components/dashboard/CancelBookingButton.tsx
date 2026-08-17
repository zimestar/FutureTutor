"use client";

import { useActionState } from "react";
import { cancelBookingAction } from "@/lib/actions/bookings";

export function CancelBookingButton({
  bookingId,
  label,
  cancellingLabel,
  consequencePreview,
}: {
  bookingId: string;
  label: string;
  cancellingLabel: string;
  /** Phase H.8 (§W) — server-computed refund-consequence preview text,
   * e.g. "Full refund: $50.00" / "No refund under the cancellation
   * policy." Never computed client-side — this is purely informational;
   * the server calculation remains the sole source of truth. */
  consequencePreview?: string;
}) {
  const [state, formAction, pending] = useActionState(cancelBookingAction, undefined);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="bookingId" value={bookingId} />
      {consequencePreview && <p className="text-xs text-slate">{consequencePreview}</p>}
      <button
        type="submit"
        data-testid="cancel-booking"
        disabled={pending}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-semibold text-slate transition-colors hover:border-error hover:text-error disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? cancellingLabel : label}
      </button>
      {state?.error && <p className="mt-1 text-xs font-semibold text-error">{state.error}</p>}
    </form>
  );
}
