import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect, Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { InviteGuardianForm } from "@/components/dashboard/InviteGuardianForm";
import { InviteStudentLoginForm } from "@/components/dashboard/InviteStudentLoginForm";
import { PendingClaimRow } from "@/components/dashboard/PendingClaimRow";
import { GuardianRevokeButton } from "@/components/dashboard/GuardianRevokeButton";
import { StudentProfileEditForm } from "@/components/dashboard/StudentProfileEditForm";
import { getStudentDashboardNavItems } from "@/lib/dashboardNav";
import { getFamilyManagementDetail, NotAuthorizedError } from "@/services/familyManagement";
import { getStudentProfileForActor } from "@/services/profileManagement";

export default async function FamilyStudentDetailPage({
  params,
}: {
  params: Promise<{ locale: string; studentProfileId: string }>;
}) {
  const { locale, studentProfileId } = await params;
  setRequestLocale(locale);

  const session = await auth();
  const user = session?.user;
  if (!user || user.role !== "PARENT") {
    redirect({ href: "/login", locale });
    return;
  }

  let detail;
  try {
    detail = await getFamilyManagementDetail(db, user.id, studentProfileId);
  } catch (error) {
    // Cross-family IDOR: an unrelated Parent manually changing the id in
    // the URL is sent back to their own family list, never told whether
    // the id exists at all (§13/§50 of the H.4 prompt; H.6 §21/§41).
    if (error instanceof NotAuthorizedError) {
      redirect({ href: "/dashboard/family", locale });
      return;
    }
    throw error;
  }

  // H.6 (§13/§21) — re-derives editable fields independently of the
  // hasActiveGuardianAuthority check above, via the same H.2-backed path
  // every other profile surface uses, rather than assuming "reached this
  // page" implies "may edit this profile."
  const [profileView, academicLevelRows] = await Promise.all([
    getStudentProfileForActor(db, user.id, studentProfileId),
    db.academicLevel.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const t = await getTranslations("family");
  const tGuardians = await getTranslations("family.guardians");
  const tPendingClaims = await getTranslations("family.pendingClaims");
  const tStudentLogin = await getTranslations("family.studentLoginStatus");
  const tLoginStatus = await getTranslations("family.guardianVisibleLoginStatus");
  const tNav = await getTranslations("dashboard.nav");
  const tLevels = await getTranslations("gradeLevels");
  const tEditProfile = await getTranslations("profile.studentForm");

  const { studentProfile, relationships, invitations, studentLoginInvitations, studentLoginStatus } = detail;
  const claimedInvitations = invitations.filter((inv) => inv.status === "CLAIMED_PENDING_APPROVAL");
  const stillPendingInvitations = invitations.filter((inv) => inv.status === "PENDING");

  const claimedStudentLoginInvitation = studentLoginInvitations.find((inv) => inv.status === "CLAIMED_PENDING_APPROVAL");
  const pendingStudentLoginInvitation = studentLoginInvitations.find((inv) => inv.status === "PENDING");

  const academicLevels = academicLevelRows.map((level) => ({ id: level.id, label: tLevels(level.slug) }));
  const navItems = getStudentDashboardNavItems((key) => tNav(key), user.role);

  return (
    <DashboardShell navItems={navItems} userName={user.name ?? ""}>
      <Link href="/dashboard/family" className="text-sm font-semibold text-blue hover:text-blue-hover">
        &larr; {t("backToFamily")}
      </Link>

      <h1 className="mt-3 text-2xl font-bold text-navy">
        {studentProfile.firstName} {studentProfile.lastName}
      </h1>
      <p className="mt-1 text-slate">
        {studentProfile.academicLevel ? tLevels(studentProfile.academicLevel.slug) : t("childCard.noAcademicLevel")}
      </p>

      {profileView && (
        <div className="mt-8 rounded-xl border border-neutral-200 bg-white p-6">
          <p className="text-lg font-bold text-navy">{tEditProfile("sectionTitle")}</p>
          <p className="mt-1 text-sm text-slate">{tEditProfile("guardianSectionSubtitle")}</p>
          <div className="mt-4">
            <StudentProfileEditForm
              studentProfileId={studentProfileId}
              editableFields={profileView.editableFields}
              academicLevels={academicLevels}
              initialValues={{
                firstName: studentProfile.firstName,
                lastName: studentProfile.lastName,
                province: studentProfile.province,
                city: studentProfile.city,
                academicLevelId: studentProfile.academicLevelId,
                tutoringMode: studentProfile.tutoringMode,
                preferredLanguage: studentProfile.preferredLanguage,
                dateOfBirth: studentProfile.dateOfBirth ? studentProfile.dateOfBirth.toISOString().slice(0, 10) : null,
              }}
            />
          </div>
        </div>
      )}

      <div className="mt-8 rounded-xl border border-neutral-200 bg-white p-6">
        <p className="text-lg font-bold text-navy">{tGuardians("title")}</p>
        <p className="mt-1 text-sm text-slate">{tGuardians("subtitle")}</p>
        <div className="mt-4 flex flex-col gap-3" data-testid="guardians-list">
          {relationships.map((rel) => (
            <div key={rel.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3">
              <div>
                <p className="font-semibold text-navy">
                  {rel.parentProfile.user?.name ?? rel.parentProfile.user?.email ?? "—"}
                  {rel.parentProfile.userId === user.id ? ` ${tGuardians("youLabel")}` : ""}
                </p>
                <p className="mt-1 text-xs text-slate">{rel.parentProfile.user?.email}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={rel.status === "ACTIVE" ? "mint" : "outline"}>
                  {rel.status === "ACTIVE" ? tGuardians("activeStatus") : tGuardians("revokedStatus")}
                </Badge>
                {/* Locked policy: a guardian may remove only their own
                    access — removing another guardian is an Admin/Support
                    capability reserved for a later phase, not a
                    guardian-facing control here. Server-side enforcement
                    (revokeGuardianRelationship's ownership check) is the
                    real boundary; this is only the UI reflecting it. */}
                {rel.status === "ACTIVE" && rel.parentProfile.userId === user.id && (
                  <GuardianRevokeButton relationshipId={rel.id} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 rounded-xl border border-neutral-200 bg-white p-6">
        <p className="text-lg font-bold text-navy">{tPendingClaims("title")}</p>
        <div className="mt-4 flex flex-col gap-3" data-testid="pending-claims-list">
          {claimedInvitations.length === 0 ? (
            <p className="text-sm text-slate">{tPendingClaims("empty")}</p>
          ) : (
            claimedInvitations.map((inv) => (
              <PendingClaimRow
                key={inv.id}
                claim={{
                  invitationId: inv.id,
                  claimedByName: inv.claimedByUser?.name ?? null,
                  claimedByEmail: inv.claimedByUser?.email ?? inv.invitedEmailNormalized,
                  claimedAt: (inv.claimedAt ?? inv.createdAt).toISOString(),
                  expiresAt: inv.expiresAt.toISOString(),
                  locale,
                }}
              />
            ))
          )}
          {stillPendingInvitations.length > 0 && (
            <div className="mt-2 flex flex-col gap-2">
              {stillPendingInvitations.map((inv) => (
                <p key={inv.id} className="text-xs text-slate" data-testid="invited-not-claimed">
                  {inv.invitedEmailNormalized}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 rounded-xl border border-neutral-200 bg-white p-6" data-testid="student-login-section">
        <div className="flex items-center gap-3">
          <p className="text-lg font-bold text-navy">{tStudentLogin("title")}</p>
          <Badge variant={studentLoginStatus === "ACTIVE" ? "mint" : "outline"} data-testid="student-login-status-badge">
            {tLoginStatus(studentLoginStatus)}
          </Badge>
        </div>
        {studentProfile.userId ? (
          <div className="mt-3 flex items-center gap-3" data-testid="student-login-active">
            <p className="text-sm text-slate">{tStudentLogin("activeDescription")}</p>
          </div>
        ) : claimedStudentLoginInvitation ? (
          <div className="mt-4">
            <PendingClaimRow
              claim={{
                invitationId: claimedStudentLoginInvitation.id,
                claimedByName: claimedStudentLoginInvitation.claimedByUser?.name ?? null,
                claimedByEmail:
                  claimedStudentLoginInvitation.claimedByUser?.email ??
                  claimedStudentLoginInvitation.invitedEmailNormalized,
                claimedAt: (claimedStudentLoginInvitation.claimedAt ?? claimedStudentLoginInvitation.createdAt).toISOString(),
                expiresAt: claimedStudentLoginInvitation.expiresAt.toISOString(),
                locale,
              }}
            />
          </div>
        ) : pendingStudentLoginInvitation ? (
          <p className="mt-3 text-sm text-slate" data-testid="student-login-invited-not-claimed">
            {tStudentLogin("invitedPending", { email: pendingStudentLoginInvitation.invitedEmailNormalized })}
          </p>
        ) : (
          <>
            {/* H.6 (§16) — a REVOKED or EXPIRED prior claim gets its own
                honest history note before offering a fresh invite, instead
                of silently behaving as if nothing had happened yet. */}
            {(studentLoginStatus === "REJECTED_OR_REVOKED" || studentLoginStatus === "EXPIRED") && (
              <p className="mt-3 text-sm text-slate" data-testid="student-login-terminal-note">
                {tStudentLogin(studentLoginStatus === "REJECTED_OR_REVOKED" ? "previouslyRevokedNote" : "previouslyExpiredNote")}
              </p>
            )}
            <div className="mt-4">
              <InviteStudentLoginForm studentProfileId={studentProfileId} />
            </div>
          </>
        )}
      </div>

      <div className="mt-8">
        <InviteGuardianForm studentProfileId={studentProfileId} />
      </div>
    </DashboardShell>
  );
}
