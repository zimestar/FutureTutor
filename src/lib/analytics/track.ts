import type { AnalyticsEventName, AnalyticsEventPropertiesMap } from "./types";
import { findDeniedProperties } from "./piiDenylist";
import { isAnalyticsEligiblePath } from "./routePolicy";
import { pushToDataLayer } from "./vendors";

/**
 * DATA-1 — the single call surface every component uses:
 *
 *   trackEvent("find_tutor_cta_clicked", { cta_location: "hero" })
 *
 * never a direct gtag()/dataLayer.push()/vendor SDK call. The event name
 * and its properties are both compile-time checked against
 * AnalyticsEventPropertiesMap (types.ts) — a call site cannot pass a
 * property that isn't explicitly allowlisted for that event. The runtime
 * denylist check below is defense-in-depth for anything that reaches this
 * function despite that (an `as any` cast, a future refactor).
 *
 * Currently a safe no-op in every environment: pushToDataLayer() only
 * does anything once GTM has actually loaded (vendors.ts), which itself
 * requires a real NEXT_PUBLIC_GTM_ID that does not exist yet. Logs to
 * console.debug outside production so the taxonomy is visible during
 * development without shipping anything anywhere.
 */
export function trackEvent<E extends AnalyticsEventName>(event: E, properties: AnalyticsEventPropertiesMap[E]): void {
  const denied = findDeniedProperties(properties as Record<string, unknown> | undefined);
  if (denied.length > 0) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[analytics] dropped event with denylisted properties", event, denied);
    }
    return;
  }

  if (typeof window !== "undefined" && !isAnalyticsEligiblePath(window.location.pathname)) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[analytics] dropped event fired from an analytics-excluded route", event, window.location.pathname);
    }
    return;
  }

  if (process.env.NODE_ENV !== "production") {
    console.debug("[analytics]", event, properties ?? {});
  }

  pushToDataLayer({ event, ...properties });
}
