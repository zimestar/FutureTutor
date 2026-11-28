"use client";

import { useCallback, useState, type ReactNode } from "react";
import {
  BookOpenCheck, CalendarDays, ClipboardCheck, CreditCard, FileText, FileSearch,
  GraduationCap, Heart, LayoutDashboard, Mail, Menu, MessageCircle, MessageSquareWarning,
  Search, ShieldAlert, ShieldCheck, SlidersHorizontal, Sparkles, UserCog, UserRound,
  UsersRound, Video, WalletCards, Receipt, ScrollText, Baby, Bot,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Logo } from "@/components/marketing/Logo";
import { Drawer } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { AccountMenu } from "@/components/dashboard/AccountMenu";

export interface DashboardNavItem {
  label: string;
  href: string;
  group?: string;
  /**
   * PROD-TUTOR-UX2 — a small number of nav items point outside this app's
   * authenticated shell (e.g. the public /tutor-agreement legal page, shared
   * with the marketing site's Terms/Privacy/Cookies pages, has no Tutor
   * sidebar of its own). Opening those in a new tab, matching the exact
   * convention this codebase already uses for the same link elsewhere
   * (TutorAgreementBanner.tsx, TutorProfileForm.tsx — both target="_blank"),
   * keeps the current dashboard tab (and its sidebar) untouched rather than
   * navigating the tutor away from their own navigation entirely.
   */
  openInNewTab?: boolean;
  /** DESIGN-SYSTEM2 — the item is also active anywhere under this path (e.g. a
   * section whose entry page is one of several tabs). */
  activePrefix?: string;
}

const navIcons: Record<string, typeof LayoutDashboard> = {
  "/dashboard": LayoutDashboard,
  "/find-tutors": Search,
  "/dashboard/find-tutors": Search,
  "/dashboard/favorites": Heart,
  "/dashboard/quick-match": Sparkles,
  "/dashboard/assistant": Bot,
  "/dashboard/bookings": CalendarDays,
  "/messages": MessageCircle,
  "/dashboard/payments": CreditCard,
  "/dashboard/profile": UserRound,
  "/dashboard/family": UsersRound,
  "/tutor/dashboard": LayoutDashboard,
  "/tutor/profile": UserRound,
  "/tutor/documents": FileText,
  "/tutor/training": GraduationCap,
  "/tutor/exam": ClipboardCheck,
  "/tutor/availability": CalendarDays,
  "/tutor/quick-match": Sparkles,
  "/tutor/bookings": BookOpenCheck,
  "/tutor/payouts": WalletCards,
  "/admin": LayoutDashboard,
  "/admin/tutors": UsersRound,
  "/admin/tutors/pipeline": UsersRound,
  "/admin/students": GraduationCap,
  "/admin/parents": Baby,
  "/admin/family": Mail,
  "/admin/bookings": CalendarDays,
  "/admin/sessions": Video,
  "/admin/users": UserRound,
  "/admin/admins": UserCog,
  "/admin/pricing": SlidersHorizontal,
  "/admin/quick-match": Sparkles,
  "/admin/payments": CreditCard,
  "/admin/financial-ops": Receipt,
  "/admin/message-reports": MessageSquareWarning,
  "/admin/safety-reports": ShieldAlert,
  "/admin/audit-log": ScrollText,
  "/tutor-agreement": ShieldCheck,
  "/report-concern": FileSearch,
};

/** APP-COLOR — every navigation entry carries its own accent chip, cycling
 * through the brand palette; the active entry becomes a solid blue pill. */
const NAV_CHIP_TONES = [
  "bg-blue-50 text-blue",
  "bg-coral-50 text-[#c2410c]",
  "bg-mint-50 text-emerald-700",
  "bg-sun-50 text-amber-700",
  "bg-lilac-50 text-[#6d5bd0]",
  "bg-sky-50 text-sky-700",
];

