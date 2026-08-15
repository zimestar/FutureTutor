import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { StudentActivationNotice } from "@/components/dashboard/StudentActivationNotice";
import { TutorCard } from "@/components/marketing/TutorCard";
import { Button } from "@/components/ui/Button";
import { tutorProfileToCardData } from "@/lib/tutorCard";
import { resolveStudentAccountActivationState } from "@/services/familyManagement";
import { getStudentDashboardNavItems } from "@/lib/dashboardNav";

export default async function FavoritesPage({
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

  const t = await getTranslations({ locale, namespace: "dashboard.student.favorites" });
  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });
  const tSubjects = await getTranslations({ locale, namespace: "subjects.items" });

  const studentProfile = await db.studentProfile.findUnique({ where: { userId: user.id } });

  const navItems = getStudentDashboardNavItems((key) => tNav(key), user.role);

  // Phase H.5 Final Claimant-State UX Correction: see
  // src/app/[locale]/dashboard/page.tsx's identical guard for the full
  // rationale. studentProfile above is still fetched directly for this
  // page's own data (favorites), independent of this gating decision.
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

  const favorites = studentProfile
    ? await db.tutorFavorite.findMany({
        where: { studentProfileId: studentProfile.id },
        include: {
          tutorProfile: {
            include: {
              user: { select: { name: true } },
              subjects: { select: { subject: { select: { slug: true } } } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const favoritedIds = new Set(favorites.map((f) => f.tutorProfileId));
  const tutors = favorites.map((f) => tutorProfileToCardData(f.tutorProfile, tSubjects, favoritedIds));

  return (
    <DashboardShell navItems={navItems} userName={user.name ?? ""}>
      <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
      <p className="mt-2 max-w-xl text-slate">{t("description")}</p>

      {tutors.length > 0 ? (
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {tutors.map((tutor) => (
            <TutorCard key={tutor.id} tutor={tutor} />
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
          <p className="text-slate">{t("empty")}</p>
          <div className="mt-6 flex justify-center">
            <Button href="/find-tutors">{t("findTutorCta")}</Button>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
