"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { acceptTutorAgreementAction } from "@/lib/actions/tutorProfile";

/** FG-LEGAL2 — shown on the APPROVED tutor dashboard only when
 * tutorAgreementAcceptedAt is still null (a tutor approved before the
 * Tutor Agreement existed, or who otherwise never accepted it). Existing
 * bookings/payouts/dashboard access are unaffected; only new Quick Match
 * candidacy and new direct bookings are gated (see tutorEligibility.ts and
 * bookingCreation.ts) until this is accepted. */
export function TutorAgreementBanner() {
  const t = useTranslations("dashboard.tutor.tutorAgreementBanner");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(acceptTutorAgreementAction, undefined);

  if (state?.success) return null;

  return (
    <Alert tone="warning" title={t("title")} className="mb-6">
      <p>{t("description")}</p>
      <form action={formAction} className="mt-4 flex flex-col gap-3">
        {state?.error && (
          <p role="alert" className="text-sm font-semibold text-error">
            {state.error}
          </p>
        )}
        <input type="hidden" name="locale" value={locale} />
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="tutorAgreementAccepted" value="true" required className="mt-0.5" />
          <span>
            {t("checkboxPrefix")}{" "}
            <Link href="/tutor-agreement" target="_blank" className="font-semibold text-blue hover:text-blue-hover">
              {t("checkboxLink")}
            </Link>
            .
          </span>
        </label>
        <Button type="submit" size="sm" disabled={pending} className="self-start">
          {t("submit")}
        </Button>
      </form>
    </Alert>
  );
}
