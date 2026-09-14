"use client";

import { Button } from "@/components/ui/Button";
import { trackEvent } from "@/lib/analytics";
import type { AnalyticsEventName, AnalyticsEventPropertiesMap } from "@/lib/analytics";

/**
 * DATA-1 — a Button that also fires a trackEvent on click. A dedicated
 * client component because the CTA buttons on several real pages
 * (resource articles, subject pages) are rendered from async Server
 * Components, which cannot pass an inline event-handler closure directly
 * to a Client Component prop (Next.js App Router constraint) — this
 * component is the one Client Component boundary that makes that safe,
 * reused rather than duplicated per page.
 */
export function TrackedCtaButton<E extends AnalyticsEventName>({
  href,
  event,
  properties,
  size,
  variant,
  children,
}: {
  href: string;
  event: E;
  properties: AnalyticsEventPropertiesMap[E];
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "dark" | "outline" | "ghost" | "ghost-inverse" | "destructive";
  children: React.ReactNode;
}) {
  return (
    <Button href={href} size={size} variant={variant} onClick={() => trackEvent(event, properties)}>
      {children}
    </Button>
  );
}
