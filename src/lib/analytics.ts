/**
 * Provider-agnostic analytics hook. Swap the implementation for a real
 * provider (PostHog, GA4, Segment, etc.) without touching call sites.
 */
export type AnalyticsEvent =
  | "search_started"
  | "subject_selected"
  | "tutor_card_clicked"
  | "find_tutor_clicked"
  | "become_tutor_clicked"
  | "signup_started"
  | "signup_completed";

export function trackEvent(
  event: AnalyticsEvent,
  properties?: Record<string, string | number | boolean | undefined>
) {
  if (process.env.NODE_ENV !== "production") {
    console.debug("[analytics]", event, properties ?? {});
  }
  // Wire a real provider here when one is chosen.
}
