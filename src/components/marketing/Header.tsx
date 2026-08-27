"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { Menu, X } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { Logo } from "@/components/marketing/Logo";
import { Button } from "@/components/ui/Button";
import { LanguageSwitcher } from "@/components/marketing/LanguageSwitcher";
import { mainNav } from "@/content/navigation";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { signOutAction } from "@/lib/actions/auth";
import { homePathForRole } from "@/lib/authorization";

export function Header() {
  const [open, setOpen] = useState(false);
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tHeader = useTranslations("header");
  // Session is fetched client-side (rather than via a server-fetched prop)
  // so pages using <Header> keep their static prerendering — see
  // SessionProvider in the root layout.
  const { data: session } = useSession();
  const user = session?.user;
  const desktopOnly = locale === "fr" ? "hidden min-[1440px]:block" : "hidden xl:block";
  const desktopActions = locale === "fr" ? "hidden min-[1440px]:flex" : "hidden xl:flex";
  const compactOnly = locale === "fr" ? "min-[1440px]:hidden" : "xl:hidden";

  return (
    <header className="sticky top-0 z-50 border-b border-neutral-200 bg-off-white/90 backdrop-blur-sm">
      <div className="mx-auto flex h-20 w-full max-w-(--container-page) items-center justify-between px-5 md:px-10">
        <Logo className="h-9" />

        <nav data-testid="desktop-navigation" aria-label="Primary" className={desktopOnly}>
          <ul className="flex items-center gap-5 2xl:gap-8">
            {mainNav.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "text-sm font-semibold text-neutral-600 transition-colors hover:text-navy",
                      active && "text-blue"
                    )}
                  >
                    {t(item.key)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div data-testid="desktop-actions" className={`${desktopActions} items-center gap-2 2xl:gap-3`}>
          <LanguageSwitcher className="mr-1" />
          {user ? (
            <>
              <Button href={homePathForRole(user.role)} variant="outline" size="sm">
                {t("dashboard")}
              </Button>
              <form action={signOutAction}>
                <Button type="submit" variant="primary" size="sm">
                  {t("logOut")}
                </Button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-semibold text-neutral-600 transition-colors hover:text-navy"
              >
                {t("login")}
              </Link>
              <Button href="/become-a-tutor" variant="outline" size="sm">
                {t("becomeATutor")}
              </Button>
              <Button
                href="/find-tutors"
                variant="primary"
                size="sm"
                onClick={() => trackEvent("find_tutor_clicked", { source: "header" })}
              >
                {t("findTutor")}
              </Button>
            </>
          )}
        </div>

        <button
          type="button"
          className={`flex h-11 w-11 items-center justify-center rounded-md text-navy ${compactOnly}`}
          aria-label={open ? tHeader("closeMenu") : tHeader("openMenu")}
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {open && (
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          className={`border-t border-neutral-200 bg-white px-5 py-6 ${compactOnly}`}
        >
          <ul className="flex flex-col gap-1">
            {mainNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex h-12 items-center text-base font-semibold text-navy"
                >
                  {t(item.key)}
                </Link>
              </li>
            ))}
            {!user && (
              <li>
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="flex h-12 items-center text-base font-semibold text-navy"
                >
                  {t("login")}
                </Link>
              </li>
            )}
          </ul>
          <div className="mt-4 flex flex-col gap-3">
            <LanguageSwitcher className="self-start" />
            {user ? (
              <>
                <Button href={homePathForRole(user.role)} variant="outline" onClick={() => setOpen(false)}>
                  {t("dashboard")}
                </Button>
                <form action={signOutAction}>
                  <Button type="submit" variant="primary" className="w-full">
                    {t("logOut")}
                  </Button>
                </form>
              </>
            ) : (
              <>
                <Button href="/become-a-tutor" variant="outline" onClick={() => setOpen(false)}>
                  {t("becomeATutor")}
                </Button>
                <Button
                  href="/find-tutors"
                  variant="primary"
                  onClick={() => {
                    setOpen(false);
                    trackEvent("find_tutor_clicked", { source: "header-mobile" });
                  }}
                >
                  {t("findTutor")}
                </Button>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
