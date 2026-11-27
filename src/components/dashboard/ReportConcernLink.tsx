"use client";

import { ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** SAFETY-REPORTS1 — always one click away, for every role, from every dashboard page. */
export function ReportConcernLink({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const t = useTranslations("safetyReport");
  return (
    <Link
      href="/report-concern"
      onClick={onNavigate}
      className={cn(
        "flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-neutral-100 hover:text-text-primary",
        className
      )}
    >
      <ShieldAlert className="size-[18px]" aria-hidden="true" />
      {t("linkLabel")}
    </Link>
  );
}
