"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { acceptTutorInvitationAction, declineTutorInvitationAction } from "@/lib/actions/tutorInvitations";

export function TutorInvitationCard({
  tutorInvitationId,
  subjectLabel,
  levelLabel,
  modeLabel,
  requestedStartAt,
  durationMinutes,
  payoutCents,
  currency,
  // Dispatch location only (§5a) — city/province/postal-prefix, never the
  // full address. Undefined for online requests.
  dispatchLocation,
  notes,
}: {
  tutorInvitationId: string;
  subjectLabel: string;
  levelLabel: string;
  modeLabel: string;
  requestedStartAt: string;
  durationMinutes: number;
  payoutCents: number;
  currency: string;
  dispatchLocation?: { city: string | null; province: string | null; postalCodePrefix: string | null };
  notes: string | null;
}) {
  const t = useTranslations("quickMatch.tutorInvitation");
  const locale = useLocale();
  const [acceptState, acceptAction, acceptPending] = useActionState(acceptTutorInvitationAction, undefined);
  const [declineState, declineAction, declinePending] = useActionState(declineTutorInvitationAction, undefined);

  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const currencyFormatter = new Intl.NumberFormat(locale, { style: "currency", currency });

  const pending = acceptPending || declinePending;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4" data-testid="tutor-invitation-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-navy">
            {subjectLabel} · {levelLabel} · {modeLabel}
          </p>
          <p className="mt-1 text-sm text-slate">
            {dateFormatter.format(new Date(requestedStartAt))} · {t("duration", { minutes: durationMinutes })}
          </p>
          {dispatchLocation && (
            <p className="mt-1 text-sm text-slate" data-testid="dispatch-location">
              {[dispatchLocation.city, dispatchLocation.province, dispatchLocation.postalCodePrefix]
                .filter(Boolean)
                .join(", ")}
            </p>
          )}
          {notes && <p className="mt-1 text-sm italic text-slate">&ldquo;{notes}&rdquo;</p>}
        </div>
        <p className="text-lg font-bold text-navy" data-testid="invitation-payout">
          {currencyFormatter.format(payoutCents / 100)}
        </p>
      </div>

      {acceptState?.error && (
        <p role="alert" className="mt-3 rounded-md bg-error-light px-3 py-2 text-sm font-semibold text-error">
          {acceptState.error}
        </p>
      )}
      {declineState?.error && (
        <p role="alert" className="mt-3 rounded-md bg-error-light px-3 py-2 text-sm font-semibold text-error">
          {declineState.error}
        </p>
      )}

      <div className="mt-4 flex gap-3">
        <form action={acceptAction} className="flex-1">
          <input type="hidden" name="tutorInvitationId" value={tutorInvitationId} />
          <button
            type="submit"
            data-testid="accept-invitation"
            disabled={pending}
            className="h-11 w-full rounded-md bg-blue text-sm font-bold text-white transition-colors hover:bg-blue/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {acceptPending ? t("accepting") : t("acceptCta")}
          </button>
        </form>
        <form action={declineAction}>
          <input type="hidden" name="tutorInvitationId" value={tutorInvitationId} />
          <button
            type="submit"
            data-testid="decline-invitation"
            disabled={pending}
            className="h-11 rounded-md border border-neutral-300 px-5 text-sm font-semibold text-slate transition-colors hover:border-error hover:text-error disabled:cursor-not-allowed disabled:opacity-50"
          >
            {declinePending ? t("declining") : t("declineCta")}
          </button>
        </form>
      </div>
    </div>
  );
}
