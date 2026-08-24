import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { TutorProfileForm } from "@/components/dashboard/TutorProfileForm";
import { TutorEducationForm } from "@/components/dashboard/TutorEducationForm";
import { tutorNavItems } from "@/lib/tutorNav";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { Surface } from "@/components/ui/Surface";
import { TutorProfileImageForm } from "@/components/dashboard/TutorProfileImageForm";

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
      user: { select: { name: true, image: true } },
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
    <DashboardShell navItems={tutorNavItems(tNav, tutorProfile.applicationStatus)} userName={user.name ?? ""} userImage={tutorProfile.user.image}>
      <PageHeader
        eyebrow={t("sections.publicProfile.eyebrow")}
        title={t("title")}
        description={t("subtitle")}
        status={(tutorProfile.applicationStatus === "DRAFT" || tutorProfile.applicationStatus === "APPROVED")
          ? <Badge variant={tutorProfile.applicationStatus === "APPROVED" ? "mint" : "outline"}>{t("editableStatus")}</Badge>
          : undefined}
      />

      <Surface className="mt-8 max-w-4xl" padding="lg" aria-labelledby="profile-photo-title">
        <h2 id="profile-photo-title" className="text-lg font-extrabold text-text-primary">{t("photo.title")}</h2>
        <p className="mt-1 text-sm leading-6 text-text-secondary">{t("photo.description")}</p>
        <TutorProfileImageForm name={tutorProfile.user.name ?? user.name ?? "Tutor"} image={tutorProfile.user.image} />
      </Surface>

      <Surface className="mt-6 max-w-4xl" padding="lg" aria-labelledby="profile-identity-title">
        <h2 id="profile-identity-title" className="text-lg font-extrabold text-text-primary">{t("sections.identity.title")}</h2>
        <p className="mt-1 text-sm leading-6 text-text-secondary">{t("sections.identity.description")}</p>
        <div className="mt-6">
        <TutorProfileForm
          applicationStatus={tutorProfile.applicationStatus}
          values={{
            headline: tutorProfile.headline ?? "",
            bio: tutorProfile.bio ?? "",
            subjectSlugs: tutorProfile.subjects.map((s) => s.subject.slug),
            levelSlugs: tutorProfile.levels.map((l) => l.academicLevel.slug),
            languages: tutorProfile.languages.map((l) => l.language),
            yearsExperience: tutorProfile.yearsExperience ?? "",
            city: tutorProfile.city ?? "",
            province: tutorProfile.province ?? "",
            learningMode: tutorProfile.learningMode ?? "",
          }}
        />
        </div>
      </Surface>

      <Surface className="mt-6 max-w-4xl" padding="lg" aria-labelledby="profile-qualifications-title">
        <h2 id="profile-qualifications-title" className="text-lg font-extrabold text-text-primary">{t("sections.qualifications.title")}</h2>
        <p className="mt-1 text-sm leading-6 text-text-secondary">{t("sections.qualifications.description")}</p>
        <div className="mt-6">
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
      </Surface>

      <Surface className="mt-6 max-w-4xl bg-surface-subtle" aria-labelledby="public-profile-title">
        <h2 id="public-profile-title" className="text-lg font-extrabold text-text-primary">{t("sections.publicProfile.title")}</h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">{t("sections.publicProfile.description")}</p>
      </Surface>
    </DashboardShell>
  );
}
