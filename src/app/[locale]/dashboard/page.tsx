import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { StudentActivationNotice } from "@/components/dashboard/StudentActivationNotice";
import { Button } from "@/components/ui/Button";
import { resolveStudentAccountActivationState } from "@/services/familyManagement";
import { getStudentDashboardNavItems } from "@/lib/dashboardNav";

export default async function StudentDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  const user = session?.user;
  if (!user || (user.role !== "STUDENT" && user.role !== "PARENT")) {
    redirect({ href: "/login", locale });
    return;
  }

  const t = await getTranslations({ locale, namespace: "dashboard.student" });
  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });

  const navItems = getStudentDashboardNavItems((key) => tNav(key), user.role);

  // Phase H.5 Final Claimant-State UX Correction: a STUDENT-role User with
  // no linked StudentProfile must never see booking/payment-suggestive
  // dashboard content — but which safe message to show depends on the
  // server-resolved activation state (pending/rejected/expired/unlinked),
  // not a blanket "waiting for approval" assumption. Checked before any
  // other content renders.
  if (user.role === "STUDENT") {
    const activationState = await resolveStudentAccountActivationState(db, user.id);
    if (activationState.state !== "ACTIVE") {
      return (
        <DashboardShell navItems={navItems} userName={user.name ?? ""}>
          <StudentActivationNotice state={activationState} />
        </DashboardShell>
      );
    }
  }

  return (
    <DashboardShell navItems={navItems} userName={user.name ?? ""}>
      <h1 className="text-2xl font-bold text-navy">{t("welcome", { name: user.name?.split(" ")[0] ?? "" })}</h1>
      <p className="mt-2 max-w-xl text-slate">{t("description")}</p>

      <div className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
        <p className="text-lg font-semibold text-navy">{t("noBookingsTitle")}</p>
        <p className="mt-2 text-sm text-slate">{t("noBookingsDescription")}</p>
        <div className="mt-6 flex justify-center">
          <Button href="/find-tutors">{t("findTutorCta")}</Button>
        </div>
      </div>
    </DashboardShell>
  );
}
