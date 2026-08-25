import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Link } from "@/i18n/navigation";
import type { TutorApplicationStatus } from "@/generated/prisma/enums";
import { adminNavItems } from "@/lib/adminNav";
import { Avatar } from "@/components/ui/Avatar";

const PENDING_STATUSES: TutorApplicationStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "INTERVIEW_REQUIRED",
  "INTERVIEW_COMPLETED",
  "TRAINING_REQUIRED",
  "TRAINING_COMPLETED",
  "EXAM_REQUIRED",
  "EXAM_COMPLETED",
  "FINAL_REVIEW",
];

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
      user: { select: { name: true, email: true, image: true } },
      subjects: { select: { subject: { select: { slug: true } } } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <DashboardShell navItems={await adminNavItems(tNav, user)} userName={user.name ?? ""}>
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
            <Link
              key={tutor.id}
              href={`/admin/tutors/${tutor.id}`}
              className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-5 transition-colors hover:border-blue/40 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-4">
                <Avatar name={tutor.user.name ?? tutor.user.email} src={tutor.user.image ?? undefined} size={56} />
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
              </div>
              <span className="shrink-0 text-sm font-semibold text-blue">{t("viewApplication")} →</span>
            </Link>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
