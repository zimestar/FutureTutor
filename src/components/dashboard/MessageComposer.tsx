"use client";

import { useState } from "react";
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
 */
export function MessageComposer({
  onSend,
  disabled,
  disabledReason,
  placeholder,
}: {
  onSend: (body: string) => Promise<{ ok: boolean; reason?: string }>;
  disabled: boolean;
  disabledReason: string | null;
  placeholder: string;
}) {
  const t = useTranslations("messaging");
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = value.trim();
  const isEmpty = trimmed.length === 0;
  const isTooLong = value.length > MESSAGE_MAX_LENGTH;
  const showContactWarning = !isEmpty && containsPossibleContactInfo(value);

  async function handleSend() {
    if (sending || disabled || isEmpty || isTooLong) return;
    setSending(true);
    setError(null);
    try {
      const result = await onSend(value);
      if (result.ok) {
        setValue("");
      } else {
        const reason = result.reason === "VALIDATION" || result.reason === "NOT_AUTHORIZED" || result.reason === "READ_ONLY" ? result.reason : "UNAVAILABLE";
        setError(t(`composer.error.${reason}`));
      }
    } finally {
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
        onChange={(e) => setValue(e.target.value)}
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
