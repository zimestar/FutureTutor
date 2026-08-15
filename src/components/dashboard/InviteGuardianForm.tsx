"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { inviteGuardianAction } from "@/lib/actions/family";

export function InviteGuardianForm({ studentProfileId }: { studentProfileId: string }) {
  const t = useTranslations("family.invite");
  const [state, formAction, pending] = useActionState(inviteGuardianAction, undefined);
  const [copied, setCopied] = useState(false);

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — the link is still visible/selectable in
      // the text field below, so this is a non-fatal degradation.
    }
  }

  if (state?.success) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-6" data-testid="invite-link-result">
        <p className="text-lg font-bold text-navy">{t("linkGeneratedTitle")}</p>
        <p className="mt-1 text-sm text-slate">{t("linkGeneratedDescription")}</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input readOnly value={state.inviteUrl} data-testid="invite-link-value" onFocus={(e) => e.target.select()} />
          <Button type="button" variant="outline" onClick={() => copyLink(state.inviteUrl)} data-testid="copy-invite-link">
            {copied ? t("copied") : t("copyCta")}
          </Button>
        </div>
        <p className="mt-3 text-xs text-slate">{t("expiresNote")}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-6">
      <p className="text-lg font-bold text-navy">{t("title")}</p>

      {state && !state.success && state.error && (
        <p role="alert" className="rounded-md bg-error-light px-3 py-2 text-sm font-semibold text-error">
          {state.error}
        </p>
      )}

      <input type="hidden" name="studentProfileId" value={studentProfileId} />

      <div>
        <label htmlFor="invitedEmail" className="mb-1.5 block text-sm font-semibold text-navy">
          {t("emailLabel")}
        </label>
        <Input id="invitedEmail" name="invitedEmail" type="email" required data-testid="invite-email-input" />
      </div>

      <Button type="submit" disabled={pending} data-testid="submit-invite">
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
