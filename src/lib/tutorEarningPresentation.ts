import type { TutorEarningStatus } from "@/generated/prisma/enums";

export type TutorEarningPresentationKey =
  | "pendingOutcome"
  | "pendingEligibility"
  | "eligible"
  | "held"
  | "transferred"
  | "cancelled";

export interface TutorEarningPresentation {
  key: TutorEarningPresentationKey;
  badgeVariant: "mint" | "blue" | "neutral" | "outline";
  showEligibilityDate: boolean;
}

/** Display-only mapping of authoritative fields; never derives or mutates financial state. */
export function presentTutorEarning(
  status: TutorEarningStatus,
  eligibleAt: Date | null
): TutorEarningPresentation {
  switch (status) {
    case "PENDING_ELIGIBLE":
      return eligibleAt
        ? { key: "pendingEligibility", badgeVariant: "blue", showEligibilityDate: true }
        : { key: "pendingOutcome", badgeVariant: "neutral", showEligibilityDate: false };
    case "ELIGIBLE":
      return { key: "eligible", badgeVariant: "mint", showEligibilityDate: false };
    case "HELD":
      return { key: "held", badgeVariant: "outline", showEligibilityDate: false };
    case "TRANSFERRED":
      return { key: "transferred", badgeVariant: "mint", showEligibilityDate: false };
    case "CANCELLED":
      return { key: "cancelled", badgeVariant: "outline", showEligibilityDate: false };
  }
}
