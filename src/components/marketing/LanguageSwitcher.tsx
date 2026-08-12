"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useTranslations("languageSwitcher");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div
      role="group"
      aria-label={t("label")}
      className={cn("flex items-center gap-0.5 rounded-pill border border-neutral-300 p-0.5", className)}
    >
      {routing.locales.map((loc) => (
        <button
          key={loc}
          type="button"
          aria-pressed={loc === locale}
          onClick={() =>
            router.replace(
              { pathname, query: Object.fromEntries(new URLSearchParams(window.location.search)) },
              { locale: loc }
            )
          }
          className={cn(
            "rounded-pill px-2.5 py-1 text-xs font-bold uppercase transition-colors",
            loc === locale ? "bg-navy text-white" : "text-slate hover:text-navy"
          )}
        >
          {loc}
        </button>
      ))}
    </div>
  );
}
