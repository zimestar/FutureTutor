"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { confirmTutoringRequestAction, cancelTutoringRequestAction } from "@/lib/actions/tutoringRequests";

export function QuickMatchPriceReview({
  tutoringRequestId,
  customerPriceQuoteId,
  basePriceCents,
  subtotalCents,
  taxCents,
  totalCents,
  currency,
}: {
  tutoringRequestId: string;
  customerPriceQuoteId: string;
  basePriceCents: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
}) {
  const t = useTranslations("quickMatch");
  const locale = useLocale();
  const [confirmState, confirmAction, confirmPending] = useActionState(confirmTutoringRequestAction, undefined);
  const [cancelState, cancelActionFn, cancelPending] = useActionState(cancelTutoringRequestAction, undefined);

  const currencyFormatter = new Intl.NumberFormat(locale, { style: "currency", currency });
  const formatCents = (cents: number) => currencyFormatter.format(cents / 100);

  return (
    <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-6" data-testid="quick-match-price-review">
      <h2 className="text-lg font-bold text-navy">{t("review.title")}</h2>
      <p className="mt-1 text-sm text-slate">{t("review.description")}</p>

      <div className="mt-4 flex flex-col gap-1 rounded-md border border-neutral-200 bg-off-white p-4 text-sm">
        <div className="flex justify-between text-slate">
          <span>{t("review.basePrice")}</span>
          <span>{formatCents(basePriceCents)}</span>
        </div>
        {subtotalCents !== basePriceCents && (
          <div className="flex justify-between text-slate">
            <span>{t("review.adjustments")}</span>
            <span>{formatCents(subtotalCents - basePriceCents)}</span>
          </div>
        )}
        {taxCents > 0 && (
          <div className="flex justify-between text-slate">
            <span>{t("review.tax")}</span>
            <span>{formatCents(taxCents)}</span>
          </div>
        )}
        <div className="mt-1 flex justify-between border-t border-neutral-200 pt-1 font-bold text-navy">
          <span>{t("review.total")}</span>
          <span data-testid="quick-match-total-price">{formatCents(totalCents)}</span>
        </div>
      </div>

      {confirmState?.error && (
        <p role="alert" className="mt-3 rounded-md bg-error-light px-3 py-2 text-sm font-semibold text-error">
          {confirmState.error}
        </p>
      )}
      {cancelState?.error && (
        <p role="alert" className="mt-3 rounded-md bg-error-light px-3 py-2 text-sm font-semibold text-error">
          {cancelState.error}
        </p>
      )}

      <div className="mt-5 flex gap-3">
        <form action={confirmAction} className="flex-1">
          <input type="hidden" name="tutoringRequestId" value={tutoringRequestId} />
          <input type="hidden" name="customerPriceQuoteId" value={customerPriceQuoteId} />
          <button
            type="submit"
            data-testid="confirm-quick-match"
            disabled={confirmPending || cancelPending}
            className="h-12 w-full rounded-md bg-blue text-[15px] font-bold text-white transition-colors hover:bg-blue/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {confirmPending ? t("review.confirming") : t("review.confirmCta")}
          </button>
        </form>
        <form action={cancelActionFn}>
          <input type="hidden" name="tutoringRequestId" value={tutoringRequestId} />
          <button
            type="submit"
            data-testid="cancel-quick-match"
            disabled={confirmPending || cancelPending}
            className="h-12 rounded-md border border-neutral-300 px-5 text-[15px] font-semibold text-slate transition-colors hover:border-error hover:text-error disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("review.cancelCta")}
          </button>
        </form>
      </div>
    </div>
  );
}
