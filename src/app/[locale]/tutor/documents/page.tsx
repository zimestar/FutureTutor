import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { TutorDocumentUploadForm } from "@/components/dashboard/TutorDocumentUploadForm";
import { tutorNavItems } from "@/lib/tutorNav";
import { Alert, EmptyState } from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { Surface } from "@/components/ui/Surface";

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
  });

  const statusVariant = { UPLOADED: "outline", PENDING_REVIEW: "outline", APPROVED: "mint", REJECTED: "outline", REPLACEMENT_REQUIRED: "outline" } as const;

  return (
    <DashboardShell navItems={tutorNavItems(tNav, tutorProfile.applicationStatus)} userName={user.name ?? ""}>
      <PageHeader title={t("title")} description={t("subtitle")} eyebrow={t("eyebrow")} />

      <Surface className="mt-8" aria-labelledby="document-upload-title">
        <h2 id="document-upload-title" className="text-lg font-extrabold text-text-primary">{t("uploadTitle")}</h2>
        <p className="mt-1 text-sm leading-6 text-text-secondary">{t("uploadDescription")}</p>
        <div className="mt-5">
        <TutorDocumentUploadForm />
        </div>
      </Surface>

      <section className="mt-8" aria-labelledby="document-history-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="document-history-title" className="text-lg font-extrabold text-text-primary">{t("historyTitle")}</h2>
            <p className="mt-1 text-sm text-text-secondary">{t("historyDescription")}</p>
          </div>
          {documents.length > 0 && <Badge variant="neutral">{t("documentCount", { count: documents.length })}</Badge>}
        </div>
        {documents.length === 0 ? (
          <EmptyState className="mt-4" title={t("emptyTitle")} description={t("emptyDescription")} />
        ) : (
        <div className="mt-4 flex flex-col gap-3">
          {documents.map((doc) => (
            <Surface
              key={doc.id}
              padding="sm"
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-semibold text-navy">{t(`types.${doc.type}`)}</p>
                <p className="text-sm text-slate">{doc.originalFileName}</p>
                {doc.rejectionReason && (
                  <Alert tone="warning" title={t("replacementGuidanceTitle")} className="mt-3">
                    {doc.rejectionReason}
                  </Alert>
                )}
              </div>
              <Badge variant={statusVariant[doc.status]}>{t(`status.${doc.status}`)}</Badge>
            </Surface>
          ))}
        </div>
        )}
      </section>
    </DashboardShell>
  );
}
