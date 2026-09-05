"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/Badge";
import { formatBookingTime } from "@/lib/utils";
import type { PaymentHistoryDto, PaymentHistoryStatus } from "@/lib/paymentHistoryPresentation";

/**
 * PAYMENT-HISTORY1 — a single payment row. Renders safely with
 * booking === null (a captured payment with no linked Booking — see
 * paymentHistoryPresentation.ts) by simply omitting the session-context
 * section, never crashing on a missing relation.
 *
 * Terminology: "Payment details," never "receipt"/"invoice" — no tax/
 * legal-invoice data exists in this schema (confirmed during this
 * mission's Phase 0 audit), so this UI never implies it does.
 */
const STATUS_BADGE_VARIANT: Record<PaymentHistoryStatus, "mint" | "outline" | "neutral"> = {
  PAID: "mint",
  PARTIALLY_REFUNDED: "outline",
  REFUNDED: "neutral",
};

function formatMoney(cents: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

export function PaymentHistoryCard({ payment }: { payment: PaymentHistoryDto }) {
  const t = useTranslations("paymentHistory");
  const tSubjects = useTranslations("subjects.items");
  const locale = useLocale();
  const [refundsOpen, setRefundsOpen] = useState(false);

  const paidOn = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(payment.paidAt));

  return (
    <li className="rounded-lg border border-neutral-200 bg-white p-4" data-testid="payment-history-item">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {payment.booking ? (
            <p className="font-semibold text-navy">
              {tSubjects(payment.booking.subjectSlug)} —{" "}
              {t("withTutor", { name: payment.booking.tutorFirstName })}
            </p>
          ) : (
            <p className="font-semibold text-navy">{t("genericPaymentTitle")}</p>
          )}

          {payment.booking && (
            <p className="mt-1 text-sm text-slate">
              {t("sessionOn", {
                when: formatBookingTime(new Date(payment.booking.startAt), payment.booking.timezone, locale),
              })}
            </p>
          )}

          <p className="mt-1 text-xs text-text-muted">{t("paidOn", { date: paidOn })}</p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <Badge variant={STATUS_BADGE_VARIANT[payment.status]}>{t(`status.${payment.status}`)}</Badge>
          <p className="text-right font-semibold text-navy" data-testid="payment-amount">
            {formatMoney(payment.amountCents, payment.currency, locale)}
          </p>
        </div>
      </div>

      {payment.refundedAmountCents > 0 && (
        <div className="mt-3 border-t border-neutral-100 pt-3 text-sm text-slate">
          <p data-testid="refund-summary">
            {t("refundedAmount", { amount: formatMoney(payment.refundedAmountCents, payment.currency, locale) })}
            {" · "}
            {t("netPaid", { amount: formatMoney(payment.netAmountCents, payment.currency, locale) })}
          </p>

          {payment.refunds.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setRefundsOpen((open) => !open)}
                className="mt-2 text-sm font-semibold text-blue hover:underline"
                aria-expanded={refundsOpen}
                data-testid="toggle-refund-history"
              >
                {refundsOpen ? t("hideRefundHistory") : t("showRefundHistory")}
              </button>

              {refundsOpen && (
                <ul className="mt-2 flex flex-col gap-1" data-testid="refund-history-list">
                  {payment.refunds.map((refund) => (
                    <li key={refund.id} className="flex items-center justify-between gap-3 text-xs text-text-muted">
                      <span>
                        {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(refund.createdAt))}
                        {" — "}
                        {t(`refundStatus.${refund.status}`)}
                      </span>
                      <span>{formatMoney(refund.amountCents, refund.currency, locale)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {payment.booking && (
        <div className="mt-3">
          <Link href={`/session/${payment.booking.id}`} className="text-sm font-semibold text-blue hover:underline" data-testid="payment-session-link">
            {t("viewSession")}
          </Link>
        </div>
      )}
    </li>
  );
}
