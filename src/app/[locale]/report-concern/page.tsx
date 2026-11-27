import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Alert } from "@/components/ui/Feedback";
import { SafetyConcernForm } from "@/components/dashboard/SafetyConcernForm";
import { navItemsForUser } from "@/lib/navForUser";

/** SAFETY-REPORTS1 — report a safety concern (every signed-in role). */
export default async function ReportConcernPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  const user = session?.user;
  if (!user) {
    redirect({ href: "/login", locale });
    return;
  }

  const [t, tNav] = await Promise.all([
    getTranslations({ locale, namespace: "safetyReport" }),
    getTranslations({ locale, namespace: "dashboard.nav" }),
  ]);

  return (
    <DashboardShell navItems={await navItemsForUser(tNav, user)} userName={user.name ?? ""}>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">{t("title")}</h1>
        <p className="mt-2 text-slate">{t("intro")}</p>
        <Alert tone="warning" title={t("emergencyTitle")} className="mt-6">
          {t("emergencyBody")}
        </Alert>
        <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
          <SafetyConcernForm />
        </div>
        <p className="mt-4 text-sm text-slate">{t("privacyNote")}</p>
      </div>
    </DashboardShell>
  );
}
