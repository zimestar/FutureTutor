"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { confirmTutoringRequestAction, cancelTutoringRequestAction, preparePaymentForRequestAction, type PreparePaymentState } from "@/lib/actions/tutoringRequests";
import { StripePaymentForm } from "@/components/payments/StripePaymentForm";
import { acquirePreparationLock, paymentPreparationView } from "@/lib/paymentPreparation";

export function QuickMatchPriceReview({
  tutoringRequestId,
  customerPriceQuoteId,
  basePriceCents,
  subtotalCents,
  taxCents,
  totalCents,
  currency,
  useStripe,
  stripePublishableKey,
}: {
  tutoringRequestId: string;
  customerPriceQuoteId: string;
  basePriceCents: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  useStripe: boolean;
  stripePublishableKey: string | null;
}) {
  const t = useTranslations("quickMatch");
  const locale = useLocale();
  const [confirmState, confirmAction, confirmPending] = useActionState(confirmTutoringRequestAction, undefined);
  const [cancelState, cancelActionFn, cancelPending] = useActionState(cancelTutoringRequestAction, undefined);

  // Only meaningful in live mode — dev mode never needs a client secret at
  // all (preparePaymentForRequestAction still runs server-side, but there's
  // nothing for the UI to render).
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripePaymentIntentId, setStripePaymentIntentId] = useState<string | null>(null);
  const [prepareResult, setPrepareResult] = useState<PreparePaymentState | null>(null);
  const [preparing, startPreparing] = useTransition();
  const activePreparations = useRef(new Set<string>());

  const currencyFormatter = new Intl.NumberFormat(locale, { style: "currency", currency });
  const formatCents = (cents: number) => currencyFormatter.format(cents / 100);

  const preparationView = paymentPreparationView(preparing, prepareResult);
  const needsPaymentSetup = useStripe && !clientSecret && !stripePaymentIntentId;

  const handleStartPayment = () => {
    if (!acquirePreparationLock(activePreparations.current, tutoringRequestId)) return;
    startPreparing(async () => {
      try {
        const result = await preparePaymentForRequestAction(tutoringRequestId);
        setPrepareResult(result);
        if (result.success) setClientSecret(result.clientSecret);
      } catch {
        setPrepareResult({ success: false, error: t("errors.paymentPreparationFailed"), retryable: true });
      } finally {
        activePreparations.current.delete(tutoringRequestId);
      }
    });
  };

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
      {needsPaymentSetup ? (
        <div className="mt-5" aria-live="polite">
          {(preparationView.state === "failed-retryable" || preparationView.state === "failed-terminal") && (
            <div className="mb-3 rounded-md bg-error-light p-3">
              <p role="alert" className="text-sm font-semibold text-error">{preparationView.error}</p>
              {preparationView.state === "failed-terminal" &&
                !(prepareResult?.success === false && prepareResult.reason === "beta_gate") && (
                  <p className="mt-2 text-sm text-text-secondary">{t("review.restartPaymentFlow")}</p>
                )}
            </div>
          )}
          {preparationView.state !== "failed-terminal" && (
            <button
              type="button"
              data-testid={preparationView.state === "failed-retryable" ? "retry-quick-match-payment" : "start-payment"}
              onClick={handleStartPayment}
              disabled={preparing}
              className="min-h-11 w-full rounded-md bg-blue px-4 text-[15px] font-bold text-white transition-colors hover:bg-blue/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue disabled:cursor-not-allowed disabled:opacity-50"
            >
              {preparing ? t("review.preparingPayment") : preparationView.state === "failed-retryable" ? t("review.retryPaymentCta") : t("review.enterPaymentCta")}
            </button>
          )}
          {preparationView.state === "failed-terminal" && (
            <form action={cancelActionFn}>
              <input type="hidden" name="tutoringRequestId" value={tutoringRequestId} />
              <button type="submit" disabled={cancelPending} className="min-h-11 rounded-md border border-neutral-300 px-5 text-sm font-semibold text-slate disabled:opacity-50">
                {t("review.cancelCta")}
              </button>
            </form>
          )}
        </div>
      ) : useStripe && clientSecret && stripePublishableKey && !stripePaymentIntentId ? (
        <div className="mt-5">
          <StripePaymentForm
            clientSecret={clientSecret}
            publishableKey={stripePublishableKey}
            onAuthorized={setStripePaymentIntentId}
            submitLabel={t("review.confirmCta")}
            pendingLabel={t("review.confirming")}
            errorMessage={t("review.paymentErrorFallback")}
          />
        </div>
      ) : (
        <div className="mt-5 flex gap-3">
          <form action={confirmAction} className="flex-1">
            <input type="hidden" name="tutoringRequestId" value={tutoringRequestId} />
            <input type="hidden" name="customerPriceQuoteId" value={customerPriceQuoteId} />
            {stripePaymentIntentId && <input type="hidden" name="stripePaymentIntentId" value={stripePaymentIntentId} />}
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
      )}
    </div>
  );
}
