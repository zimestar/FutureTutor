"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { recordSessionCheckInAction } from "@/lib/actions/session";
import { sessionCheckInControls, shouldRefreshSessionAfterCheckIn, studentCheckInLabelKind } from "@/lib/sessionPresentation";

export function SessionCheckInPanel({
  bookingId,
  locale,
  learnerFirstName,
  viewerRole,
  allowedActions,
}: {
  bookingId: string;
  locale: string;
  learnerFirstName: string;
  viewerRole: string;
  allowedActions: Array<"CHECK_IN_AS_TUTOR" | "CHECK_IN_AS_STUDENT" | "REQUEST_INTERRUPTION">;
}) {
  const t = useTranslations("sessionExperience");
  const router = useRouter();
  const [state, action, pending] = useActionState(recordSessionCheckInAction, undefined);

  useEffect(() => {
    if (shouldRefreshSessionAfterCheckIn(state)) router.refresh();
  }, [router, state]);

  const { tutor: canCheckInTutor, student: canCheckInStudent } = sessionCheckInControls(allowedActions);
  if (!canCheckInTutor && !canCheckInStudent) return null;

  const labelKind = studentCheckInLabelKind(viewerRole);
  const studentActionLabel =
    labelKind === "guardian"
      ? t("actions.guardianStudent", { name: learnerFirstName })
      : labelKind === "tutor"
        ? t("actions.tutorStudent", { name: learnerFirstName })
        : t("actions.studentSelf");

  return (
    <div aria-labelledby="session-check-in-title">
      <h2 id="session-check-in-title" className="text-lg font-extrabold text-text-primary">{t("checkIn.title")}</h2>
      <p className="mt-1 text-sm leading-6 text-text-secondary">{t("checkIn.description")}</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {canCheckInTutor && (
          <form action={action}>
            <input type="hidden" name="bookingId" value={bookingId} />
            <input type="hidden" name="participantRole" value="TUTOR" />
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" disabled={pending} className="min-h-11 w-full rounded-md bg-blue px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue disabled:cursor-not-allowed disabled:opacity-50">
              {pending ? t("actions.recording") : t("actions.tutorSelf")}
            </button>
          </form>
        )}
        {canCheckInStudent && (
          <form action={action}>
            <input type="hidden" name="bookingId" value={bookingId} />
            <input type="hidden" name="participantRole" value="STUDENT" />
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" disabled={pending} className="min-h-11 w-full rounded-md border border-blue bg-white px-5 py-3 text-sm font-bold text-blue transition-colors hover:bg-blue/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue disabled:cursor-not-allowed disabled:opacity-50">
              {pending ? t("actions.recording") : studentActionLabel}
            </button>
          </form>
        )}
      </div>
      <div aria-live="polite" className="mt-3 min-h-6 text-sm font-semibold">
        {state?.success && <p className="text-success">{t("result.recorded")}</p>}
        {state?.error && <p className="text-error">{t(`errors.${state.error}`)}</p>}
      </div>
    </div>
  );
}
