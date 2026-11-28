"use client";

import { Fragment, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ArrowUp, Bot, RotateCcw, UserRound } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/**
 * ASSISTANT-1 — parent chat with the FutureTutor assistant. The conversation
 * lives only in this component's state (never stored server-side); answers
 * stream from /api/assistant as newline-delimited JSON.
 */
type Turn = { role: "user" | "assistant"; text: string };
type ErrorKey = "BUSY" | "FAILED" | "REFUSED" | "QUOTA" | "TOO_LONG";

const MAX_CHARS = 2000;

/** Renders plain-text answers: paragraphs, **bold**, and library/tutor links. */
function renderAnswer(text: string, locale: string): ReactNode {
  const linkPattern = new RegExp(`(/${locale}/(?:resources/library|find-tutors)[a-z0-9/-]*)`, "g");
  // The model sometimes wraps a path in [..], (..) or a Markdown link: keep only the path.
  const cleaned = text
    .replace(new RegExp(`\\[([^\\]\\n]*)\\]\\((/${locale}/[a-z0-9/-]+)\\)`, "g"), (_m, label: string, path: string) => (label.trim() && label.trim() !== path ? `${label.trim()} — ${path}` : path))
    .replace(new RegExp(`[\\[(](/${locale}/(?:resources/library|find-tutors)[a-z0-9/-]*)[\\])]`, "g"), "$1");
  return cleaned.split(/\n{2,}/).map((paragraph, pIndex) => (
    <p key={pIndex} className="whitespace-pre-wrap">
      {paragraph.split(linkPattern).map((part, index) => {
        if (index % 2 === 1) {
          const href = part.replace(new RegExp(`^/${locale}`), "") || "/";
          return (
            <Link key={index} href={href} className="font-semibold text-blue underline underline-offset-2 hover:text-blue-hover">
              {part}
            </Link>
          );
        }
        return part.split(/(\*\*[^*]+\*\*)/g).map((chunk, cIndex) =>
          chunk.startsWith("**") && chunk.endsWith("**") ? <strong key={`${index}-${cIndex}`}>{chunk.slice(2, -2)}</strong> : <Fragment key={`${index}-${cIndex}`}>{chunk}</Fragment>
        );
      })}
    </p>
  ));
}

