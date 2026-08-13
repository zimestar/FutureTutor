import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export default async function TutorDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  const user = session?.user;
  if (!user || user.role !== "TUTOR") {
    redirect({ href: "/login", locale });
    return;
  }

  const t = await getTranslations({ locale, namespace: "dashboard.tutor" });
  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });
  const tStatus = await getTranslations({ locale, namespace: "dashboard.tutor.applicationStatus" });

  const tutorProfile = await db.tutorProfile.findUnique({
    where: { userId: user.id },
    select: { applicationStatus: true, headline: true },
  });

  const status = tutorProfile?.applicationStatus ?? "DRAFT";
  const isIncomplete = !tutorProfile?.headline;

  return (
    <DashboardShell
      navItems={[
        { label: tNav("overview"), href: "/tutor/dashboard" },
        { label: tNav("profile"), href: "/tutor/profile" },
        { label: tNav("availability"), href: "/tutor/availability" },
        { label: tNav("bookings"), href: "/tutor/bookings" },
      ]}
      userName={user.name ?? ""}
    >
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-navy">
          {t("welcome", { name: user.name?.split(" ")[0] ?? "" })}
        </h1>
        <Badge variant={status === "APPROVED" ? "mint" : "outline"}>{tStatus(status)}</Badge>
      </div>
      <p className="mt-2 max-w-xl text-slate">{t("description")}</p>

      <div className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
        <p className="text-lg font-semibold text-navy">
          {isIncomplete ? t("profileIncompleteTitle") : t("profileCompleteTitle")}
        </p>
        <p className="mt-2 text-sm text-slate">
          {isIncomplete ? t("profileIncompleteDescription") : t("profileCompleteDescription")}
        </p>
        <div className="mt-6 flex justify-center">
          <Button href="/tutor/profile">{isIncomplete ? t("completeProfileCta") : t("editProfileCta")}</Button>
        </div>
      </div>
    </DashboardShell>
  );
}
