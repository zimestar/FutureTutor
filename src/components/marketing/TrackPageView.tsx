"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";
import type { AnalyticsEventName, AnalyticsEventPropertiesMap } from "@/lib/analytics";

/**
 * DATA-1 — fires exactly one analytics view event on mount. A tiny client
 * component rather than server-side tracking: a "viewed" event should
 * reflect a real client render, not just that the server produced HTML.
 * Deliberately not added to every page — only the four real,
 * taxonomy-backed page types worth measuring distinctly (Phase 7: "start
 * small"). Props are typed against the exact event's own allowlisted
 * property shape, so a call site here is under the same compile-time PII
 * guard as every other trackEvent call.
 */
export function TrackPageView<E extends AnalyticsEventName>({ event, properties }: { event: E; properties: AnalyticsEventPropertiesMap[E] }) {
  useEffect(() => {
    trackEvent(event, properties);
    // Fire once per mount only — a dependency array keyed on the
    // primitive identifying value (if any) would risk double-firing on
    // unrelated re-renders; page navigations remount this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
