import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { TutorRankingSettingsForm } from "@/components/dashboard/TutorRankingSettingsForm";
import { AutoRefresh } from "@/components/dashboard/AutoRefresh";
import { Badge } from "@/components/ui/Badge";
import { adminNavItems } from "@/lib/adminNav";
import { expireStaleInvitationsAndAdvance } from "@/services/quickMatchDispatch";

export default async function AdminQuickMatchPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  const user = session?.user;
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
    redirect({ href: "/login", locale });
    return;
  }

  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });
  const tSubjects = await getTranslations({ locale, namespace: "subjects.items" });
  const t = await getTranslations({ locale, namespace: "admin.quickMatch" });
  const tStatus = await getTranslations({ locale, namespace: "admin.statuses" });

  await expireStaleInvitationsAndAdvance();

  const [settings, liveRequests] = await Promise.all([
    db.tutorRankingSettings.findFirst(),
    db.tutoringRequest.findMany({
      where: { status: { in: ["PRICED", "MATCHING"] } },
      include: {
        subject: { select: { slug: true } },
        studentProfile: { select: { firstName: true, lastName: true } },
        invitations: { where: { status: "PENDING" }, select: { id: true, tutorProfile: { select: { user: { select: { name: true } } } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <DashboardShell navItems={await adminNavItems(tNav, user)} userName={user.name ?? ""}>
      <AutoRefresh />
      <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
      <p className="mt-2 max-w-2xl text-slate">
        {t("description")}
      </p>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold text-navy">{t("settings")}</h2>
        {settings && (
          <TutorRankingSettingsForm
            values={{
              responseWindowMinutes: settings.responseWindowMinutes,
              sequentialInvitationCount: settings.sequentialInvitationCount,
              parallelBatchSize: settings.parallelBatchSize,
              maxDispatchAttempts: settings.maxDispatchAttempts,
              tutorScoreWeight: settings.tutorScoreWeight,
              bookingReliabilityWeight: settings.bookingReliabilityWeight,
              invitationResponsivenessWeight: settings.invitationResponsivenessWeight,
              tutorTierWeight: settings.tutorTierWeight,
              minInvitationsForReliabilityData: settings.minInvitationsForReliabilityData,
              rankingVersion: settings.rankingVersion,
            }}
          />
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-bold text-navy">{t("requests", { count: liveRequests.length })}</h2>
        {liveRequests.length === 0 ? (
          <p className="text-sm text-slate">{t("empty")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {liveRequests.map((request) => (
              <div key={request.id} className="rounded-lg border border-neutral-200 bg-white p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-navy">
                    {tSubjects(request.subject.slug)} — {request.studentProfile.firstName} {request.studentProfile.lastName}
                  </span>
                  <Badge variant={request.status === "MATCHING" ? "blue" : "outline"}>{tStatus(request.status)}</Badge>
                </div>
                <p className="mt-1 text-xs text-slate">
                  {t("roundInvitations", { round: request.dispatchRound, count: request.invitations.length })}
                  {request.invitations.length > 0 &&
                    ` (${request.invitations.map((i) => i.tutorProfile.user.name ?? "?").join(", ")})`}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
