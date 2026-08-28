"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cancelTutoringRequestAction } from "@/lib/actions/tutoringRequests";

const REFRESH_INTERVAL_MS = 15000;

export function QuickMatchStatusView({
  tutoringRequestId,
  status,
  dispatchRound,
}: {
  tutoringRequestId: string;
  status: "MATCHING" | "PAYMENT_PENDING" | "BOOKED" | "NO_TUTOR_FOUND" | "CANCELLED" | "EXPIRED" | "FAILED" | "PAYMENT_FAILED";
  dispatchRound: number;
}) {
  const t = useTranslations("quickMatch");
  const router = useRouter();
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelTutoringRequestAction, undefined);

  const isLive = status === "MATCHING" || status === "PAYMENT_PENDING";

  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(() => router.refresh(), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isLive, router]);

  return (
    <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-6" data-testid="quick-match-status">
      <h2 className="text-lg font-bold text-navy">{t(`status.${status}.title`)}</h2>
      <p className="mt-1 text-sm text-slate">{t(`status.${status}.description`, { round: dispatchRound })}</p>

      {cancelState?.error && (
        <p role="alert" className="mt-3 rounded-md bg-error-light px-3 py-2 text-sm font-semibold text-error">
          {cancelState.error}
        </p>
      )}

      {status === "BOOKED" && (
        <Link
          href="/dashboard/bookings"
          data-testid="view-booking-cta"
          className="mt-4 inline-flex min-h-11 items-center rounded-md bg-blue px-5 text-sm font-bold text-white hover:bg-blue/90"
        >
          {t("status.viewBookingCta")}
        </Link>
      )}

      {status === "MATCHING" && (
        <form action={cancelAction} className="mt-4">
          <input type="hidden" name="tutoringRequestId" value={tutoringRequestId} />
          <button
            type="submit"
            data-testid="cancel-matching"
            disabled={cancelPending}
            className="h-11 rounded-md border border-neutral-300 px-5 text-sm font-semibold text-slate transition-colors hover:border-error hover:text-error disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelPending ? t("status.cancelling") : t("status.cancelCta")}
          </button>
        </form>
      )}
    </div>
  );
}
