"use client";

import { useActionState } from "react";
import { cancelBookingAction } from "@/lib/actions/bookings";

export function CancelBookingButton({
  bookingId,
  label,
  cancellingLabel,
}: {
  bookingId: string;
  label: string;
  cancellingLabel: string;
}) {
  const [state, formAction, pending] = useActionState(cancelBookingAction, undefined);

  return (
    <form action={formAction}>
      <input type="hidden" name="bookingId" value={bookingId} />
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
