"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PaymentHistoryCard } from "@/components/dashboard/PaymentHistoryCard";
import { getPaymentHistoryPageAction } from "@/lib/actions/paymentHistory";
import type { PaymentHistoryDto } from "@/lib/paymentHistoryPresentation";

/**
 * PAYMENT-HISTORY1 — cursor-paginated list, mirroring
 * NotificationCenterList.tsx's exact "Load more" pattern. Receives its
 * first page pre-fetched server-side (real SSR content on first paint).
 */
export function PaymentHistoryList({
  initialItems,
  initialCursor,
}: {
  initialItems: PaymentHistoryDto[];
  initialCursor: string | null;
}) {
  const t = useTranslations("paymentHistory");
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);

  async function handleLoadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const next = await getPaymentHistoryPageAction(cursor);
    setItems((prev) => [...prev, ...next.items]);
    setCursor(next.nextCursor);
    setLoadingMore(false);
  }

  if (items.length === 0) {
    return (
      <div className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
        <p className="text-slate">{t("empty")}</p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <ul className="flex flex-col gap-3" data-testid="payment-history-list">
        {items.map((payment) => (
          <PaymentHistoryCard key={payment.id} payment={payment} />
        ))}
      </ul>

      {cursor && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-slate hover:border-blue hover:text-blue disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="load-more"
          >
            {t("loadMore")}
          </button>
        </div>
      )}
    </div>
  );
}
