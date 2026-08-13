import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { approveTutorAction, rejectTutorAction } from "@/lib/actions/adminTutors";
import type { TutorApplicationStatus } from "@/generated/prisma/enums";

const PENDING_STATUSES: TutorApplicationStatus[] = ["SUBMITTED", "UNDER_REVIEW"];

export default async function AdminTutorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  const { status: statusFilter } = await searchParams;
  setRequestLocale(locale);

  const session = await auth();
  const user = session?.user;
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
    redirect({ href: "/login", locale });
    return;
  }

  const t = await getTranslations({ locale, namespace: "admin.tutors" });
  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });
  const tStatus = await getTranslations({ locale, namespace: "dashboard.tutor.applicationStatus" });
  const tSubjects = await getTranslations({ locale, namespace: "subjects.items" });

  const showAll = statusFilter === "all";

  const tutors = await db.tutorProfile.findMany({
    where: showAll ? {} : { applicationStatus: { in: PENDING_STATUSES } },
    include: {
      user: { select: { name: true, email: true } },
      subjects: { select: { subject: { select: { slug: true } } } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <DashboardShell
      navItems={[
        { label: tNav("overview"), href: "/admin" },
        { label: tNav("tutors"), href: "/admin/tutors" },
      ]}
      userName={user.name ?? ""}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
          <p className="mt-2 text-slate">{t("description")}</p>
        </div>
        <div className="flex gap-2">
          <Button href="/admin/tutors" variant={showAll ? "outline" : "primary"} size="sm">
            {t("filterPending")}
          </Button>
          <Button href="/admin/tutors?status=all" variant={showAll ? "primary" : "outline"} size="sm">
            {t("filterAll")}
          </Button>
        </div>
      </div>

      {tutors.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center text-slate">
          {t("empty")}
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-4">
          {tutors.map((tutor) => (
            <div
              key={tutor.id}
              className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-navy">{tutor.user.name}</p>
                  <Badge variant={tutor.applicationStatus === "APPROVED" ? "mint" : "outline"}>
                    {tStatus(tutor.applicationStatus)}
                  </Badge>
                </div>
                <p className="text-sm text-slate">{tutor.user.email}</p>
                {tutor.headline && <p className="mt-1 text-sm font-semibold text-navy">{tutor.headline}</p>}
                {tutor.subjects.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {tutor.subjects.map((s) => (
                      <Badge key={s.subject.slug} variant="neutral">
                        {tSubjects(s.subject.slug)}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {(tutor.applicationStatus === "SUBMITTED" || tutor.applicationStatus === "UNDER_REVIEW") && (
                <div className="flex shrink-0 gap-2">
                  <form action={rejectTutorAction.bind(null, tutor.id)}>
                    <Button type="submit" variant="outline" size="sm">
                      {t("reject")}
                    </Button>
                  </form>
                  <form action={approveTutorAction.bind(null, tutor.id)}>
                    <Button type="submit" size="sm">
                      {t("approve")}
                    </Button>
                  </form>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
