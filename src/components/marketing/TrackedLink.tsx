"use client";

import { Link } from "@/i18n/navigation";
import { trackEvent } from "@/lib/analytics";
import type { AnalyticsEventName, AnalyticsEventPropertiesMap } from "@/lib/analytics";

/**
 * DATA-2 — a plain inline `Link` that also fires a trackEvent on click.
 * Sibling to TrackedCtaButton for CTAs styled as inline text links (e.g. a
 * "How It Works" link inside a hero) rather than a filled/outlined button —
 * same Server-Component-boundary reason TrackedCtaButton exists.
 */
export function TrackedLink<E extends AnalyticsEventName>({
  href,
  event,
  properties,
  className,
  children,
}: {
  href: string;
  event: E;
  properties: AnalyticsEventPropertiesMap[E];
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={className} onClick={() => trackEvent(event, properties)}>
      {children}
    </Link>
  );
}
