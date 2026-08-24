"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { reconcilePaymentAction } from "@/lib/actions/paymentsAdmin";

export function ReconcilePaymentButton({ paymentId }: { paymentId: string }) {
  const t = useTranslations("admin.payments");
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      data-testid="reconcile-payment"
      disabled={pending}
      onClick={() => startTransition(() => reconcilePaymentAction(paymentId))}
      className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-slate transition-colors hover:border-blue hover:text-blue disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? t("checking") : t("reconcile")}
    </button>
  );
}
