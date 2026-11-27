"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * HOME-V2 — bottom action bar on phones and tablets. Appears once the hero
 * (and its search) has scrolled out of view; hidden on desktop, where the
 * header keeps both actions visible.
 */
export function MobileStickyCta() {
  const t = useTranslations("homeV2.sticky");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 640);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <div aria-hidden="true" className="h-20 xl:hidden" />
      <nav
        aria-label={t("label")}
        data-testid="mobile-sticky-cta"
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 flex gap-2.5 border-t border-border bg-white/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_30px_-18px_rgba(13,27,42,0.35)] backdrop-blur transition-transform duration-300 xl:hidden",
          visible ? "translate-y-0" : "pointer-events-none translate-y-full"
        )}
      >
        <Link
          href="/find-tutors"
          tabIndex={visible ? undefined : -1}
          onClick={() => trackEvent("find_tutor_cta_clicked", { cta_location: "sticky_mobile" })}
          className="flex min-h-12 flex-1 items-center justify-center rounded-full bg-blue px-4 text-base font-bold text-white"
        >
          {t("find")}
        </Link>
        <Link
          href="/signup"
          tabIndex={visible ? undefined : -1}
          className="flex min-h-12 items-center rounded-full border border-neutral-300 px-5 text-[15px] font-bold text-navy"
        >
          {t("signup")}
        </Link>
      </nav>
    </>
  );
}
