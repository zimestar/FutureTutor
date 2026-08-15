import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { StudentActivationNotice } from "@/components/dashboard/StudentActivationNotice";
import { StudentProfileEditForm } from "@/components/dashboard/StudentProfileEditForm";
import { ParentProfileEditForm } from "@/components/dashboard/ParentProfileEditForm";
import { getStudentDashboardNavItems } from "@/lib/dashboardNav";
import { resolveStudentAccountActivationState } from "@/services/familyManagement";
import { getStudentProfileForActor, getParentProfileForActor } from "@/services/profileManagement";

/**
 * Phase H.6 (§9/§18/§19/§37) — the shared "My Profile" surface for both
 * STUDENT and PARENT sessions. Reuses the H.5 activation-state resolver
 * (§33) rather than re-deriving "is this Student allowed to see profile
 * content yet" — a GUARDIAN_MANAGED Student with no linked profile must
 * see the exact same safe notice here as on every other dashboard page,
 * not a broken/empty profile form.
 */
export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  const user = session?.user;
  if (!user || (user.role !== "STUDENT" && user.role !== "PARENT")) {
    redirect({ href: "/login", locale });
    return;
  }

  const t = await getTranslations("profile");
  const tNav = await getTranslations("dashboard.nav");
  const navItems = getStudentDashboardNavItems((key) => tNav(key), user.role);

  if (user.role === "PARENT") {
    const parentProfile = await getParentProfileForActor(db, user.id);
    if (!parentProfile) {
      // Fails closed rather than crashing — not the expected steady state
      // for a PARENT session (H.3 always creates one at signup), but this
      // page must never assume it without checking.
      return (
        <DashboardShell navItems={navItems} userName={user.name ?? ""}>
          <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
          <p className="mt-4 text-slate">{t("parentProfileMissing")}</p>
        </DashboardShell>
      );
    }

    return (
      <DashboardShell navItems={navItems} userName={user.name ?? ""}>
        <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
        <p className="mt-2 max-w-xl text-slate">{t("parentSubtitle")}</p>
        <div className="mt-8 max-w-2xl rounded-xl border border-neutral-200 bg-white p-6">
          <ParentProfileEditForm
            initialValues={{
              firstName: parentProfile.firstName,
              lastName: parentProfile.lastName,
              province: parentProfile.province,
              city: parentProfile.city,
              preferredLanguage: parentProfile.preferredLanguage,
            }}
          />
        </div>
      </DashboardShell>
    );
  }

  // user.role === "STUDENT"
  const activationState = await resolveStudentAccountActivationState(db, user.id);
  if (activationState.state !== "ACTIVE") {
    return (
      <DashboardShell navItems={navItems} userName={user.name ?? ""}>
        <StudentActivationNotice state={activationState} />
      </DashboardShell>
    );
  }

  const [view, academicLevelRows] = await Promise.all([
    getStudentProfileForActor(db, user.id, activationState.studentProfileId),
    db.academicLevel.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  if (!view) {
    // Structurally shouldn't happen (ACTIVE implies canActForStudent for
    // one's own linked profile) — fail closed rather than assume.
    redirect({ href: "/dashboard", locale });
    return;
  }

  const tLevels = await getTranslations("gradeLevels");
  const academicLevels = academicLevelRows.map((level) => ({ id: level.id, label: tLevels(level.slug) }));

  return (
    <DashboardShell navItems={navItems} userName={user.name ?? ""}>
      <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
      <p className="mt-2 max-w-xl text-slate">
        {view.capabilities.canManageStudentAccount ? t("studentSubtitleFull") : t("studentSubtitleLowStakes")}
      </p>
      <div className="mt-8 max-w-2xl rounded-xl border border-neutral-200 bg-white p-6">
        <StudentProfileEditForm
          studentProfileId={view.studentProfile.id}
          editableFields={view.editableFields}
          academicLevels={academicLevels}
          initialValues={{
            firstName: view.studentProfile.firstName,
            lastName: view.studentProfile.lastName,
            province: view.studentProfile.province,
            city: view.studentProfile.city,
            academicLevelId: view.studentProfile.academicLevelId,
            tutoringMode: view.studentProfile.tutoringMode,
            preferredLanguage: view.studentProfile.preferredLanguage,
            dateOfBirth: view.studentProfile.dateOfBirth ? view.studentProfile.dateOfBirth.toISOString().slice(0, 10) : null,
          }}
        />
      </div>
    </DashboardShell>
  );
}
