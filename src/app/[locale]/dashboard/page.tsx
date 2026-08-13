import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Button } from "@/components/ui/Button";

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

  return (
    <DashboardShell
      navItems={[
        { label: tNav("overview"), href: "/dashboard" },
        { label: tNav("favorites"), href: "/dashboard/favorites" },
        { label: tNav("bookings"), href: "/dashboard/bookings" },
      ]}
      userName={user.name ?? ""}
    >
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
