import type { LearningMode } from "@/types/tutor";

/**
 * The marketing UI (TutorCard, search filters, translation keys) uses the
 * lowercase-hyphenated `LearningMode` ("online" | "in-person" | "both").
 * Prisma's `TutoringMode` enum is upper-snake ("ONLINE" | "IN_PERSON" |
 * "BOTH"). This is the single place that maps between the two.
 */
export function dbModeToDisplay(mode: "ONLINE" | "IN_PERSON" | "BOTH"): LearningMode {
  switch (mode) {
    case "ONLINE":
      return "online";
    case "IN_PERSON":
      return "in-person";
    case "BOTH":
      return "both";
  }
}

export function displayModeToDb(mode: LearningMode): "ONLINE" | "IN_PERSON" | "BOTH" {
  switch (mode) {
    case "online":
      return "ONLINE";
    case "in-person":
      return "IN_PERSON";
    case "both":
      return "BOTH";
  }
}
