"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { containsPossibleContactInfo } from "@/lib/contactInfoWarning";

const MESSAGE_MAX_LENGTH = 4000;

/**
 * MESSAGING-MVP1B — the message composer. Client-side length/empty checks
 * are a UX courtesy only; the server (sendMessageAction -> messaging.ts's
 * sendMessage -> messageBodySchema) remains the sole authority and
 * re-validates independently regardless of what this component allows
 * through. The contact-info warning is purely informational — it is never
 * part of the disabled/blocked condition below, per the approved policy
 * ("non-blocking" is enforced structurally: nothing here reads
 * showContactWarning before calling onSend).
 *
 * MESSAGING-DUPLICATE-SEND-FIX1 — sendInFlightRef is the actual same-tick
 * concurrency guard: a ref update is synchronous and visible to the very
 * next invocation immediately, unlike the `sending` state, which only takes
 * effect after React re-renders. Two invocations fired in the same tick
 * (double-click, or Ctrl/Cmd+Enter racing a click) both read `sending ===
 * false` before either has committed a re-render, so `sending` alone cannot
 * prevent a second send from starting — the ref can, because it's mutated
 * before any `await`. `sending` remains purely a UX/rendering concern
 * (button label, disabled styling).
 *
 * clientMessageIdRef holds the idempotency token for the CURRENT logical
 * send attempt: generated lazily on first send, reused across any retry of
 * that same logical attempt (so a browser/network retry or a second
 * in-flight-blocked click of the same pending send carries the same key),
 * and cleared after a successful send or when the user edits the body
 * following a failure — either case starts a new logical message, which
 * must get a fresh key.
 */
export function MessageComposer({
  onSend,
  disabled,
  disabledReason,
  placeholder,
}: {
  onSend: (body: string, clientMessageId: string) => Promise<{ ok: boolean; reason?: string }>;
  disabled: boolean;
  disabledReason: string | null;
  placeholder: string;
}) {
  const t = useTranslations("messaging");
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sendInFlightRef = useRef(false);
  const clientMessageIdRef = useRef<string | null>(null);

  const trimmed = value.trim();
  const isEmpty = trimmed.length === 0;
  const isTooLong = value.length > MESSAGE_MAX_LENGTH;
  const showContactWarning = !isEmpty && containsPossibleContactInfo(value);

  function getOrCreateClientMessageId(): string {
    if (!clientMessageIdRef.current) {
      clientMessageIdRef.current = crypto.randomUUID();
    }
    return clientMessageIdRef.current;
  }

  function handleValueChange(next: string) {
    if (error) {
      // Editing after a failed attempt abandons that logical send — the
      // next attempt gets a fresh idempotency key rather than reusing one
      // now bound to different content than what it was created for.
      clientMessageIdRef.current = null;
      setError(null);
    }
    setValue(next);
  }

  async function handleSend() {
    if (sendInFlightRef.current || disabled || isEmpty || isTooLong) return;
    sendInFlightRef.current = true;
    setSending(true);
    setError(null);
    const clientMessageId = getOrCreateClientMessageId();
    try {
      const result = await onSend(value, clientMessageId);
      if (result.ok) {
        setValue("");
        clientMessageIdRef.current = null;
      } else {
        const reason = result.reason === "VALIDATION" || result.reason === "NOT_AUTHORIZED" || result.reason === "READ_ONLY" ? result.reason : "UNAVAILABLE";
        setError(t(`composer.error.${reason}`));
      }
    } finally {
      sendInFlightRef.current = false;
      setSending(false);
    }
  }

  if (disabled) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-text-secondary" data-testid="composer-read-only">
        {disabledReason ?? t("thread.readOnlyGeneric")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="message-composer">
      <textarea
        value={value}
        onChange={(e) => handleValueChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        maxLength={MESSAGE_MAX_LENGTH + 200}
        className="w-full resize-none rounded-md border border-neutral-300 bg-white px-4 py-3 text-[15px] text-navy outline-none transition-colors focus:border-blue"
        data-testid="composer-textarea"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void handleSend();
          }
        }}
      />

      <div className="flex items-center justify-between gap-3">
        <span className={isTooLong ? "text-xs font-semibold text-error" : "text-xs text-text-muted"} data-testid="char-counter">
          {value.length}/{MESSAGE_MAX_LENGTH}
        </span>
        <Button type="button" size="sm" disabled={sending || isEmpty || isTooLong} onClick={() => void handleSend()} data-testid="send-button">
          {sending ? t("composer.sending") : t("composer.send")}
        </Button>
      </div>

      {showContactWarning && (
        <p className="text-xs text-text-muted" data-testid="contact-info-warning">
          {t("composer.contactInfoWarning")}
        </p>
      )}

      {error && (
        <p className="text-xs font-semibold text-error" data-testid="send-error">
          {error}
        </p>
      )}
    </div>
  );
}
