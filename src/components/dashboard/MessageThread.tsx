"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Feedback";
import { MessageComposer } from "@/components/dashboard/MessageComposer";
import {
  getNewerMessagesAction,
  getOlderMessagesAction,
  markConversationReadAction,
  sendMessageAction,
} from "@/lib/actions/messaging";
import type { MessageDto, ConversationSessionContextDto } from "@/lib/messagingPresentation";

const POLL_INTERVAL_MS = 7000;
const NEAR_BOTTOM_THRESHOLD_PX = 120;

/**
 * MESSAGING-MVP1B — the interactive thread: polling (5-10s, only while this
 * component is mounted — i.e. only while the thread is open), older-message
 * pagination, scroll behavior, and the composer. No WebSockets/SSE/realtime
 * vendor — plain interval polling via Server Actions, mirroring this app's
 * existing client-fetch conventions (NotificationBell).
 */
export function MessageThread({
  conversationId,
  title,
  initialMessages,
  initialCursor,
  ownUserId,
  participantNames,
  sessionContext,
  subjectLabel,
  canSend,
  sendBlockedReason,
  locale,
}: {
  conversationId: string;
  title: string;
  initialMessages: MessageDto[];
  initialCursor: string | null;
  ownUserId: string;
  participantNames: Record<string, string>;
  sessionContext: ConversationSessionContextDto | null;
  subjectLabel: string | null;
  canSend: boolean;
  sendBlockedReason: string | null;
  locale: string;
}) {
  const t = useTranslations("messaging");
  const [messages, setMessages] = useState(initialMessages);
  const [olderCursor, setOlderCursor] = useState(initialCursor);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [showNewMessagesBanner, setShowNewMessagesBanner] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const pollInFlightRef = useRef(false);
  const latestCreatedAtRef = useRef<string | null>(initialMessages.length > 0 ? initialMessages[initialMessages.length - 1]!.createdAt : null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  // Initial open: scroll to newest.
  useEffect(() => {
    scrollToBottom("auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom < NEAR_BOTTOM_THRESHOLD_PX;
    if (isNearBottomRef.current) setShowNewMessagesBanner(false);
  }

  // Polling — only while mounted (thread open), skips a tick if the
  // previous one is still in flight, and skips fetching (not scheduling)
  // while the page/tab is hidden.
  useEffect(() => {
    const interval = setInterval(async () => {
      if (pollInFlightRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (!latestCreatedAtRef.current) return;

      pollInFlightRef.current = true;
      try {
        const newer = await getNewerMessagesAction(conversationId, latestCreatedAtRef.current);
        if (newer.length === 0) return;

        setMessages((prev) => [...prev, ...newer]);
        latestCreatedAtRef.current = newer[newer.length - 1]!.createdAt;

        const anyFromOthers = newer.some((m) => m.senderUserId !== ownUserId);
        if (isNearBottomRef.current) {
          requestAnimationFrame(() => scrollToBottom("smooth"));
          if (anyFromOthers) void markConversationReadAction(conversationId);
        } else if (anyFromOthers) {
          setShowNewMessagesBanner(true);
        }
      } finally {
        pollInFlightRef.current = false;
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [conversationId, ownUserId, scrollToBottom]);

  async function handleLoadOlder() {
    if (!olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const previousScrollHeight = el?.scrollHeight ?? 0;
    try {
      const page = await getOlderMessagesAction(conversationId, olderCursor);
      setMessages((prev) => [...page.items.slice().reverse(), ...prev]);
      setOlderCursor(page.nextCursor);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - previousScrollHeight;
      });
    } finally {
      setLoadingOlder(false);
    }
  }

  async function handleSend(body: string) {
    const result = await sendMessageAction(conversationId, body);
    if (result.ok) {
      setMessages((prev) => [...prev, result.message]);
      latestCreatedAtRef.current = result.message.createdAt;
      requestAnimationFrame(() => scrollToBottom("smooth"));
      return { ok: true };
    }
    return { ok: false, reason: result.reason };
  }

  const dateTimeFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  const disabledReason = !canSend
    ? sendBlockedReason === "OUTSIDE_COMMUNICATION_WINDOW"
      ? t("thread.readOnlyWindow")
      : t("thread.readOnlyGeneric")
    : null;

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <PageHeader title={title} />

      {sessionContext && sessionContext.kind !== "none" && sessionContext.startAt && (
        <div data-testid={sessionContext.kind === "upcoming" ? "upcoming-session-banner" : "recent-session-banner"}>
          <Alert tone="info" className="mt-4">
            <p className="font-bold">{sessionContext.kind === "upcoming" ? t("thread.upcomingSession") : t("thread.recentSession")}</p>
            <p>
              {subjectLabel} — {dateTimeFormatter.format(new Date(sessionContext.startAt))}
            </p>
          </Alert>
        </div>
      )}

      <div className="mt-4 flex min-h-0 flex-1 flex-col rounded-xl border border-neutral-200 bg-white">
        <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto p-4" data-testid="message-scroll-area">
          {olderCursor && (
            <div className="mb-3 text-center">
              <button
                type="button"
                onClick={() => void handleLoadOlder()}
                disabled={loadingOlder}
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-slate hover:border-blue hover:text-blue disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="load-earlier"
              >
                {loadingOlder ? t("thread.loading") : t("thread.loadEarlier")}
              </button>
            </div>
          )}

          {messages.length === 0 ? (
            <p className="py-12 text-center text-sm text-text-muted" data-testid="thread-empty-state">
              {t("thread.emptyFirstMessage")}
            </p>
          ) : (
            <ul className="flex flex-col gap-3" data-testid="message-list">
              {messages.map((message) => {
                const isOwn = message.senderUserId === ownUserId;
                const senderName = isOwn ? t("thread.you") : (participantNames[message.senderUserId] ?? t("thread.otherParticipant"));
                return (
                  <li key={message.id} className={isOwn ? "flex flex-col items-end" : "flex flex-col items-start"} data-testid="message-bubble">
                    <span className="text-xs font-semibold text-text-muted">{senderName}</span>
                    <div
                      className={
                        isOwn
                          ? "mt-1 max-w-[80%] rounded-lg rounded-tr-sm bg-blue px-4 py-2 text-white"
                          : "mt-1 max-w-[80%] rounded-lg rounded-tl-sm border border-neutral-200 bg-neutral-50 text-navy px-4 py-2"
                      }
                    >
                      <p className="whitespace-pre-wrap break-words text-[15px]">{message.body}</p>
                    </div>
                    <span className="mt-0.5 text-[11px] text-text-muted">{dateTimeFormatter.format(new Date(message.createdAt))}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {showNewMessagesBanner && (
          <div className="border-t border-neutral-200 p-2 text-center">
            <button
              type="button"
              onClick={() => {
                scrollToBottom("smooth");
                setShowNewMessagesBanner(false);
                void markConversationReadAction(conversationId);
              }}
              className="text-sm font-semibold text-blue hover:underline"
              data-testid="new-messages-indicator"
            >
              {t("thread.newMessages")}
            </button>
          </div>
        )}

        <div className="border-t border-neutral-200 p-3">
          <MessageComposer onSend={handleSend} disabled={!canSend} disabledReason={disabledReason} placeholder={t("composer.placeholder")} />
        </div>
      </div>
    </div>
  );
}
