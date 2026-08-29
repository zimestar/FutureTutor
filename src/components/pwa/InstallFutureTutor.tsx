"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Share } from "lucide-react";
import { useTranslations } from "next-intl";

import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { isIosInstallEnvironment, isStandaloneDisplay } from "@/lib/pwaInstall";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type InstallState = "checking" | "available" | "ios" | "manual" | "installed";

declare global {
  interface Navigator {
    standalone?: boolean;
  }
}

export function InstallFutureTutor({ className }: { className?: string }) {
  const t = useTranslations("pwa.install");
  const [state, setState] = useState<InstallState>("checking");
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  useEffect(() => {
    // BETA-OPS1 — window/navigator don't exist during SSR, so this
    // one-time capability read (not a subscription to anything that
    // changes) can only happen post-mount; starting from "checking" and
    // flipping once here is the correct SSR-safe pattern, not a
    // synchronization bug the lint rule's cascading-render concern applies
    // to (this effect sets state exactly once per mount either way).
    if (
      isStandaloneDisplay({
        displayModeStandalone: window.matchMedia("(display-mode: standalone)").matches,
        iosStandalone: navigator.standalone,
      })
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState("installed");
      return;
    }

    setState(
      isIosInstallEnvironment({
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        maxTouchPoints: navigator.maxTouchPoints,
      })
        ? "ios"
        : "manual",
    );

    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
      setState("available");
    };
    const onInstalled = () => {
      setPromptEvent(null);
      setInstructionsOpen(false);
      setState("installed");
    };

    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const closeInstructions = useCallback(() => setInstructionsOpen(false), []);

  const requestInstall = useCallback(async () => {
    if (state === "available" && promptEvent) {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      setPromptEvent(null);
      if (outcome === "dismissed") setState("manual");
      return;
    }
    setInstructionsOpen(true);
  }, [promptEvent, state]);

  if (state === "checking" || state === "installed") return null;

  return (
    <>
      <button
        type="button"
        onClick={requestInstall}
        className={cn(
          "flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-neutral-100 hover:text-text-primary",
          className,
        )}
      >
        <Download className="size-[18px]" aria-hidden="true" />
        {t("action")}
      </button>

      <Dialog
        open={instructionsOpen}
        onClose={closeInstructions}
        title={t(state === "ios" ? "iosTitle" : "manualTitle")}
        description={t(state === "ios" ? "iosDescription" : "manualDescription")}
        closeLabel={t("close")}
      >
        {state === "ios" ? (
          <ol className="space-y-3 text-sm leading-6 text-text-secondary">
            <li className="flex gap-3"><Share className="mt-0.5 size-5 shrink-0 text-blue" aria-hidden="true" /><span>{t("iosStepShare")}</span></li>
            <li className="pl-8">{t("iosStepAdd")}</li>
            <li className="pl-8">{t("iosStepConfirm")}</li>
          </ol>
        ) : null}
      </Dialog>
    </>
  );
}