function isActiveRoute(pathname: string, href: string) {
  if (href === "/dashboard" || href === "/tutor/dashboard" || href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function DashboardNavigation({ navItems, onNavigate }: { navItems: DashboardNavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const groups = navItems.reduce<Array<{ label?: string; items: DashboardNavItem[] }>>((result, item) => {
    const last = result[result.length - 1];
    if (!last || last.label !== item.group) result.push({ label: item.group, items: [item] });
    else last.items.push(item);
    return result;
  }, []);

  return (
    <nav aria-label="Dashboard" className="flex flex-col gap-6">
      {groups.map((group, index) => (
        <div key={`${group.label ?? "navigation"}-${index}`}>
          {group.label && <p className="mb-2 px-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-neutral-400">{group.label}</p>}
          <ul className="flex flex-col gap-1">
            {group.items.map((item, itemIndex) => {
              const chipTone = NAV_CHIP_TONES[(index * 3 + itemIndex) % NAV_CHIP_TONES.length];
              const active = isActiveRoute(pathname, item.href) || (item.activePrefix !== undefined && isActiveRoute(pathname, item.activePrefix));
              const Icon = navIcons[item.href] ?? LayoutDashboard;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                    {...(item.openInNewTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className={cn(
                      "group flex min-h-11 items-center gap-3 rounded-2xl px-2.5 py-1.5 text-sm font-semibold transition-colors",
                      active ? "bg-blue text-white shadow-(--shadow-action)" : "text-neutral-700 hover:bg-neutral-100 hover:text-navy"
                    )}
                  >
                    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-xl transition-colors", active ? "bg-white/20 text-white" : chipTone)}>
                      <Icon className="size-[17px]" aria-hidden="true" />
                    </span>
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function AccountArea({ userName, userImage, compact = false }: { userName: string; userImage?: string | null; compact?: boolean }) {
  const t = useTranslations("dashboard");
  return (
    <div className={cn("flex items-center gap-3", compact ? "min-w-0" : "rounded-lg border border-border bg-surface-subtle p-3")}>
      <Avatar name={userName || "FutureTutor"} src={userImage ?? undefined} size={36} className="shrink-0" />
      <div className="min-w-0 flex-1">
        {!compact && <p className="text-xs text-text-muted">{t("signedInAs")}</p>}
        <p className="truncate text-sm font-bold text-text-primary">{userName}</p>
      </div>
    </div>
  );
}

export function DashboardShell({ navItems, userName, userImage, children }: { navItems: DashboardNavItem[]; userName: string; userImage?: string | null; children: ReactNode }) {
  const t = useTranslations("dashboard");
  const [navigationOpen, setNavigationOpen] = useState(false);
  const closeNavigation = useCallback(() => setNavigationOpen(false), []);

  return (
    <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[17.5rem] flex-col border-r border-border bg-surface lg:flex">
        <div className="flex min-h-[72px] items-center justify-between border-b border-border px-5">
          <Logo className="h-8" />
          <NotificationBell />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-5"><DashboardNavigation navItems={navItems} /></div>
        <div className="border-t border-border p-3">
          <AccountMenu userName={userName} userImage={userImage} />
        </div>
      </aside>

      <div className="min-w-0 lg:col-start-2">
        <header className="sticky top-0 z-10 flex min-h-16 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur-sm sm:px-6 lg:hidden">
          <button type="button" onClick={() => setNavigationOpen(true)} className="flex size-11 shrink-0 items-center justify-center rounded-md text-text-primary hover:bg-surface-subtle" aria-label={t("openNavigation")} aria-expanded={navigationOpen} aria-controls="dashboard-mobile-navigation">
            <Menu className="size-5" aria-hidden="true" />
          </button>
          <Logo className="h-8" />
          <div className="ml-auto flex min-w-0 items-center gap-1">
            <NotificationBell />
            <AccountArea userName={userName} userImage={userImage} compact />
          </div>
        </header>

        <main id="dashboard-main" className="relative min-h-screen bg-[radial-gradient(700px_380px_at_100%_0%,var(--color-sun-50)_0%,transparent_70%),radial-gradient(600px_400px_at_0%_100%,var(--color-blue-50)_0%,transparent_70%)] px-(--spacing-page-x) py-(--spacing-page-y)">{children}</main>
      </div>

      <Drawer open={navigationOpen} onClose={closeNavigation} id="dashboard-mobile-navigation" title={<Logo className="h-8" />} closeLabel={t("closeNavigation")}>
        <div className="flex-1 overflow-y-auto px-4 py-6"><DashboardNavigation navItems={navItems} onNavigate={closeNavigation} /></div>
        <div className="border-t border-border p-3">
          <AccountMenu userName={userName} userImage={userImage} onNavigate={closeNavigation} />
        </div>
      </Drawer>
    </div>
  );
}
