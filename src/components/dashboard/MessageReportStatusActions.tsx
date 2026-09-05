"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { updateMessageReportStatusAction } from "@/lib/actions/messageReports";
import type { MessageReportStatus } from "@/generated/prisma/enums";

/**
 * MESSAGING-MVP1C — the ONLY admin action available on a report: advancing
 * its status. OPEN -> UNDER_REVIEW, UNDER_REVIEW -> RESOLVED, OPEN ->
 * RESOLVED. No edit/delete/send-as-user/ban/suspend/refund control exists
 * here or anywhere else in this feature.
 */
export function MessageReportStatusActions({ reportId, status }: { reportId: string; status: MessageReportStatus }) {
  const t = useTranslations("admin.messageReports");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function handleTransition(newStatus: MessageReportStatus) {
    if (pending) return;
    setPending(true);
    setError(false);
    const result = await updateMessageReportStatusAction(reportId, newStatus);
    setPending(false);
    if (result.ok) {
      router.refresh();
    } else {
      setError(true);
    }
  }

  if (status === "RESOLVED") return null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
      {status === "OPEN" && (
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void handleTransition("UNDER_REVIEW")} data-testid="mark-under-review">
          {t("actions.markUnderReview")}
        </Button>
      )}
      <Button type="button" size="sm" disabled={pending} onClick={() => void handleTransition("RESOLVED")} data-testid="mark-resolved">
        {t("actions.markResolved")}
      </Button>
      {error && <span className="text-xs font-semibold text-error">{t("actions.error")}</span>}
    </div>
  );
}
