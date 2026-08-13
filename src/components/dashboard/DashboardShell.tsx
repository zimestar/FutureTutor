import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/marketing/Logo";
import { signOutAction } from "@/lib/actions/auth";

export interface DashboardNavItem {
  label: string;
  href: string;
}

export function DashboardShell({
  navItems,
  userName,
  children,
}: {
  navItems: DashboardNavItem[];
  userName: string;
  children: ReactNode;
}) {
  const t = useTranslations("dashboard");

  return (
    <div className="flex min-h-screen bg-off-white">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-neutral-200 bg-white px-5 py-6 lg:flex">
        <Logo />
        <nav aria-label="Dashboard" className="mt-10 flex flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2.5 text-sm font-semibold text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-navy"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-neutral-200 bg-white px-5 lg:px-8">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="ml-auto flex items-center gap-4">
            <span className="text-sm font-semibold text-navy">{userName}</span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-semibold text-slate transition-colors hover:border-navy hover:text-navy"
              >
                {t("logOut")}
              </button>
            </form>
          </div>
        </header>

        <main className="flex-1 px-5 py-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
