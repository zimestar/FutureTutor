"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { revokeGuardianAction } from "@/lib/actions/family";

export function GuardianRevokeButton({ relationshipId }: { relationshipId: string }) {
  const t = useTranslations("family.guardians");
  const [state, formAction, pending] = useActionState(revokeGuardianAction, undefined);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="relationshipId" value={relationshipId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending} data-testid="revoke-guardian">
        {pending ? t("revoking") : t("revokeCta")}
      </Button>
      {state?.error && (
        <p role="alert" className="max-w-[220px] text-right text-xs font-semibold text-error">
          {state.error}
        </p>
      )}
    </form>
  );
}
