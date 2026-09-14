/**
 * DATA-1 — public barrel for the analytics module. Existing call sites
 * import from "@/lib/analytics" (previously the flat src/lib/analytics.ts
 * file, now this directory) — that import path is unchanged, so no call
 * site needed to change its import.
 */
export { trackEvent } from "./track";
export type { AnalyticsEventName, AnalyticsEventPropertiesMap, PageType, CtaLocation, UserIntent, Locale } from "./types";
export { isAnalyticsEligiblePath } from "./routePolicy";
export { isKnownSubjectSlug, isKnownResourceSlug, isKnownCitySlug } from "./slugGuards";
export {
  hasAnalyticsConsent,
  getConsentState,
  acceptAnalyticsConsent,
  rejectAnalyticsConsent,
  revokeAnalyticsConsent,
  CONSENT_STORAGE_KEY,
  CONSENT_SCHEMA_VERSION,
} from "./consent";
export type { ConsentState, ConsentCategory, ConsentDecision } from "./consent";
export { isProductionAnalyticsEnvironment } from "./environment";
export { shouldLoadGtm, loadGtmIfEligible } from "./vendors";
