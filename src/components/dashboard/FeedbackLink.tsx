"use client";

import { LifeBuoy } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// BETA-LAUNCHFIX1 — the smallest useful beta feedback/support channel: a
// discoverable, unobtrusive mailto: link in the same account-area footer
// every role's DashboardShell already renders (alongside Log Out /
// InstallFutureTutor), not a new backend system or third-party integration.
// Reuses legal@futuretutor.ca — the only real, already-existing FutureTutor
// contact address anywhere in the codebase (used today across every legal
// document for exactly this "reach a real person" purpose) — rather than
// inventing a new, unconfirmed address. See
// FutureTutor_BETA_LAUNCHFIX1_REPORT.md for the audit trail behind this
// choice and the recommendation to move to a dedicated support inbox later.
const SUPPORT_EMAIL = "legal@futuretutor.ca";

export function FeedbackLink({ className }: { className?: string }) {
  const t = useTranslations("dashboard.feedback");
  const subject = encodeURIComponent(t("emailSubject"));

  return (
    <a
      href={`mailto:${SUPPORT_EMAIL}?subject=${subject}`}
      className={cn(
        "flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-neutral-100 hover:text-text-primary",
        className
      )}
    >
      <LifeBuoy className="size-[18px]" aria-hidden="true" />
      {t("linkLabel")}
    </a>
  );
}
