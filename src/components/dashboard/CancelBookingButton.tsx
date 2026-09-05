"use client";

import { useActionState, useRef, useState } from "react";
import { cancelBookingAction } from "@/lib/actions/bookings";
import { ConfirmationDialog } from "@/components/ui/Dialog";

/**
 * CANCELLATION-CONFIRM1 — clicking "Cancel" no longer submits
 * cancelBookingAction directly. It opens a confirmation dialog first;
 * only the dialog's own explicit "Confirm cancellation" button submits
 * the existing form (unchanged Server Action, unchanged
 * cancelBookingWithRefund/refund-policy semantics — this component adds
 * no new financial calculation of its own). "Keep session" (or Escape /
 * backdrop / the dialog's own close button — all route through the same
 * onClose) closes the dialog with zero server call and zero state
 * mutation.
 *
 * The visible trigger button and the dialog share ONE underlying <form>
 * (via formRef.requestSubmit()) so useActionState's existing
 * pending/error handling is reused as-is — not duplicated.
 */
export function CancelBookingButton({
  bookingId,
  label,
  cancellingLabel,
  consequencePreview,
  dialogTitle,
  dialogDescription,
  keepLabel,
  confirmLabel,
  irreversibleNote,
}: {
  bookingId: string;
  label: string;
  cancellingLabel: string;
  /** Phase H.8 (§W) — server-computed refund-consequence preview text,
   * e.g. "Full refund: $50.00" / "No refund under the cancellation
   * policy." Never computed client-side — this is purely informational;
   * the server calculation remains the sole source of truth. Shown both
   * inline (as before) and inside the confirmation dialog. */
  consequencePreview?: string;
  dialogTitle: string;
  dialogDescription: string;
  keepLabel: string;
  confirmLabel: string;
  irreversibleNote: string;
}) {
  const [state, formAction, pending] = useActionState(cancelBookingAction, undefined);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <form ref={formRef} action={formAction} className="flex flex-col items-end gap-1">
        <input type="hidden" name="bookingId" value={bookingId} />
        {consequencePreview && <p className="text-xs text-slate">{consequencePreview}</p>}
        <button
          type="button"
          data-testid="cancel-booking"
          disabled={pending}
          onClick={() => setConfirmOpen(true)}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-semibold text-slate transition-colors hover:border-error hover:text-error disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? cancellingLabel : label}
        </button>
        {state?.error && <p className="mt-1 text-xs font-semibold text-error">{state.error}</p>}
      </form>

      <ConfirmationDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          // Cheap client-side double-submit guard — the actual financial
          // safety net is the existing guarded updateMany in
          // cancelBookingWithRefund (CANCELLABLE_STATUSES + status check),
          // unchanged by this mission. This just avoids an unnecessary
          // second dispatch from a rapid double-click.
          if (pending) return;
          setConfirmOpen(false);
          formRef.current?.requestSubmit();
        }}
        title={dialogTitle}
        description={
          <>
            <p>{dialogDescription}</p>
            {consequencePreview && (
              <p className="mt-2 font-semibold text-text-primary" data-testid="cancel-dialog-consequence">
                {consequencePreview}
              </p>
            )}
            <p className="mt-2">{irreversibleNote}</p>
          </>
        }
        cancelLabel={keepLabel}
        confirmLabel={pending ? cancellingLabel : confirmLabel}
        destructive
      />
    </>
  );
}
