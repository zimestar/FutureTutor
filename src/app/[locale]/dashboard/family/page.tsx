import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { AddChildForm } from "@/components/dashboard/AddChildForm";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { listChildrenForGuardian, type GuardianVisibleStudentLoginStatus } from "@/services/familyManagement";
import { getStudentDashboardNavItems } from "@/lib/dashboardNav";

const LOGIN_STATUS_BADGE_VARIANT: Record<GuardianVisibleStudentLoginStatus, "mint" | "outline"> = {
  ACTIVE: "mint",
  WAITING_FOR_APPROVAL: "outline",
  INVITED_PENDING: "outline",
  REJECTED_OR_REVOKED: "outline",
  EXPIRED: "outline",
  NO_LOGIN: "outline",
};

/** Display-only, never persisted (H.6 §30) — a simple count of the
 * nullable "extra" fields a guardian has filled in for this child.
 * tutoringMode/preferredLanguage always carry a DB default so they're
 * excluded — a trivially-always-100% metric wouldn't be useful. */
function computeProfileCompleteness(studentProfile: { academicLevelId: string | null; province: string | null; city: string | null }) {
  const fields = [studentProfile.academicLevelId, studentProfile.province, studentProfile.city];
  const filled = fields.filter((f) => f !== null && f !== "").length;
  return { filled, total: fields.length };
}

export default async function FamilyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  const user = session?.user;
  if (!user || user.role !== "PARENT") {
    redirect({ href: "/login", locale });
    return;
  }

  const t = await getTranslations("family");
  const tNav = await getTranslations("dashboard.nav");
  const tLevels = await getTranslations("gradeLevels");
  const tLoginStatus = await getTranslations("family.guardianVisibleLoginStatus");

  const [children, academicLevels] = await Promise.all([
    listChildrenForGuardian(db, user.id),
    db.academicLevel.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const academicLevelOptions = academicLevels.map((level) => ({ id: level.id, label: tLevels(level.slug) }));
  const navItems = getStudentDashboardNavItems((key) => tNav(key), user.role);

  return (
    <DashboardShell navItems={navItems} userName={user.name ?? ""}>
      <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
      <p className="mt-2 max-w-xl text-slate">{t("subtitle")}</p>

      {children.length > 0 ? (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="children-list">
          {children.map(({ studentProfile, activeGuardianCount, studentLoginStatus }) => {
            const completeness = computeProfileCompleteness(studentProfile);
            return (
              <div
                key={studentProfile.id}
                className="flex flex-col rounded-xl border border-neutral-200 bg-white p-5"
                data-testid="child-card"
                data-student-profile-id={studentProfile.id}
              >
                <p className="text-lg font-bold text-navy">
                  {studentProfile.firstName} {studentProfile.lastName}
                </p>
                <p className="mt-1 text-sm text-slate">
                  {studentProfile.academicLevel ? tLevels(studentProfile.academicLevel.slug) : t("childCard.noAcademicLevel")}
                </p>
                <p className="mt-1 text-sm text-slate">{t("childCard.guardianCount", { count: activeGuardianCount })}</p>
                <p className="mt-1 text-xs text-slate">
                  {t("childCard.profileCompleteness", { filled: completeness.filled, total: completeness.total })}
                </p>
                <div className="mt-3 flex items-center gap-2" data-testid="child-card-login-status">
                  <Badge variant={LOGIN_STATUS_BADGE_VARIANT[studentLoginStatus]}>{tLoginStatus(studentLoginStatus)}</Badge>
                </div>
                <div className="mt-4">
                  <Button href={`/dashboard/family/${studentProfile.id}`} size="sm" variant="outline">
                    {t("childCard.manageGuardians")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
          <p className="text-lg font-semibold text-navy">{t("emptyTitle")}</p>
          <p className="mt-2 text-sm text-slate">{t("emptyDescription")}</p>
        </div>
      )}

      <div className="mt-6">
        <AddChildForm academicLevels={academicLevelOptions} />
      </div>
    </DashboardShell>
  );
}
