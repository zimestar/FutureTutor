import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Surface } from "@/components/ui/Surface";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { adminNavItems } from "@/lib/adminNav";
import { suspendParentAction, reactivateParentAction } from "@/lib/actions/adminAccountSuspension";

export default async function AdminParentDetailPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await auth();
  const user = session?.user;
  if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
    redirect({ href: "/login", locale });
    return;
  }
  const t = await getTranslations({ locale, namespace: "admin.operations.parentDetail" });
  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });

  const parent = await db.parentProfile.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, deactivatedAt: true } },
      studentRelationships: { include: { studentProfile: { select: { id: true, firstName: true, lastName: true } } } },
    },
  });
  if (!parent) notFound();

  const isSuspended = Boolean(parent.user?.deactivatedAt);

  return (
    <DashboardShell navItems={await adminNavItems(tNav, user)} userName={user.name ?? ""}>
      <PageHeader
        title={`${parent.firstName} ${parent.lastName}`}
        description={parent.user?.email}
        status={<Badge variant={isSuspended ? "outline" : "mint"}>{t(isSuspended ? "suspended" : "active")}</Badge>}
      />
      <Surface className="mt-5">
        {isSuspended ? (
          <form action={reactivateParentAction.bind(null, parent.id)} className="flex gap-2">
            <input type="text" name="reason" required placeholder={t("reasonPlaceholder")} className="h-10 flex-1 rounded-md border border-neutral-300 px-3 text-sm" />
            <Button type="submit" size="sm">{t("confirmReactivate")}</Button>
          </form>
        ) : (
          <details className="w-full">
            <summary className="cursor-pointer text-sm font-semibold text-error">{t("suspendParent")}</summary>
            <form action={suspendParentAction.bind(null, parent.id)} className="mt-2 flex gap-2">
              <input type="text" name="reason" required placeholder={t("reasonPlaceholder")} className="h-10 flex-1 rounded-md border border-neutral-300 px-3 text-sm" />
              <Button type="submit" variant="outline" size="sm">{t("confirmSuspend")}</Button>
            </form>
          </details>
        )}
        <p className="mt-3 text-xs text-text-secondary">{t("suspendHint")}</p>
      </Surface>
      <Surface className="mt-5">
        <h2 className="font-extrabold">{t("children")}</h2>
        {parent.studentRelationships.length ? (
          <ul className="mt-4 space-y-2">
            {parent.studentRelationships.map((r) => (
              <li key={r.id} className="text-sm">
                <span className="font-bold">{r.studentProfile.firstName} {r.studentProfile.lastName}</span> · {r.status}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-text-secondary">{t("noChildren")}</p>
        )}
      </Surface>
    </DashboardShell>
  );
}
