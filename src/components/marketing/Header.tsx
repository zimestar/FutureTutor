"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
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

/**
 * DESIGN-SYSTEM2 — public site header. One line on desktop (≥1280px) in both
 * languages: logo, four links, then language, sign-in and the two calls to
 * action. Below that, a full-width menu. Gains a border and shadow once the
 * page scrolls.
 */
export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tHeader = useTranslations("header");
  // Session is fetched client-side (rather than via a server-fetched prop)
  // so pages using <Header> keep their static prerendering — see
  // SessionProvider in the root layout.
  const { data: session } = useSession();
  const user = session?.user;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b bg-white/85 backdrop-blur-md transition-[border-color,box-shadow] duration-300",
        scrolled ? "border-neutral-200 shadow-[0_8px_24px_-18px_rgba(13,27,42,0.35)]" : "border-transparent"
      )}
    >
      <div className="mx-auto flex h-[72px] w-full max-w-(--container-page) items-center gap-8 px-5 md:px-10">
        <Logo className="h-8" />

        <nav data-testid="desktop-navigation" aria-label="Primary" className="hidden xl:block">
          <ul className="flex items-center gap-1">
            {mainNav.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "whitespace-nowrap rounded-lg px-3 py-2 text-[15px] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-navy",
                      active && "text-navy"
                    )}
                  >
                    {t(item.key)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div data-testid="desktop-actions" className="ml-auto hidden items-center gap-2 xl:flex">
          <LanguageSwitcher className="mr-2" />
          {user ? (
            <>
              <Button href={homePathForRole(user.role)} variant="outline" size="sm">
                {t("dashboard")}
              </Button>
              <form action={signOutAction}>
                <Button type="submit" variant="ghost" size="sm">
                  {t("logOut")}
                </Button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="whitespace-nowrap rounded-lg px-3 py-2 text-[15px] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-navy"
                onClick={() => trackEvent("login_started", {})}
              >
                {t("login")}
              </Link>
              <Button
                href="/become-a-tutor"
                variant="outline"
                size="sm"
                onClick={() => trackEvent("become_tutor_cta_clicked", { cta_location: "header" })}
              >
                {t("becomeATutor")}
              </Button>
              <Button
                href="/find-tutors"
                variant="primary"
                size="sm"
                onClick={() => trackEvent("find_tutor_cta_clicked", { cta_location: "header" })}
              >
                {t("findTutor")}
              </Button>
            </>
          )}
        </div>

        <button
          type="button"
          className="ml-auto flex size-11 items-center justify-center rounded-xl text-navy transition-colors hover:bg-neutral-100 xl:hidden"
          aria-label={open ? tHeader("closeMenu") : tHeader("openMenu")}
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t border-neutral-200 bg-white px-5 pb-8 pt-4 shadow-pop xl:hidden">
          <ul className="flex flex-col">
            {mainNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex h-14 items-center border-b border-neutral-100 text-lg font-semibold text-navy"
                >
                  {t(item.key)}
                </Link>
              </li>
            ))}
            {!user && (
              <li>
                <Link
                  href="/login"
                  onClick={() => {
                    setOpen(false);
                    trackEvent("login_started", {});
                  }}
                  className="flex h-14 items-center text-lg font-semibold text-navy"
                >
                  {t("login")}
                </Link>
              </li>
            )}
          </ul>
          <div className="mt-6 flex flex-col gap-3">
            {user ? (
              <>
                <Button href={homePathForRole(user.role)} variant="primary" onClick={() => setOpen(false)}>
                  {t("dashboard")}
                </Button>
                <form action={signOutAction}>
                  <Button type="submit" variant="outline" className="w-full">
                    {t("logOut")}
                  </Button>
                </form>
              </>
            ) : (
              <>
                <Button
                  href="/find-tutors"
                  variant="primary"
                  onClick={() => {
                    setOpen(false);
                    trackEvent("find_tutor_cta_clicked", { cta_location: "header_mobile" });
                  }}
                >
                  {t("findTutor")}
                </Button>
                <Button
                  href="/become-a-tutor"
                  variant="outline"
                  onClick={() => {
                    setOpen(false);
                    trackEvent("become_tutor_cta_clicked", { cta_location: "header_mobile" });
                  }}
                >
                  {t("becomeATutor")}
                </Button>
              </>
            )}
            <LanguageSwitcher className="mt-2 self-start" />
          </div>
        </nav>
      )}
    </header>
  );
}
