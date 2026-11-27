"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronsUpDown, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/Avatar";
import { InstallFutureTutor } from "@/components/pwa/InstallFutureTutor";
import { FeedbackLink } from "@/components/dashboard/FeedbackLink";
import { ReportConcernLink } from "@/components/dashboard/ReportConcernLink";
import { signOutAction } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";

/**
 * DESIGN-SYSTEM2 — the signed-in person, as one compact button at the foot of
 * the dashboard sidebar. Secondary actions (install, feedback, report a
 * concern, sign out) open above it, so the navigation keeps the space.
 */
export function AccountMenu({ userName, userImage, onNavigate }: { userName: string; userImage?: string | null; onNavigate?: () => void }) {
  const t = useTranslations("dashboard");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      {open && (
        <div role="menu" className="absolute inset-x-0 bottom-full mb-2 rounded-2xl border border-border bg-surface p-2 shadow-(--shadow-pop)">
          <InstallFutureTutor />
          <FeedbackLink />
          <ReportConcernLink
            onNavigate={() => {
              setOpen(false);
              onNavigate?.();
            }}
          />
          <div className="my-1 h-px bg-border" />
          <form action={signOutAction}>
            <button type="submit" className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-semibold text-text-secondary hover:bg-neutral-100 hover:text-text-primary">
              <LogOut className="size-[18px]" aria-hidden="true" /> {t("logOut")}
            </button>
          </form>
        </div>
      )}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-surface-subtle",
          open && "bg-surface-subtle"
        )}
      >
        <Avatar name={userName || "FutureTutor"} src={userImage ?? undefined} size={36} className="shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-text-muted">{t("signedInAs")}</span>
          <span className="block truncate text-sm font-bold text-text-primary">{userName}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
      </button>
    </div>
  );
}
