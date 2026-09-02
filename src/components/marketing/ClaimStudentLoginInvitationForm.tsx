"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { claimStudentLoginAction, claimStudentLoginWithNewAccountAction } from "@/lib/actions/family";

export function ClaimStudentLoginInvitationForm({
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
  const t = useTranslations("family.studentLoginClaimPage");
  const [claimState, claimAction, claimPending] = useActionState(claimStudentLoginAction, undefined);
  const [newAccountState, newAccountAction, newAccountPending] = useActionState(
    claimStudentLoginWithNewAccountAction,
    undefined
  );

  // BETA-EMAILVERIFY1 — see ClaimGuardianInvitationForm.tsx's identical
  // comment: the new-account path now returns requiresVerification: true.
  if (newAccountState?.success && newAccountState.requiresVerification) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-8" data-testid="claim-success">
        <p className="text-lg font-bold text-navy">{t("verificationRequiredTitle")}</p>
        <p className="mt-2 text-slate">{t("verificationRequiredDescription")}</p>
      </div>
    );
  }

  if (claimState?.success || newAccountState?.success) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-8" data-testid="claim-success">
        <p className="text-lg font-bold text-navy">{t("successTitle")}</p>
        <p className="mt-2 text-slate">{t("successDescription")}</p>
      </div>
    );
  }

  if (isAuthenticated) {
    // §12 of the H.5 prompt: only role STUDENT may become this
    // StudentProfile's login — PARENT/TUTOR/ADMIN sessions are told to
    // sign out and use/create a Student account instead, never
    // reinterpreted into a different role.
    if (sessionRole !== "STUDENT") {
      return (
        <div className="rounded-xl border border-neutral-200 bg-white p-8">
          <p className="text-slate">{t("wrongRoleDescription")}</p>
        </div>
      );
    }

    const emailMatches = sessionEmail?.trim().toLowerCase() === invitedEmail;
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
            <label htmlFor="student-claim-firstName" className="mb-1.5 block text-sm font-semibold text-navy">
              {t("firstNameLabel")}
            </label>
            <Input id="student-claim-firstName" name="firstName" required />
          </div>
          <div>
            <label htmlFor="student-claim-lastName" className="mb-1.5 block text-sm font-semibold text-navy">
              {t("lastNameLabel")}
            </label>
            <Input id="student-claim-lastName" name="lastName" required />
          </div>
        </div>

        <div>
          <label htmlFor="student-claim-password" className="mb-1.5 block text-sm font-semibold text-navy">
            {t("passwordLabel")}
          </label>
          <Input id="student-claim-password" name="password" type="password" minLength={8} required />
          <p className="mt-1.5 text-xs text-slate">{t("passwordHint")}</p>
        </div>

        <Button type="submit" disabled={newAccountPending} data-testid="create-account-and-claim">
          {newAccountPending ? t("creating") : t("createAndClaimCta")}
        </Button>
      </form>
    </div>
  );
}
