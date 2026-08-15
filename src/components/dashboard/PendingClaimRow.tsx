"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { approveInvitationAction, rejectInvitationAction } from "@/lib/actions/family";

export interface PendingClaimData {
  invitationId: string;
  claimedByName: string | null;
  claimedByEmail: string | null;
  claimedAt: string;
  expiresAt: string;
  locale: string;
}

export function PendingClaimRow({ claim }: { claim: PendingClaimData }) {
  const t = useTranslations("family.pendingClaims");
  const [approveState, approveAction, approvePending] = useActionState(approveInvitationAction, undefined);
  const [rejectState, rejectAction, rejectPending] = useActionState(rejectInvitationAction, undefined);

  const dateFormatter = new Intl.DateTimeFormat(claim.locale, { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-4" data-testid="pending-claim-row">
      <div>
        <p className="font-semibold text-navy">{t("claimedBy", { name: claim.claimedByName ?? claim.claimedByEmail ?? "" })}</p>
        <p className="mt-1 text-sm text-slate">{t("claimedAt", { date: dateFormatter.format(new Date(claim.claimedAt)) })}</p>
        <p className="mt-1 text-xs text-slate">{t("expiresAt", { date: dateFormatter.format(new Date(claim.expiresAt)) })}</p>
        {(approveState?.error || rejectState?.error) && (
          <p role="alert" className="mt-2 rounded-md bg-error-light px-3 py-1.5 text-xs font-semibold text-error">
            {approveState?.error ?? rejectState?.error}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <form action={approveAction}>
          <input type="hidden" name="invitationId" value={claim.invitationId} />
          <Button type="submit" size="sm" disabled={approvePending || rejectPending} data-testid="approve-claim">
            {approvePending ? t("approving") : t("approveCta")}
          </Button>
        </form>
        <form action={rejectAction}>
          <input type="hidden" name="invitationId" value={claim.invitationId} />
          <Button type="submit" size="sm" variant="outline" disabled={approvePending || rejectPending} data-testid="reject-claim">
            {rejectPending ? t("rejecting") : t("rejectCta")}
          </Button>
        </form>
      </div>
    </div>
  );
}
