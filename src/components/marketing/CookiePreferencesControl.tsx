"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { getConsentState, revokeAnalyticsConsent } from "@/lib/analytics";
import { unloadGtm } from "@/lib/analytics/vendors";

/**
 * DATA-1 Phase 2 — the smallest safe way to let a visitor change or
 * revisit their analytics choice: placed on the Cookie Policy page
 * itself (already linked from the consent banner's own "Learn more" and
 * from the sitewide footer's existing "cookies" link — no new nav surface
 * introduced). Revoking resets stored state to "undecided" and reloads,
 * so ConsentBanner (mounted globally) reappears on the fresh page load
 * and the visitor can grant or deny again from a clean state.
 *
 * Honest about what revocation can and cannot do: unloadGtm() (vendors.ts)
 * removes the injected script element and empties the in-page dataLayer,
 * but cannot retroactively undo anything GTM/GA4 already did before this
 * click, or affect cookies Google's own scripts already set — see that
 * function's own comment for the full, accurate scope.
 */
function subscribeNoop() {
  return () => {};
}

export function CookiePreferencesControl() {
  const t = useTranslations("consentBanner");
  const [justRevoked, setJustRevoked] = useState(false);
  const analyticsDecision = useSyncExternalStore(
    subscribeNoop,
    () => getConsentState().analytics,
    () => "undecided" as const,
  );

  function handleManage() {
    revokeAnalyticsConsent();
    unloadGtm();
    setJustRevoked(true);
    window.location.reload();
  }

  return (
    <div className="rounded-2xl border border-border bg-off-white p-6">
      <p className="font-bold text-navy">{t("preferencesHeading")}</p>
      <p className="mt-2 text-sm leading-6 text-text-secondary">
        {analyticsDecision === "granted" && t("statusGranted")}
        {analyticsDecision === "denied" && t("statusDenied")}
        {analyticsDecision === "undecided" && t("statusUndecided")}
      </p>
      <div className="mt-4">
        <Button variant="outline" size="sm" onClick={handleManage} disabled={justRevoked}>
          {t("manageCta")}
        </Button>
      </div>
    </div>
  );
}
