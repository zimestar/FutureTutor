"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { refreshSessionLifecycleAction } from "@/lib/actions/session";
import { graceRemainingParts } from "@/lib/sessionPresentation";

export function SessionGraceCountdown({ bookingId, locale, graceDeadlineAt }: { bookingId: string; locale: string; graceDeadlineAt: string }) {
  const t = useTranslations("sessionExperience.grace");
  const router = useRouter();
  const deadline = new Date(graceDeadlineAt);
  const [now, setNow] = useState(() => new Date());
  const [state, refreshAction] = useActionState(refreshSessionLifecycleAction, undefined);
  const requested = useRef(false);
  const remaining = graceRemainingParts(deadline, now);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!remaining.expired || requested.current) return;
    requested.current = true;
    const formData = new FormData();
    formData.set("bookingId", bookingId);
    formData.set("locale", locale);
    startTransition(() => refreshAction(formData));
  }, [bookingId, locale, refreshAction, remaining.expired]);

  useEffect(() => {
    if (state?.complete) router.refresh();
  }, [router, state?.complete]);

  const display = `${String(remaining.minutes).padStart(2, "0")}:${String(remaining.seconds).padStart(2, "0")}`;

  return (
    <div className="rounded-lg border border-blue/20 bg-blue-light/50 p-4" aria-label={t("regionLabel")}>
      <p className="text-xs font-bold uppercase tracking-wide text-blue">{t("remainingLabel")}</p>
      <p className="mt-1 font-mono text-2xl font-extrabold tabular-nums text-navy" aria-hidden="true">{display}</p>
      <p className="sr-only">{remaining.expired ? t("expiredAccessible") : t("remainingAccessible", { minutes: remaining.minutes })}</p>
      <p className="mt-2 text-xs leading-5 text-text-secondary">{remaining.expired ? t("refreshing") : t("authorityNote")}</p>
    </div>
  );
}
