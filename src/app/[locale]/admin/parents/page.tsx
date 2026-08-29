import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect, Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { adminNavItems } from "@/lib/adminNav";

export default async function AdminParentsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ q?: string }> }) {
  const { locale } = await params; const { q = "" } = await searchParams; setRequestLocale(locale);
  const session = await auth(); const user = session?.user;
  if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) { redirect({ href: "/login", locale }); return; }
  const t = await getTranslations({ locale, namespace: "admin.operations.parents" });
  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });
  const parents = await db.parentProfile.findMany({
    where: q ? { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { user: { email: { contains: q, mode: "insensitive" } } }] } : {},
    include: { user: { select: { email: true, deactivatedAt: true } }, _count: { select: { studentRelationships: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return <DashboardShell navItems={await adminNavItems(tNav, user)} userName={user.name ?? ""}><PageHeader title={t("title")} description={t("description")} />
    <form className="mt-6 grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-[1fr_auto]" role="search"><label className="text-sm font-bold">{t("search")}<input name="q" defaultValue={q} className="mt-1 h-11 w-full rounded-md border border-border px-3 font-normal" /></label><button className="min-h-11 self-end rounded-md bg-blue px-5 font-bold text-white">{t("apply")}</button></form>
    {parents.length === 0 ? <p className="mt-8 rounded-xl border border-dashed border-border p-8 text-center text-text-secondary">{t("empty")}</p> : <div className="mt-6 grid gap-3 lg:grid-cols-2">{parents.map((parent) => <Link key={parent.id} href={`/admin/parents/${parent.id}`} className="rounded-xl border border-border bg-surface p-5 hover:border-blue/40"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-extrabold text-navy">{parent.firstName} {parent.lastName}</h2>{parent.user?.deactivatedAt ? <Badge variant="outline">{t("suspended")}</Badge> : null}</div><p className="mt-1 text-sm text-text-secondary">{parent.user?.email}</p><p className="mt-3 text-xs font-semibold text-text-muted">{t("summary", { children: parent._count.studentRelationships })}</p></Link>)}</div>}
  </DashboardShell>;
}
