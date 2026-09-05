/**
 * NOTIFICATION-CENTER1 — deep-link resolution for the in-app notification
 * center. Deliberately type-prefix-based (not an exhaustive switch over
 * every known `type` string) so a genuinely new/future notification type
 * (a future messaging NEW_MESSAGE event, or any other producer added
 * later) safely falls through to `null` (non-clickable, still readable —
 * see the mission's own "leave non-clickable" policy) rather than
 * throwing or guessing a destination from unknown data.
 *
 * Every destination here is either a fixed, always-safe route for the
 * authenticated viewer's OWN data (/tutor/dashboard, /tutor/payouts,
 * /tutor/quick-match — no id needed, no cross-user risk possible) or a
 * per-booking route (/session/<bookingId>) gated by that page's own
 * existing participant authorization — this function never grants access
 * on its own, it only ever proposes a destination that page will
 * independently re-authorize.
 *
 * Never parses notification body text — only ever reads the structured
 * `metadata` Json already written by the trusted server-side producer at
 * creation time (see each service's own notifyUser call site).
 */
export function resolveNotificationLink(type: string, metadata: unknown): string | null {
  const meta = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};

  if (
    (type.startsWith("booking.") || type.startsWith("payment.") || type.startsWith("session.")) &&
    typeof meta.bookingId === "string" &&
    meta.bookingId.length > 0
  ) {
    return `/session/${meta.bookingId}`;
  }
  if (type.startsWith("tutor_application.")) return "/tutor/dashboard";
  if (type === "tutor_transfer.completed") return "/tutor/payouts";
  if (type.startsWith("quickmatch.")) return "/tutor/quick-match";
  return null;
}

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string;
  /** ISO string, or null when unread. Never a raw Date across the server
   * action boundary. */
  readAt: string | null;
  createdAt: string;
  /** Pre-resolved server-side — the client never sees raw `metadata`
   * (which could, for a future producer, carry something not meant for
   * display) and never re-derives a link from anything but this field. */
  href: string | null;
}

export function toNotificationDto(row: {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
  metadata: unknown;
}): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    href: resolveNotificationLink(row.type, row.metadata),
  };
}
