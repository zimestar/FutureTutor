import { Badge } from "@/components/ui/Badge";
import { Surface } from "@/components/ui/Surface";
import { Link } from "@/i18n/navigation";
import type { ConversationSessionContextDto } from "@/lib/messagingPresentation";

/**
 * MESSAGING-MVP1B — a single conversation row on /messages. Server
 * component (no interactivity needed for the list itself) — every string
 * is resolved by the caller so this stays role-agnostic.
 */
export function ConversationListItem({
  conversationId,
  primaryLabel,
  secondaryLabel,
  lastMessagePreview,
  lastMessageAt,
  unreadCount,
  sessionContext,
  subjectLabel,
  locale,
  noMessagesLabel,
}: {
  conversationId: string;
  primaryLabel: string;
  secondaryLabel: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  sessionContext: ConversationSessionContextDto;
  subjectLabel: string | null;
  locale: string;
  noMessagesLabel: string;
}) {
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const isUnread = unreadCount > 0;

  return (
    <li>
      <Link
        href={`/messages/${conversationId}`}
        className="block rounded-lg border border-neutral-200 bg-white p-4 transition-colors hover:border-blue"
        data-testid="conversation-list-item"
      >
        <Surface as="div" padding="none" className="border-0 bg-transparent shadow-none">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={isUnread ? "font-bold text-navy" : "font-semibold text-navy"}>{primaryLabel}</p>
              {secondaryLabel && <p className="mt-0.5 text-xs text-text-muted">{secondaryLabel}</p>}
              <p className={isUnread ? "mt-1 truncate text-sm font-semibold text-navy" : "mt-1 truncate text-sm text-text-secondary"}>
                {lastMessagePreview ?? noMessagesLabel}
              </p>
              {subjectLabel && sessionContext.kind !== "none" && (
                <p className="mt-1 text-xs text-text-muted" data-testid="session-context-chip">
                  {subjectLabel}
                  {sessionContext.startAt && ` — ${new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(sessionContext.startAt))}`}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {lastMessageAt && <span className="text-xs text-text-muted">{dateFormatter.format(new Date(lastMessageAt))}</span>}
              {isUnread && (
                <span data-testid="unread-badge">
                  <Badge variant="blue">{unreadCount > 99 ? "99+" : unreadCount}</Badge>
                </span>
              )}
            </div>
          </div>
        </Surface>
      </Link>
    </li>
  );
}
