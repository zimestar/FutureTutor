"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Button } from "@/components/ui/Button";
import { COOKIE_POLICY_VERSION } from "@/content/legal/cookieContent.en";
import { acceptAnalyticsConsent, getConsentState, isAnalyticsEligiblePath, rejectAnalyticsConsent } from "@/lib/analytics";
import { loadGtmIfConsentAlreadyGranted, loadGtmIfEligible } from "@/lib/analytics/vendors";

/**
 * DATA-1 — the ANALYTICS-category consent banner, mounted once in the
 * root locale layout so it covers every real page (including the
 * homepage and /tutors/[slug], neither of which uses the shared
 * MarketingShell wrapper) — but it self-excludes on any
 * analytics-ineligible route via the exact same certified
 * isAnalyticsEligiblePath() used by trackEvent() itself, so it can never
 * appear on a private/admin/auth-utility surface regardless of where it's
 * mounted. This mirrors trackEvent()'s own defense-in-depth pattern
 * (check the real route, not just "where was this rendered").
 *
 * Uses the same COOKIE_POLICY_VERSION the live Cookie Policy page already
 * exports (cookieContent.en.ts) as the consent record's policyVersion, so
 * a future policy-text change can invalidate stale decisions by comparing
 * versions — not implemented as auto-invalidation here, but the state
 * shape already supports it.
 */
// No cross-tab live sync is needed for this simple banner — subscribe is a
// no-op so useSyncExternalStore only ever re-reads on this component's own
// re-renders. Its real purpose here is a hydration-safe initial read of
// localStorage: the server snapshot is always "not undecided" (never
// render the banner during SSR), and the client snapshot reads the real
// stored decision on the client's first paint after hydration, which is
// exactly what useSyncExternalStore is for — without the setState-in-
// effect anti-pattern a plain useEffect+useState version would need.
function subscribeNoop() {
  return () => {};
}

export function ConsentBanner() {
  const t = useTranslations("consentBanner");
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(false);
  const isUndecided = useSyncExternalStore(
    subscribeNoop,
    () => getConsentState().analytics === "undecided",
    () => false
  );

  // DATA-1-GTM-LIVE-DETECTION-FIX1 — loadGtmIfEligible() was previously
  // only ever invoked from handleAccept()'s click below, so a visitor whose
  // consent was already GRANTED on a prior visit never got GTM loaded on a
  // fresh page load (diagnosed root cause: DATA-1-GTM-LIVE-DETECTION-DIAG1).
  // loadGtmIfConsentAlreadyGranted() (vendors.ts) re-derives the route
  // eligibility guarantee itself — it is NOT redundant with
  // loadGtmIfEligible()'s own checks, which cover hostname + GTM ID +
  // consent but deliberately never route eligibility (DIAG1 proved this).
  useEffect(() => {
    loadGtmIfConsentAlreadyGranted(pathname);
  }, [pathname]);

  if (dismissed || !isUndecided || !isAnalyticsEligiblePath(pathname)) return null;

  function handleAccept() {
    acceptAnalyticsConsent(COOKIE_POLICY_VERSION);
    setDismissed(true);
    loadGtmIfEligible();
  }

  function handleReject() {
    rejectAnalyticsConsent(COOKIE_POLICY_VERSION);
    setDismissed(true);
  }

  return (
    <div role="dialog" aria-live="polite" aria-label={t("heading")} className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-white p-5 shadow-pop">
      <div className="mx-auto flex max-w-4xl flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-bold text-navy">{t("heading")}</p>
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            {t("description")}{" "}
            <Link href="/cookies" className="font-semibold text-blue hover:text-blue-hover">
              {t("learnMore")}
            </Link>
          </p>
        </div>
        <div className="flex shrink-0 gap-3">
          <Button variant="outline" size="sm" onClick={handleReject}>
            {t("reject")}
          </Button>
          <Button variant="primary" size="sm" onClick={handleAccept}>
            {t("accept")}
          </Button>
        </div>
      </div>
    </div>
  );
}
