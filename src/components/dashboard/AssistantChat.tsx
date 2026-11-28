"use client";

import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ArrowUp, Camera, RotateCcw, UserRound, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/Button";
import { AssistantFigure, parseFigure } from "@/components/assistant/AssistantFigure";
import { IkaAvatar } from "@/components/assistant/IkaAvatar";
import { cn } from "@/lib/utils";

/**
 * ASSISTANT-1/2 — chat with Ika, the FutureTutor assistant. The conversation
 * (photos included) lives only in this component's state, never server-side;
 * answers stream from /api/assistant as newline-delimited JSON. Figures come
 * as ```figure JSON blocks and are drawn by AssistantFigure.
 */
type Turn = { role: "user" | "assistant"; text: string; imageUrl?: string };
type ErrorKey = "BUSY" | "FAILED" | "REFUSED" | "QUOTA" | "TOO_LONG" | "PHOTO";
type PreparedImage = { mediaType: "image/jpeg"; data: string; previewUrl: string };

const MAX_CHARS = 2000;
const MAX_IMAGE_SIDE = 1568;

/** Resizes a photo in the browser (longest side 1568 px, JPEG) before it is sent. */
async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) throw new Error("not an image");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no canvas");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.85));
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return { mediaType: "image/jpeg", data, previewUrl: URL.createObjectURL(blob) };
}

