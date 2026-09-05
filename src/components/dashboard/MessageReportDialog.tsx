"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { reportMessageAction } from "@/lib/actions/messageReports";

const REPORT_DETAIL_MAX_LENGTH = 1000;
const REASONS = ["INAPPROPRIATE_CONTENT", "HARASSMENT", "OFF_PLATFORM_REQUEST", "SAFETY_CONCERN", "SPAM", "OTHER"] as const;

/**
 * MESSAGING-MVP1C — a lightweight report flow for a single message, never
 * shown for the viewer's own messages. Submitting never edits/hides/
 * deletes the Message and never notifies its sender — it only creates a
 * durable MessageReport for later admin review. Double-submit is guarded
 * by the same pending-state pattern used throughout this app's forms.
 */
export function MessageReportDialog({ messageId, open, onClose }: { messageId: string | null; open: boolean; onClose: () => void }) {
  const t = useTranslations("messaging");
  const [reason, setReason] = useState<(typeof REASONS)[number]>("INAPPROPRIATE_CONTENT");
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"success" | "already" | "error" | null>(null);

  function handleClose() {
    setReason("INAPPROPRIATE_CONTENT");
    setDetail("");
    setResult(null);
    onClose();
  }

  async function handleSubmit() {
    if (!messageId || submitting) return;
    setSubmitting(true);
    try {
      const response = await reportMessageAction(messageId, reason, detail.trim() || undefined);
      if (response.ok) {
        setResult(response.alreadyReported ? "already" : "success");
      } else {
        setResult("error");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={t("report.title")}
      description={result ? undefined : t("report.description")}
      closeLabel={t("report.close")}
      actions={
        result ? (
          <Button type="button" onClick={handleClose} data-testid="report-done">
            {t("report.done")}
          </Button>
        ) : (
          <>
            <Button type="button" variant="outline" onClick={handleClose}>
              {t("report.cancel")}
            </Button>
            <Button type="button" disabled={submitting} onClick={() => void handleSubmit()} data-testid="report-submit">
              {submitting ? t("report.submitting") : t("report.submit")}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <p className="text-sm text-text-secondary" data-testid="report-result">
          {result === "success" && t("report.success")}
          {result === "already" && t("report.alreadyReported")}
          {result === "error" && t("report.error")}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="text-sm font-bold text-navy">
            {t("report.reasonLabel")}
            <Select className="mt-1" value={reason} onChange={(e) => setReason(e.target.value as (typeof REASONS)[number])} data-testid="report-reason">
              {REASONS.map((value) => (
                <option key={value} value={value}>
                  {t(`report.reasons.${value}`)}
                </option>
              ))}
            </Select>
          </label>

          <label className="text-sm font-bold text-navy">
            {t("report.detailLabel")}
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value.slice(0, REPORT_DETAIL_MAX_LENGTH))}
              maxLength={REPORT_DETAIL_MAX_LENGTH}
              rows={3}
              className="mt-1 w-full resize-none rounded-md border border-neutral-300 bg-white px-4 py-3 text-[15px] font-normal text-navy outline-none transition-colors focus:border-blue"
              data-testid="report-detail"
            />
            <span className="mt-1 block text-xs font-normal text-text-muted">
              {detail.length}/{REPORT_DETAIL_MAX_LENGTH}
            </span>
          </label>
        </div>
      )}
    </Dialog>
  );
}
