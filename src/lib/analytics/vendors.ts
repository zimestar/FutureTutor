import { hasAnalyticsConsent } from "./consent";
import { isProductionAnalyticsEnvironment } from "./environment";

/**
 * DATA-1 — the one and only place a vendor script may be injected.
 * NEXT_PUBLIC_GTM_ID is unset in every environment today (no Google Tag
 * Manager container has been created yet — see
 * docs/analytics/DATA-1-ANALYTICS-FOUNDATION.md's human-checkpoint
 * section), so `shouldLoadGtm()` always returns false right now and this
 * module is fully inert in production. It is written and tested now so
 * the only remaining step, once a real container exists, is setting the
 * env var — no code change.
 *
 * GTM is the sole vendor entry point: if GTM is adopted, it owns loading
 * GA4 as a tag inside its own container, so this file must never also
 * inject a separate gtag.js/GA4 script directly — one ownership path
 * only (this mission's own Phase 20 requirement).
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

const GTM_SCRIPT_ELEMENT_ID = "futuretutor-gtm-script";

export function shouldLoadGtm(): boolean {
  if (!isProductionAnalyticsEnvironment()) return false;
  if (!process.env.NEXT_PUBLIC_GTM_ID) return false;
  return hasAnalyticsConsent();
}

/**
 * Injects the GTM script exactly once (guarded by a stable element id —
 * safe to call repeatedly, e.g. from a consent-change subscriber). No-op
 * whenever shouldLoadGtm() is false, which today is unconditionally the
 * case (no NEXT_PUBLIC_GTM_ID configured anywhere yet).
 */
export function loadGtmIfEligible(): void {
  if (!shouldLoadGtm()) return;
  if (document.getElementById(GTM_SCRIPT_ELEMENT_ID)) return;

  const gtmId = process.env.NEXT_PUBLIC_GTM_ID;
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });

  const script = document.createElement("script");
  script.id = GTM_SCRIPT_ELEMENT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId!)}`;
  document.head.appendChild(script);
}

/**
 * Pushes one allowlisted analytics payload to the dataLayer. Never called
 * directly by UI code — only from track.ts, after the PII/route/consent
 * checks there have already passed. No-op if GTM hasn't been (and, today,
 * can never be) loaded.
 */
export function pushToDataLayer(payload: Record<string, unknown>): void {
  if (typeof window === "undefined" || !window.dataLayer) return;
  window.dataLayer.push(payload);
}
