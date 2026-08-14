import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { TutorInvitationCard } from "@/components/dashboard/TutorInvitationCard";
import { AutoRefresh } from "@/components/dashboard/AutoRefresh";
import { tutorNavItems } from "@/lib/tutorNav";
import { expireStaleInvitationsAndAdvance } from "@/services/quickMatchDispatch";

export default async function TutorQuickMatchPage({
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

  const t = await getTranslations({ locale, namespace: "quickMatch.tutorInvitation" });
  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });
  const tSubjects = await getTranslations({ locale, namespace: "subjects.items" });
  const tLevels = await getTranslations({ locale, namespace: "gradeLevels" });
  const tMode = await getTranslations({ locale, namespace: "quickMatch.mode" });

  // Lazy expiry-on-read (see quickMatchDispatch.ts) — a stale PENDING
  // invitation must never be shown as acceptable.
  await expireStaleInvitationsAndAdvance();

  const tutorProfile = await db.tutorProfile.findUnique({ where: { userId: user.id } });

  const pendingInvitations = tutorProfile
    ? await db.tutorInvitation.findMany({
        where: { tutorProfileId: tutorProfile.id, status: "PENDING" },
        include: {
          tutoringRequest: {
            select: {
              tutoringMode: true,
              requestedStartAt: true,
              durationMinutes: true,
              city: true,
              province: true,
              postalCode: true,
              notes: true,
              subject: { select: { slug: true } },
              academicLevel: { select: { slug: true } },
            },
          },
          tutorPayoutQuote: { select: { totalPayoutCents: true, currency: true } },
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  return (
    <DashboardShell navItems={tutorNavItems(tNav)} userName={user.name ?? ""}>
      <AutoRefresh />
      <h1 className="text-2xl font-bold text-navy">{t("pageTitle")}</h1>
      <p className="mt-2 max-w-xl text-slate">{t("pageDescription")}</p>

      {pendingInvitations.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
          <p className="text-slate">{t("empty")}</p>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-3">
          {pendingInvitations.map((invitation) => (
            <TutorInvitationCard
              key={invitation.id}
              tutorInvitationId={invitation.id}
              subjectLabel={tSubjects(invitation.tutoringRequest.subject.slug)}
              levelLabel={
                invitation.tutoringRequest.academicLevel ? tLevels(invitation.tutoringRequest.academicLevel.slug) : t("anyLevel")
              }
              modeLabel={tMode(invitation.tutoringRequest.tutoringMode)}
              requestedStartAt={invitation.tutoringRequest.requestedStartAt.toISOString()}
              durationMinutes={invitation.tutoringRequest.durationMinutes}
              payoutCents={invitation.tutorPayoutQuote?.totalPayoutCents ?? 0}
              currency={invitation.tutorPayoutQuote?.currency ?? "CAD"}
              notes={invitation.tutoringRequest.notes}
              dispatchLocation={
                invitation.tutoringRequest.tutoringMode !== "ONLINE"
                  ? {
                      city: invitation.tutoringRequest.city,
                      province: invitation.tutoringRequest.province,
                      postalCodePrefix: invitation.tutoringRequest.postalCode
                        ? invitation.tutoringRequest.postalCode.slice(0, 3)
                        : null,
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
