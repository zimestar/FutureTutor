export type QuickMatchRequestStatus =
  | "DRAFT"
  | "PRICED"
  | "CONFIRMED"
  | "MATCHING"
  | "PAYMENT_PENDING"
  | "BOOKED"
  | "CANCELLED"
  | "EXPIRED"
  | "NO_TUTOR_FOUND"
  | "FAILED"
  | "PAYMENT_FAILED";

export type QuickMatchCustomerView = "form" | "price-review" | "active-status" | "terminal-status";

export function quickMatchCustomerView(
  activeStatus: QuickMatchRequestStatus | null,
  latestStatus: QuickMatchRequestStatus | null,
  startNewRequested: boolean
): QuickMatchCustomerView {
  if (activeStatus === "PRICED") return "price-review";
  if (activeStatus) return "active-status";
  if (!startNewRequested && (latestStatus === "BOOKED" || latestStatus === "PAYMENT_FAILED")) {
    return "terminal-status";
  }
  return "form";
}
