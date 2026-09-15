import type { AnalyticsEventName, AnalyticsEventPropertiesMap } from "./types";
import { findDeniedProperties } from "./piiDenylist";
import { isAnalyticsEligiblePath } from "./routePolicy";
import { hasAnalyticsConsent } from "./consent";
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
 * Consent-activation re-audit finding: this function must re-check
 * consent on every single call, not just at GTM-load time — otherwise a
 * visitor who granted consent (GTM loaded), generated a live dataLayer,
 * and later revoked would keep having application events pushed into
 * that still-present dataLayer object for the rest of the page's
 * lifetime. Checking here is what makes "revoke -> future analytics
 * collection stops" true at the application level. It cannot retroactively
 * undo anything GTM/GA4 already did before the revoke (see
 * vendors.ts's unloadGtm() for the documented, honest limits of that).
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

  if (!hasAnalyticsConsent()) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[analytics] dropped event — no analytics consent granted", event);
    }
    return;
  }

  if (process.env.NODE_ENV !== "production") {
    console.debug("[analytics]", event, properties ?? {});
  }

  pushToDataLayer({ event, ...properties });
}
