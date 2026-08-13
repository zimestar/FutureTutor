import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { TutorDocumentUploadForm } from "@/components/dashboard/TutorDocumentUploadForm";
import { tutorNavItems } from "@/lib/tutorNav";

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
    <DashboardShell navItems={tutorNavItems(tNav)} userName={user.name ?? ""}>
      <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
      <p className="mt-2 max-w-xl text-slate">{t("subtitle")}</p>

      <div className="mt-8 rounded-xl border border-neutral-200 bg-white p-6">
        <TutorDocumentUploadForm />
      </div>

      {documents.length > 0 && (
        <div className="mt-8 flex flex-col gap-3">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-4"
            >
              <div>
                <p className="font-semibold text-navy">{t(`types.${doc.type}`)}</p>
                <p className="text-sm text-slate">{doc.originalFileName}</p>
                {doc.rejectionReason && <p className="mt-1 text-sm text-error">{doc.rejectionReason}</p>}
              </div>
              <Badge variant={statusVariant[doc.status]}>{t(`status.${doc.status}`)}</Badge>
            </div>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
