/**
 * Canadian tax treatment (GST/HST/QST/PST) for tutoring services is a
 * launch-blocking business/accounting decision, not an engineering one —
 * see the Phase E plan. This stays in an explicit "not configured" state
 * until real, verified tax rules are provided. Never guess a rate.
 */

export interface TaxContext {
  province?: string | null;
}

export interface TaxResult {
  taxCents: number;
  configured: boolean;
  jurisdiction: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- params kept for the real implementation's future signature
export function calculateTax(context: TaxContext, taxableAmountCents: number): TaxResult {
  return { taxCents: 0, configured: false, jurisdiction: null };
}
