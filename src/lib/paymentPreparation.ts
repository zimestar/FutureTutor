export type PaymentPreparationFailure = {
  success: false;
  error: string;
  retryable: boolean;
};

export type PaymentPreparationView =
  | { state: "idle" }
  | { state: "preparing" }
  | { state: "ready" }
  | { state: "failed-retryable"; error: string }
  | { state: "failed-terminal"; error: string };

export function paymentPreparationView(
  preparing: boolean,
  result: { success: boolean; error?: string; retryable?: boolean } | null
): PaymentPreparationView {
  if (preparing) return { state: "preparing" };
  if (!result) return { state: "idle" };
  if (result.success) return { state: "ready" };
  return result.retryable
    ? { state: "failed-retryable", error: result.error ?? "" }
    : { state: "failed-terminal", error: result.error ?? "" };
}

/** Immediate event-level guard; unlike disabled styling, this blocks repeat events before React rerenders. */
export function acquirePreparationLock(activeKeys: Set<string>, key: string): boolean {
  if (activeKeys.has(key)) return false;
  activeKeys.add(key);
  return true;
}