/** Renders plain text: paragraphs, **bold**, and library/tutor links. */
function renderText(text: string, locale: string, keyPrefix: string): ReactNode[] {
  const linkPattern = new RegExp(`(/${locale}/(?:resources/library|find-tutors)[a-z0-9/-]*)`, "g");
  // The model sometimes wraps a path in [..], (..) or a Markdown link: keep only the path.
  const cleaned = text
    .replace(new RegExp(`\\[([^\\]\\n]*)\\]\\((/${locale}/[a-z0-9/-]+)\\)`, "g"), (_m, label: string, path: string) => (label.trim() && label.trim() !== path ? `${label.trim()} — ${path}` : path))
    .replace(new RegExp(`[\\[(](/${locale}/(?:resources/library|find-tutors)[a-z0-9/-]*)[\\])]`, "g"), "$1");
  return cleaned
    .split(/\n{2,}/)
    .filter((paragraph) => paragraph.trim())
    .map((paragraph, pIndex) => (
      <p key={`${keyPrefix}-${pIndex}`} className="whitespace-pre-wrap">
        {paragraph.trim().split(linkPattern).map((part, index) => {
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

/** Splits an answer into text and ```figure blocks; an unfinished block shows a placeholder. */
function renderAnswer(text: string, locale: string, drawingLabel: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /```figure[^\n]*\n([\s\S]*?)```/g;
  let last = 0;
  let index = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    out.push(...renderText(text.slice(last, match.index), locale, `t${index}`));
    const spec = parseFigure(match[1].trim());
    if (spec) out.push(<AssistantFigure key={`f${index}`} spec={spec} />);
    last = pattern.lastIndex;
    index += 1;
  }
  const rest = text.slice(last);
  const open = rest.indexOf("```figure");
  if (open >= 0) {
    out.push(...renderText(rest.slice(0, open), locale, `t${index}`));
    out.push(
      <p key="pending" className="inline-flex items-center gap-2 rounded-2xl border border-dashed border-lilac-100 bg-lilac-50 px-4 py-3 text-sm font-semibold text-[#6d5bd0]">
        <span className="motion-live size-2 rounded-full bg-lilac" />
        {drawingLabel}
      </p>
    );
  } else out.push(...renderText(rest, locale, `t${index}`));
  return out;
}

export function AssistantChat({ locale, initialRemaining }: { locale: "fr" | "en"; initialRemaining: number }) {
  const t = useTranslations("assistant");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [photo, setPhoto] = useState<PreparedImage | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(initialRemaining);
  const [error, setError] = useState<ErrorKey | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const examples = t.raw("examples") as string[];

  // Free the photo previews when the chat goes away.
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const scrollToEnd = () => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });

  async function onPhotoPicked(file: File | undefined) {
    if (!file) return;
    setError(null);
    setPreparing(true);
    try {
      const prepared = await prepareImage(file);
      urls.current.push(prepared.previewUrl);
      setPhoto(prepared);
    } catch {
      setError("PHOTO");
    } finally {
      setPreparing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function ask(question: string, image: PreparedImage | null = photo) {
    const trimmed = question.trim();
    if ((!trimmed && !image) || busy) return;
    if (trimmed.length > MAX_CHARS) return setError("TOO_LONG");
    if (remaining <= 0) return setError("QUOTA");
    setError(null);
    setBusy(true);
    const history = turns.map((turn) => ({ role: turn.role, text: turn.text || (turn.imageUrl ? t("photoSent") : "") }));
    setTurns([...turns, { role: "user", text: trimmed, imageUrl: image?.previewUrl }, { role: "assistant", text: "" }]);
    setDraft("");
    setPhoto(null);
    setTimeout(scrollToEnd, 50);

    const appendToAnswer = (chunk: string) =>
      setTurns((current) => {
        const next = [...current];
        next[next.length - 1] = { role: "assistant", text: next[next.length - 1].text + chunk };
        return next;
      });
    const restore = (key: ErrorKey) => {
      setTurns((current) => current.slice(0, -2));
      setDraft(trimmed);
      setPhoto(image);
      setError(key);
    };

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, question: trimmed, history, image: image ? { mediaType: image.mediaType, data: image.data } : undefined }),
      });
      if (!response.ok || !response.body) {
        if (response.status === 429) setRemaining(0);
        restore(response.status === 429 ? "QUOTA" : "FAILED");
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
            restore("REFUSED");
            finished = true;
          } else if (event.type === "error") {
            restore(event.code === "BUSY" ? "BUSY" : "FAILED");
            finished = true;
          }
        }
      }
    } catch {
      restore("FAILED");
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
  const canSend = !busy && !preparing && (Boolean(draft.trim()) || Boolean(photo));

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
          <div className="flex items-start gap-3">
            <IkaAvatar className="size-12 shrink-0 motion-float" />
            <div>
              <p className="text-lg font-extrabold text-navy">{t("hello")}</p>
              <p className="mt-1 text-sm leading-6 text-text-secondary">{t("helloText")}</p>
            </div>
          </div>
          <p className="mt-5 text-sm font-extrabold uppercase tracking-[0.12em] text-[#6d5bd0]">{t("examplesTitle")}</p>
          <ul className="mt-3 grid gap-2 md:grid-cols-3">
            {examples.map((example) => (
              <li key={example}>
                <button type="button" onClick={() => void ask(example, null)} disabled={busy} className="motion-lift h-full w-full rounded-2xl bg-white p-4 text-left text-sm font-semibold leading-6 text-navy shadow-(--shadow-card) hover:shadow-(--shadow-card-hover)">
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
              {turn.role === "user" ? (
                <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-blue text-white" aria-hidden="true">
                  <UserRound className="size-5" />
                </span>
              ) : (
                <IkaAvatar className="size-10 shrink-0" thinking={busy && index === turns.length - 1 && !turn.text} />
              )}
              <div className={cn("min-w-0 max-w-[85%] rounded-3xl px-5 py-4 text-[15px] leading-7", turn.role === "user" ? "rounded-tr-md bg-blue text-white" : "rounded-tl-md border border-border bg-white text-navy")}>
                <p className={cn("text-xs font-extrabold uppercase tracking-[0.1em]", turn.role === "user" ? "sr-only" : "mb-1 text-[#6d5bd0]")}>{turn.role === "user" ? t("you") : t("assistant")}</p>
                {turn.role === "assistant" ? (
                  turn.text ? (
                    <div className="flex flex-col gap-3">{renderAnswer(turn.text, locale, t("drawing"))}</div>
                  ) : (
                    <span className="inline-flex items-center gap-2 text-text-muted"><span className="motion-live size-2 rounded-full bg-lilac" />{t("thinking")}</span>
                  )
                ) : (
                  <div className="flex flex-col gap-2">
                    {turn.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- local blob preview, never uploaded anywhere else
                      <img src={turn.imageUrl} alt={t("photoAlt")} className="max-h-64 w-auto rounded-2xl border-2 border-white/40 object-contain" />
                    )}
                    {turn.text && <p className="whitespace-pre-wrap">{turn.text}</p>}
                  </div>
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
          {photo && (
            <div className="mb-2 flex items-center gap-3 rounded-2xl bg-lilac-50 p-2 pr-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
              <img src={photo.previewUrl} alt={t("photoAlt")} className="size-16 rounded-xl object-cover" />
              <p className="min-w-0 flex-1 text-sm font-semibold text-navy">{t("photoReady")}</p>
              <button type="button" onClick={() => setPhoto(null)} className="flex size-8 items-center justify-center rounded-full bg-white text-navy hover:bg-coral-50" aria-label={t("photoRemove")}>
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          )}
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
            placeholder={photo ? t("photoPlaceholder") : t("placeholder")}
            className="block w-full resize-none rounded-2xl px-3 py-2 text-[15px] leading-7 text-navy outline-none placeholder:text-text-muted"
          />
          <div className="flex items-center justify-between gap-3 px-1 pb-1">
            <div className="flex items-center gap-3">
              <input ref={fileRef} type="file" accept="image/*" className="sr-only" id="assistant-photo" onChange={(event) => void onPhotoPicked(event.target.files?.[0])} data-testid="assistant-photo-input" />
              <label
                htmlFor="assistant-photo"
                className={cn("inline-flex cursor-pointer items-center gap-2 rounded-full border border-lilac-100 bg-lilac-50 px-3 py-2 text-sm font-bold text-[#6d5bd0] hover:bg-lilac-100", (busy || preparing) && "pointer-events-none opacity-60")}
              >
                <Camera className="size-4" aria-hidden="true" /> {preparing ? t("photoPreparing") : t("photoButton")}
              </label>
              <span className="hidden text-xs text-text-muted sm:inline">{draft.length}/{MAX_CHARS}</span>
            </div>
            <Button type="submit" disabled={!canSend} data-testid="assistant-send">
              {busy ? t("sending") : t("send")} <ArrowUp className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </form>
      )}

      <p className="text-xs leading-5 text-text-muted">{t("disclaimer")}</p>
    </div>
  );
}
