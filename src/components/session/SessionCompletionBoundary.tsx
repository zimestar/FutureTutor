"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { requestSessionCompletionAction } from "@/lib/actions/session";

export function SessionCompletionBoundary({
  bookingId,
  locale,
  scheduledEndAt,
  startedAtLabel,
  scheduledEndLabel,
}: {
  bookingId: string;
  locale: string;
  scheduledEndAt: string;
  startedAtLabel: string;
  scheduledEndLabel: string;
}) {
  const t = useTranslations("sessionExperience");
  const router = useRouter();
  const deadline = new Date(scheduledEndAt).getTime();
  const [due, setDue] = useState(() => Date.now() >= deadline);
  const [state, action, pending] = useActionState(requestSessionCompletionAction, undefined);
  const requested = useRef(false);

  useEffect(() => {
    if (due) return;
    const delay = Math.min(Math.max(0, deadline - Date.now()), 2_147_483_647);
    const timer = window.setTimeout(() => setDue(true), delay);
    return () => window.clearTimeout(timer);
  }, [deadline, due]);

  useEffect(() => {
    if (!due || requested.current) return;
    requested.current = true;
    const formData = new FormData();
    formData.set("bookingId", bookingId);
    formData.set("locale", locale);
    startTransition(() => action(formData));
  }, [action, bookingId, due, locale]);

  useEffect(() => {
    if (state?.complete) router.refresh();
  }, [router, state?.complete]);

  if (!due) {
    return (
      <div className="rounded-xl border border-success/30 bg-success-light/40 p-6" role="status">
        <h2 className="text-xl font-extrabold text-text-primary">{t("started.title")}</h2>
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          {t("started.description", { startedAt: startedAtLabel, endTime: scheduledEndLabel })}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-blue/25 bg-blue-light/40 p-6" role="status" aria-live="polite">
      <h2 className="text-xl font-extrabold text-text-primary">{t("states.completionPending.title")}</h2>
      <p className="mt-3 text-sm leading-6 text-text-secondary">{t("states.completionPending.description")}</p>
      {state?.error && (
        <form action={action} className="mt-4">
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="locale" value={locale} />
          <p className="mb-3 text-sm font-semibold text-error">{t(`completion.errors.${state.error}`)}</p>
          <button type="submit" disabled={pending} className="min-h-11 rounded-md border border-blue bg-white px-5 py-2 text-sm font-bold text-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue disabled:opacity-50">
            {pending ? t("completion.checking") : t("completion.retry")}
          </button>
        </form>
      )}
      {!state?.error && <p className="mt-3 text-xs font-semibold text-text-muted">{pending ? t("completion.checking") : t("completion.authorityNote")}</p>}
    </div>
  );
}
