import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { TutorAvailabilityForm } from "@/components/dashboard/TutorAvailabilityForm";
import { TIMEZONE_OPTIONS } from "@/schemas/tutorAvailability";
import { tutorNavItems } from "@/lib/tutorNav";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { Surface } from "@/components/ui/Surface";

export default async function TutorAvailabilityPage({
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

  const t = await getTranslations({ locale, namespace: "tutorAvailability" });
  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });

  const tutorProfile = await db.tutorProfile.findUnique({ where: { userId: user.id } });
  if (!tutorProfile) {
    redirect({ href: "/tutor/dashboard", locale });
    return;
  }

  const existing = await db.tutorAvailability.findMany({
    where: { tutorProfileId: tutorProfile.id },
    orderBy: { dayOfWeek: "asc" },
  });
  const byDay = new Map(existing.map((row) => [row.dayOfWeek, row]));

  const values = {
    timezone: (existing[0]?.timezone ?? "America/Toronto") as (typeof TIMEZONE_OPTIONS)[number],
    days: Array.from({ length: 7 }, (_, i) => {
      const row = byDay.get(i);
      return { enabled: !!row, startTime: row?.startTime ?? "09:00", endTime: row?.endTime ?? "17:00" };
    }),
  };

  return (
    <DashboardShell navItems={tutorNavItems(tNav, tutorProfile.applicationStatus)} userName={user.name ?? ""}>
      <PageHeader
        title={tutorProfile.applicationStatus === "APPROVED" ? t("approvedTitle") : t("approvalTitle")}
        description={tutorProfile.applicationStatus === "APPROVED" ? t("approvedSubtitle") : t("approvalSubtitle")}
        eyebrow={tutorProfile.applicationStatus === "APPROVED" ? t("modeTutoring") : t("modeApproval")}
        status={<Badge variant={existing.length > 0 ? "mint" : "outline"}>{existing.length > 0 ? t("configured", { count: existing.length }) : t("notConfigured")}</Badge>}
      />

      <Surface className="mt-8 max-w-3xl" padding="lg">
        <TutorAvailabilityForm values={values} />
      </Surface>
    </DashboardShell>
  );
}
