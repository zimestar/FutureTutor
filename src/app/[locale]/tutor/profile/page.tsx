import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { TutorProfileForm } from "@/components/dashboard/TutorProfileForm";
import { TutorEducationForm } from "@/components/dashboard/TutorEducationForm";
import { tutorNavItems } from "@/lib/tutorNav";

export default async function TutorProfilePage({
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

  const t = await getTranslations({ locale, namespace: "tutorProfileForm" });
  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });

  const tutorProfile = await db.tutorProfile.findUnique({
    where: { userId: user.id },
    include: {
      subjects: { select: { subject: { select: { slug: true } } } },
      levels: { select: { academicLevel: { select: { slug: true } } } },
      languages: { select: { language: true } },
      education: true,
      certifications: true,
    },
  });

  if (!tutorProfile) {
    redirect({ href: "/tutor/dashboard", locale });
    return;
  }

  return (
    <DashboardShell navItems={tutorNavItems(tNav)} userName={user.name ?? ""}>
      <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
      <p className="mt-2 max-w-xl text-slate">{t("subtitle")}</p>

      <div className="mt-8 max-w-2xl rounded-xl border border-neutral-200 bg-white p-6 md:p-8">
        <TutorProfileForm
          applicationStatus={tutorProfile.applicationStatus}
          values={{
            headline: tutorProfile.headline ?? "",
            bio: tutorProfile.bio ?? "",
            subjectSlugs: tutorProfile.subjects.map((s) => s.subject.slug),
            levelSlugs: tutorProfile.levels.map((l) => l.academicLevel.slug),
            languages: tutorProfile.languages.map((l) => l.language),
            hourlyRateCad: tutorProfile.hourlyRateCents ? tutorProfile.hourlyRateCents / 100 : "",
            yearsExperience: tutorProfile.yearsExperience ?? "",
            city: tutorProfile.city ?? "",
            province: tutorProfile.province ?? "",
            learningMode: tutorProfile.learningMode ?? "",
          }}
        />
      </div>

      <div className="mt-8 max-w-2xl rounded-xl border border-neutral-200 bg-white p-6 md:p-8">
        <TutorEducationForm
          initialEducation={tutorProfile.education.map((e) => ({
            institution: e.institution,
            degree: e.degree ?? "",
            fieldOfStudy: e.fieldOfStudy ?? "",
            startYear: e.startYear?.toString() ?? "",
            endYear: e.endYear?.toString() ?? "",
          }))}
          initialCertifications={tutorProfile.certifications.map((c) => ({
            name: c.name,
            issuer: c.issuer ?? "",
            issueYear: c.issueYear?.toString() ?? "",
            credentialUrl: c.credentialUrl ?? "",
          }))}
        />
      </div>
    </DashboardShell>
  );
}
