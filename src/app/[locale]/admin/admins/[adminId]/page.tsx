import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth"; import { redirect, Link } from "@/i18n/navigation"; import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell"; import { adminNavItems } from "@/lib/adminNav";
import { Avatar } from "@/components/ui/Avatar"; import { Badge } from "@/components/ui/Badge"; import { Button } from "@/components/ui/Button"; import { Surface } from "@/components/ui/Surface";
import { PermissionMatrix } from "@/components/admin/PermissionMatrix"; import { PromoteAdminDialog } from "@/components/admin/PromoteAdminDialog";
import { updateAdminPermissionsAction, suspendAdminAction, reactivateAdminAction } from "@/lib/actions/adminManagement";

export default async function AdminDetail({ params }: { params: Promise<{ locale: string; adminId: string }> }) {
  const { locale, adminId } = await params; setRequestLocale(locale);
  const session = await auth(); if (session?.user.role !== "SUPER_ADMIN") { redirect({ href: "/admin", locale }); return }
  const [t, tNav, tMgmt] = await Promise.all([
    getTranslations({ locale, namespace: "adminManagement.detail" }),
    getTranslations({ locale, namespace: "dashboard.nav" }),
    getTranslations({ locale, namespace: "adminManagement" }),
  ]);
  const user = await db.user.findUnique({ where: { id: adminId }, select: { id: true, name: true, email: true, role: true, image: true, deactivatedAt: true, adminInvitationAccepted: { select: { rolePreset: true } }, adminPermissions: { select: { permission: true } }, auditLogs: { select: { action: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 20 } } });
  if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) notFound();
  const isSuperAdmin = user.role === "SUPER_ADMIN";
  const isSelf = user.id === session.user.id;
  const presetLabel = isSuperAdmin ? tMgmt("superAdminBadge") : tMgmt(`invite.presets.${user.adminInvitationAccepted?.rolePreset ?? "CUSTOM"}`);
  const statusLabel = user.deactivatedAt ? tMgmt("statuses.SUSPENDED") : tMgmt("statuses.ACTIVE");
  async function update(formData: FormData) { "use server"; await updateAdminPermissionsAction(user!.id, undefined, formData) }
  return <DashboardShell navItems={await adminNavItems(tNav, session.user)} userName={session.user.name ?? ""}>
    <Link href="/admin/admins" className="text-sm font-bold text-blue">{"← "}{t("back")}</Link>
    <Surface className="mt-4 flex flex-wrap items-center gap-4">
      <Avatar name={user.name ?? user.email} src={user.image ?? undefined} size={56} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-extrabold text-navy">{user.name}</h1>
          {isSuperAdmin && <Badge variant="navy">{tMgmt("superAdminBadge")}</Badge>}
          {isSelf && <Badge variant="outline">{tMgmt("you")}</Badge>}
        </div>
        <p className="truncate text-sm text-text-secondary">{user.email}</p>
        {isSuperAdmin && <p className="mt-1 text-xs text-text-muted">{tMgmt("superAdminBadgeDescription")}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Badge variant="neutral">{presetLabel}</Badge>
        <Badge variant={user.deactivatedAt ? "outline" : "mint"}>{statusLabel}</Badge>
      </div>
    </Surface>

    <Surface className="mt-6" padding="lg">
      <h2 className="text-lg font-extrabold text-navy">{t("permissionsTitle")}</h2>
      <p className="mt-1 text-sm text-text-secondary">{t("permissionsDescription")}</p>
      {isSuperAdmin ? <p className="mt-4 rounded-lg bg-surface-subtle p-4 text-sm text-text-secondary">{t("superAdminNotice")}</p> : <form action={update} className="mt-5 space-y-4">
        <PermissionMatrix selected={user.adminPermissions.map(p => p.permission)} disabled={isSelf} />
        <Button type="submit" disabled={isSelf}>{t("savePermissions")}</Button>
      </form>}
    </Surface>

    {user.role === "ADMIN" && !isSelf && <Surface className="mt-6" padding="lg">
      <form action={user.deactivatedAt ? reactivateAdminAction.bind(null, user.id) : suspendAdminAction.bind(null, user.id)}>
        <Button type="submit" variant={user.deactivatedAt ? "outline" : "destructive"}>{user.deactivatedAt ? t("reactivate") : t("suspend")}</Button>
      </form>
    </Surface>}
    {user.role === "ADMIN" && !user.deactivatedAt && <div className="mt-6"><PromoteAdminDialog adminId={user.id} /></div>}

    <Surface className="mt-6" padding="lg">
      <h2 className="text-lg font-extrabold text-navy">{t("activity")}</h2>
      <div className="mt-3 divide-y divide-border">{user.auditLogs.map((a, i) => <p key={i} className="py-2 text-sm text-text-secondary">{a.action} · {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(a.createdAt)}</p>)}</div>
    </Surface>
  </DashboardShell>;
}
