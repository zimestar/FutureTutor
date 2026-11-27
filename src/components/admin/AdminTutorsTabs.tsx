import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * DESIGN-SYSTEM2 — the admin "Tutors" section has two views of the same
 * people: the applications board (work queue) and the full list.
 */
export async function AdminTutorsTabs({ locale, active }: { locale: string; active: "applications" | "all" }) {
  const t = await getTranslations({ locale, namespace: "dashboard.nav" });
  const tabs = [
    { id: "applications" as const, href: "/admin/tutors/pipeline", label: t("tutorsTabApplications") },
    { id: "all" as const, href: "/admin/tutors?status=all", label: t("tutorsTabAll") },
  ];
  return (
    <nav aria-label={t("tutors")} className="mb-8 inline-flex rounded-xl border border-border bg-surface p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          aria-current={active === tab.id ? "page" : undefined}
          className={cn(
            "whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
            active === tab.id ? "bg-blue text-white shadow-(--shadow-action)" : "text-neutral-600 hover:bg-neutral-100 hover:text-navy"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