export function AssistantChat({ locale, initialRemaining }: { locale: "fr" | "en"; initialRemaining: number }) {
  const t = useTranslations("assistant");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(initialRemaining);
  const [error, setError] = useState<ErrorKey | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const examples = t.raw("examples") as string[];

  const scrollToEnd = () => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || busy) return;
    if (trimmed.length > MAX_CHARS) return setError("TOO_LONG");
    if (remaining <= 0) return setError("QUOTA");
    setError(null);
    setBusy(true);
    const history = turns;
    setTurns([...history, { role: "user", text: trimmed }, { role: "assistant", text: "" }]);
    setDraft("");
    setTimeout(scrollToEnd, 50);

    const appendToAnswer = (chunk: string) =>
      setTurns((current) => {
        const next = [...current];
        next[next.length - 1] = { role: "assistant", text: next[next.length - 1].text + chunk };
        return next;
      });
    const dropPendingTurn = () => setTurns((current) => current.slice(0, -2));

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, question: trimmed, history }),
      });
      if (!response.ok || !response.body) {
        dropPendingTurn();
        setDraft(trimmed);
        if (response.status === 429) {
          setRemaining(0);
          setError("QUOTA");
        } else setError("FAILED");
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      while (!finished) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as { type: string; text?: string; remaining?: number; code?: string };
          if (event.type === "text" && event.text) appendToAnswer(event.text);
          else if (event.type === "done") {
            if (typeof event.remaining === "number") setRemaining(event.remaining);
            finished = true;
          } else if (event.type === "refused") {
            dropPendingTurn();
            setDraft(trimmed);
            setError("REFUSED");
            finished = true;
          } else if (event.type === "error") {
            dropPendingTurn();
            setDraft(trimmed);
            setError(event.code === "BUSY" ? "BUSY" : "FAILED");
            finished = true;
          }
        }
      }
    } catch {
      dropPendingTurn();
      setDraft(trimmed);
      setError("FAILED");
    } finally {
      setBusy(false);
      setTimeout(scrollToEnd, 50);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(draft);
  }

  const outOfQuestions = remaining <= 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={cn("rounded-full px-3 py-1 text-sm font-bold", outOfQuestions ? "bg-coral-50 text-[#c2410c]" : "bg-mint-50 text-emerald-700")} data-testid="assistant-remaining">
          {t("remaining", { count: remaining })}
        </p>
        {turns.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => { setTurns([]); setError(null); }} disabled={busy}>
            <RotateCcw className="size-4" aria-hidden="true" /> {t("newChat")}
          </Button>
        )}
      </div>

      {turns.length === 0 && !outOfQuestions && (
        <div className="rounded-3xl border border-lilac-100 bg-lilac-50 p-5 sm:p-6">
          <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-[#6d5bd0]">{t("examplesTitle")}</p>
          <ul className="mt-3 grid gap-2 md:grid-cols-3">
            {examples.map((example) => (
              <li key={example}>
                <button type="button" onClick={() => void ask(example)} disabled={busy} className="motion-lift h-full w-full rounded-2xl bg-white p-4 text-left text-sm font-semibold leading-6 text-navy shadow-(--shadow-card) hover:shadow-(--shadow-card-hover)">
                  {example}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {turns.length > 0 && (
        <ol className="flex flex-col gap-4" aria-live="polite">
          {turns.map((turn, index) => (
            <li key={index} className={cn("flex gap-3", turn.role === "user" && "flex-row-reverse")}>
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-2xl", turn.role === "user" ? "bg-blue text-white" : "bg-lilac text-white")} aria-hidden="true">
                {turn.role === "user" ? <UserRound className="size-5" /> : <Bot className="size-5" />}
              </span>
              <div className={cn("min-w-0 max-w-[85%] rounded-3xl px-5 py-4 text-[15px] leading-7", turn.role === "user" ? "rounded-tr-md bg-blue text-white" : "rounded-tl-md border border-border bg-white text-navy")}>
                <p className="sr-only">{turn.role === "user" ? t("you") : t("assistant")}</p>
                {turn.role === "assistant" ? (
                  turn.text ? <div className="flex flex-col gap-3">{renderAnswer(turn.text, locale)}</div> : <span className="inline-flex items-center gap-2 text-text-muted"><span className="motion-live size-2 rounded-full bg-lilac" />{t("sending")}</span>
                ) : (
                  <p className="whitespace-pre-wrap">{turn.text}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      <div ref={endRef} />

      {error && (
        <p role="alert" className="rounded-2xl border border-coral-100 bg-coral-50 px-4 py-3 text-sm font-semibold text-navy">
          {t(`errors.${error}`)}
        </p>
      )}

      {outOfQuestions ? (
        <div className="rounded-3xl bg-blue p-6 text-white">
          <p className="text-lg font-extrabold">{t("quotaTitle")}</p>
          <p className="mt-1 text-white/85">{t("quotaText")}</p>
          <Button href="/dashboard/find-tutors" variant="inverse" className="mt-4">{t("quotaCta")}</Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="rounded-3xl border border-border bg-white p-3 shadow-(--shadow-card) focus-within:border-blue">
          <label htmlFor="assistant-question" className="sr-only">{t("inputLabel")}</label>
          <textarea
            id="assistant-question"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void ask(draft);
              }
            }}
            maxLength={MAX_CHARS}
            rows={3}
            placeholder={t("placeholder")}
            className="block w-full resize-none rounded-2xl px-3 py-2 text-[15px] leading-7 text-navy outline-none placeholder:text-text-muted"
          />
          <div className="flex items-center justify-between gap-3 px-2 pb-1">
            <span className="text-xs text-text-muted">{draft.length}/{MAX_CHARS}</span>
            <Button type="submit" disabled={busy || !draft.trim()} data-testid="assistant-send">
              {busy ? t("sending") : t("send")} <ArrowUp className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </form>
      )}

      <p className="text-xs leading-5 text-text-muted">{t("disclaimer")}</p>
    </div>
  );
}
