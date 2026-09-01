"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { claimInvitationAction, claimWithNewAccountAction } from "@/lib/actions/family";

export function ClaimGuardianInvitationForm({
  token,
  invitedEmail,
  isAuthenticated,
  sessionEmail,
  sessionRole,
}: {
  token: string;
  invitedEmail: string;
  isAuthenticated: boolean;
  sessionEmail: string | null;
  sessionRole: string | null;
}) {
  const t = useTranslations("family.claimPage");
  // BETA-HARDEN1 — reuses the exact same Terms/Privacy copy the ordinary
  // signup form shows (src/components/marketing/SignupForm.tsx), rather
  // than duplicating equivalent strings under a second namespace.
  const tAuth = useTranslations("auth.signup");
  const [claimState, claimAction, claimPending] = useActionState(claimInvitationAction, undefined);
  const [newAccountState, newAccountAction, newAccountPending] = useActionState(claimWithNewAccountAction, undefined);

  if (claimState?.success || newAccountState?.success) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-8" data-testid="claim-success">
        <p className="text-lg font-bold text-navy">{t("successTitle")}</p>
        <p className="mt-2 text-slate">{t("successDescription")}</p>
      </div>
    );
  }

  if (isAuthenticated) {
    const emailMatches = sessionRole === "PARENT" && sessionEmail?.trim().toLowerCase() === invitedEmail;

    if (!emailMatches) {
      return (
        <div className="rounded-xl border border-neutral-200 bg-white p-8">
          <p className="text-slate">{t("wrongEmailDescription")}</p>
        </div>
      );
    }

    return (
      <form action={claimAction} className="rounded-xl border border-neutral-200 bg-white p-8">
        <input type="hidden" name="token" value={token} />
        {claimState?.error && (
          <p role="alert" className="mb-4 rounded-md bg-error-light px-3 py-2 text-sm font-semibold text-error">
            {claimState.error}
          </p>
        )}
        <Button type="submit" disabled={claimPending} data-testid="claim-invitation">
          {claimPending ? t("claiming") : t("claimAsCta", { email: invitedEmail })}
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-neutral-200 bg-white p-6 text-center">
        <p className="text-sm text-slate">{t("signInPrompt")}</p>
        <div className="mt-3">
          <Button href="/login" variant="outline" size="sm">
            {t("signInCta")}
          </Button>
        </div>
      </div>

      <form action={newAccountAction} className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-8">
        <p className="text-lg font-bold text-navy">{t("newAccountTitle")}</p>
        <input type="hidden" name="token" value={token} />

        {newAccountState?.error && (
          <p role="alert" className="rounded-md bg-error-light px-3 py-2 text-sm font-semibold text-error">
            {newAccountState.error}
          </p>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-navy">{t("emailLabel")}</label>
          <Input value={invitedEmail} disabled readOnly />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="claim-firstName" className="mb-1.5 block text-sm font-semibold text-navy">
              {t("firstNameLabel")}
            </label>
            <Input id="claim-firstName" name="firstName" required />
          </div>
          <div>
            <label htmlFor="claim-lastName" className="mb-1.5 block text-sm font-semibold text-navy">
              {t("lastNameLabel")}
            </label>
            <Input id="claim-lastName" name="lastName" required />
          </div>
        </div>

        <div>
          <label htmlFor="claim-password" className="mb-1.5 block text-sm font-semibold text-navy">
            {t("passwordLabel")}
          </label>
          <Input id="claim-password" name="password" type="password" minLength={8} required />
          <p className="mt-1.5 text-xs text-slate">{t("passwordHint")}</p>
        </div>

        <label className="flex items-start gap-2.5 text-sm text-slate">
          <input
            type="checkbox"
            name="termsAccepted"
            value="true"
            required
            className="mt-0.5 size-4 shrink-0 accent-blue"
          />
          <span>
            {tAuth("termsAcceptancePrefix")}{" "}
            <Link href="/terms" target="_blank" className="font-semibold text-blue hover:text-blue-hover">
              {tAuth("termsAcceptanceLink")}
            </Link>{" "}
            {tAuth("privacyAcknowledgementPrefix")}{" "}
            <Link href="/privacy" target="_blank" className="font-semibold text-blue hover:text-blue-hover">
              {tAuth("privacyAcknowledgementLink")}
            </Link>
            .
          </span>
        </label>

        <Button type="submit" disabled={newAccountPending} data-testid="create-account-and-claim">
          {newAccountPending ? t("creating") : t("createAndClaimCta")}
        </Button>
      </form>
    </div>
  );
}
