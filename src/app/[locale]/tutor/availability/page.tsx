import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { TutorAvailabilityForm } from "@/components/dashboard/TutorAvailabilityForm";
import { TIMEZONE_OPTIONS } from "@/schemas/tutorAvailability";

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
    <DashboardShell
      navItems={[
        { label: tNav("overview"), href: "/tutor/dashboard" },
        { label: tNav("profile"), href: "/tutor/profile" },
        { label: tNav("availability"), href: "/tutor/availability" },
        { label: tNav("bookings"), href: "/tutor/bookings" },
      ]}
      userName={user.name ?? ""}
    >
      <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
      <p className="mt-2 max-w-xl text-slate">{t("subtitle")}</p>

      <div className="mt-8 max-w-2xl rounded-xl border border-neutral-200 bg-white p-6 md:p-8">
        <TutorAvailabilityForm values={values} />
      </div>
    </DashboardShell>
  );
}
