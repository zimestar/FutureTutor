import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { adminNavItems } from "@/lib/adminNav";
import { listFamilyInvitationsRequiringAdminAttention } from "@/services/familyManagement";

/**
 * Phase H.9 — Family-Accounts Admin Visibility (planning report §28).
 *
 * READ-ONLY by design: no admin-safe approve/reject mutation exists for
 * FamilyInvitation anywhere in this codebase (both approveFamilyInvitation
 * and rejectFamilyInvitationClaim require ACTIVE guardian authority over
 * the specific student, which no Admin actor can ever hold). This page
 * gives Support/Admin visibility into invitations stuck in
 * CLAIMED_PENDING_APPROVAL so they can proactively nudge the guardian —
 * out of band — to sign in and approve or reject the claim themselves.
 *
 * Auth pattern copied exactly from every other `/admin/*` route (see
 * src/app/[locale]/admin/payments/page.tsx): session + ADMIN/SUPER_ADMIN
 * role gate, redirect to /login otherwise. The read model itself
 * (listFamilyInvitationsRequiringAdminAttention) independently re-verifies
 * the same role gate server-side.
 */
export default async function AdminFamilyInvitationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  const user = session?.user;
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
    redirect({ href: "/login", locale });
    return;
  }

  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });
  const t = await getTranslations({ locale, namespace: "dashboard.admin.familyInvitations" });

  const invitations = await listFamilyInvitationsRequiringAdminAttention(db, { id: user.id, role: user.role });
  const pastDueCount = invitations.filter((inv) => inv.pastDue).length;

  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  return (
    <DashboardShell navItems={await adminNavItems(tNav, user)} userName={user.name ?? ""}>
      <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
      <p className="mt-2 max-w-2xl text-slate">{t("description")}</p>

      <div className="mt-6 flex flex-wrap gap-3" data-testid="admin-family-summary">
        <div className="rounded-xl border border-neutral-200 bg-white px-5 py-4">
          <p className="text-2xl font-extrabold text-navy">{invitations.length}</p>
          <p className="mt-1 text-sm font-semibold text-slate">{t("summaryTotal")}</p>
        </div>
        {pastDueCount > 0 && (
          <div className="rounded-xl border border-neutral-200 bg-white px-5 py-4">
            <p className="text-2xl font-extrabold text-navy">{pastDueCount}</p>
            <p className="mt-1 text-sm font-semibold text-slate">{t("summaryPastDue")}</p>
          </div>
        )}
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold text-navy">{t("listTitle")}</h2>

        {invitations.length === 0 ? (
          <p className="text-sm text-slate" data-testid="admin-family-empty">
            {t("empty")}
          </p>
        ) : (
          <div className="flex flex-col gap-2" data-testid="admin-family-list">
            {invitations.map((inv) => (
              <div key={inv.id} className="rounded-lg border border-neutral-200 bg-white p-4 text-sm" data-testid="admin-family-row">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-navy">
                    {inv.studentFirstName} {inv.studentLastName}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{t(inv.type === "GUARDIAN_LINK" ? "typeGuardianLink" : "typeStudentLogin")}</Badge>
                    <Badge variant={inv.pastDue ? "outline" : "blue"}>
                      {inv.pastDue ? t("statusPastDue") : t("statusWaitingApproval")}
                    </Badge>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-slate sm:grid-cols-2">
                  <p>{t("invitedBy", { name: inv.invitedByUser?.name ?? inv.invitedByUser?.email ?? "—" })}</p>
                  <p>
                    {t("claimedBy", {
                      name: inv.claimedByUser?.name ?? inv.claimedByUser?.email ?? inv.invitedEmailNormalized,
                    })}
                  </p>
                  <p>{t("createdAt", { date: dateFormatter.format(inv.createdAt) })}</p>
                  <p>
                    {inv.claimedAt
                      ? t("claimedAt", { date: dateFormatter.format(inv.claimedAt) })
                      : t("notYetClaimed")}
                  </p>
                </div>

                {inv.pastDue && <p className="mt-2 text-xs font-semibold text-error">{t("pastDueNote")}</p>}
              </div>
            ))}
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
