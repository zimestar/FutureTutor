import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { TutorDocumentsSection } from "@/components/dashboard/TutorDocumentsSection";
import { tutorNavItems } from "@/lib/tutorNav";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function TutorDocumentsPage({
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

  const t = await getTranslations({ locale, namespace: "tutorDocuments" });
  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });

  const tutorProfile = await db.tutorProfile.findUnique({ where: { userId: user.id } });
  if (!tutorProfile) {
    redirect({ href: "/tutor/dashboard", locale });
    return;
  }

  const documents = await db.tutorDocument.findMany({
    where: { tutorProfileId: tutorProfile.id },
    orderBy: { uploadedAt: "desc" },
    select: { id: true, type: true, status: true, originalFileName: true, rejectionReason: true },
  });

  return (
    <DashboardShell navItems={tutorNavItems(tNav, tutorProfile.applicationStatus)} userName={user.name ?? ""}>
      <PageHeader title={t("title")} description={t("subtitle")} eyebrow={t("eyebrow")} />
      <TutorDocumentsSection documents={documents} t={t} />
    </DashboardShell>
  );
}
