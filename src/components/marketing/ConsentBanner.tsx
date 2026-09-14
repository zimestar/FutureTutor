"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/Button";
import { COOKIE_POLICY_VERSION } from "@/content/legal/cookieContent.en";
import { acceptAnalyticsConsent, getConsentState, rejectAnalyticsConsent } from "@/lib/analytics";
import { loadGtmIfEligible } from "@/lib/analytics/vendors";

/**
 * DATA-1 — the ANALYTICS-category consent banner. Built and tested but
 * deliberately NOT mounted in the root layout yet (see
 * docs/analytics/DATA-1-ANALYTICS-FOUNDATION.md's human-checkpoint
 * section): FutureTutor's own Cookie Policy currently states analytics is
 * "not currently represented as used," and the Policy's own §14/§28
 * commit to providing a consent mechanism "before... activated" — showing
 * this banner before any real analytics vendor is configured would ask
 * users to decide about a technology that doesn't exist yet. Mount this
 * component in the root layout only once a real GTM container exists and
 * the Cookie Policy has been updated to match (HUMAN LEGAL REVIEW
 * REQUIRED, flagged in the doc above).
 *
 * Uses the same COOKIE_POLICY_VERSION the live Cookie Policy page already
 * exports (cookieContent.en.ts) as the consent record's policyVersion, so
 * a future policy-text change can invalidate stale decisions by comparing
 * versions — not implemented as auto-invalidation here (no live banner to
 * re-prompt yet), but the state shape already supports it.
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
  const [dismissed, setDismissed] = useState(false);
  const isUndecided = useSyncExternalStore(
    subscribeNoop,
    () => getConsentState().analytics === "undecided",
    () => false
  );

  if (dismissed || !isUndecided) return null;

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
