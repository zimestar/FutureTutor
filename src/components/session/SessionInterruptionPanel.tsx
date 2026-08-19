"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Dialog } from "@/components/ui/Dialog";
import { requestSessionInterruptionAction } from "@/lib/actions/session";

export function SessionInterruptionPanel({ bookingId, locale, learnerFirstName, guardianViewer }: { bookingId: string; locale: string; learnerFirstName: string; guardianViewer: boolean }) {
  const t = useTranslations("sessionExperience.interruption");
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(requestSessionInterruptionAction, undefined);

  useEffect(() => {
    if (state?.success || state?.error === "notEligible") router.refresh();
  }, [router, state]);

  const close = () => { if (!pending) setOpen(false); };
  const triggerLabel = guardianViewer ? t("triggerGuardian", { name: learnerFirstName }) : t("trigger");

  return (
    <div className="border-t border-border pt-5">
      <p className="text-sm leading-6 text-text-secondary">{guardianViewer ? t("summaryGuardian", { name: learnerFirstName }) : t("summary")}</p>
      <button type="button" onClick={() => setOpen(true)} className="mt-3 min-h-11 rounded-md border border-error/40 px-4 py-2 text-sm font-bold text-error hover:bg-error/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error">
        {triggerLabel}
      </button>

      <Dialog
        open={open}
        onClose={close}
        title={guardianViewer ? t("dialogTitleGuardian", { name: learnerFirstName }) : t("dialogTitle")}
        description={guardianViewer ? t("dialogDescriptionGuardian", { name: learnerFirstName }) : t("dialogDescription")}
        closeLabel={t("cancel")}
        actions={<>
          <button type="button" disabled={pending} onClick={close} className="min-h-11 rounded-md border border-border px-5 py-2 text-sm font-bold text-text-primary disabled:opacity-50">{t("cancel")}</button>
          <button type="submit" form={formId} disabled={pending} className="min-h-11 rounded-md bg-error px-5 py-2 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error disabled:cursor-not-allowed disabled:opacity-50">{pending ? t("ending") : t("confirm")}</button>
        </>}
      >
        <form id={formId} action={action}>
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="locale" value={locale} />
          <label htmlFor={`${formId}-reason`} className="text-sm font-bold text-text-primary">{t("reasonLabel")}</label>
          <textarea id={`${formId}-reason`} name="reason" maxLength={500} rows={4} disabled={pending} className="mt-2 w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue disabled:opacity-50" placeholder={t("reasonPlaceholder")} />
          <p className="mt-1 text-xs text-text-muted">{t("reasonHelp")}</p>
          <div aria-live="polite" className="mt-3 min-h-5 text-sm font-semibold">
            {state?.error && <p className="text-error">{t(`errors.${state.error}`)}</p>}
          </div>
        </form>
      </Dialog>
    </div>
  );
}
