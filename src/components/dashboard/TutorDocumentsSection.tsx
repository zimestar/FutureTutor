import type { TutorDocumentStatus, TutorDocumentType } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/Badge";
import { Alert, EmptyState } from "@/components/ui/Feedback";
import { Surface } from "@/components/ui/Surface";
import { TutorDocumentUploadForm } from "@/components/dashboard/TutorDocumentUploadForm";
import { TutorDocumentRowActions } from "@/components/dashboard/TutorDocumentRowActions";

const statusVariant = { UPLOADED: "outline", PENDING_REVIEW: "outline", APPROVED: "mint", REJECTED: "outline", REPLACEMENT_REQUIRED: "outline" } as const;

export interface TutorDocumentSummary {
  id: string;
  type: TutorDocumentType;
  status: TutorDocumentStatus;
  originalFileName: string;
  rejectionReason: string | null;
}

/**
 * Shared upload + list UI for a Tutor's verification documents, reused by
 * both /tutor/documents (the standalone approval-pipeline page) and the
 * "Supporting documents" section on /tutor/profile — one document system,
 * two entry points, so an already-APPROVED tutor (whose nav no longer shows
 * a dedicated Documents link) can still reach it from their profile.
 */
export function TutorDocumentsSection({
  documents,
  t,
}: {
  documents: TutorDocumentSummary[];
  t: (key: string, values?: Record<string, string | number | Date>) => string;
}) {
  return (
    <>
      <Surface className="mt-6 max-w-4xl" padding="lg" aria-labelledby="document-upload-title">
        <h2 id="document-upload-title" className="text-lg font-extrabold text-text-primary">{t("uploadTitle")}</h2>
        <p className="mt-1 text-sm leading-6 text-text-secondary">{t("uploadDescription")}</p>
        <div className="mt-5">
          <TutorDocumentUploadForm />
        </div>
      </Surface>

      <section className="mt-6 max-w-4xl" aria-labelledby="document-history-title">
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
                <div className="min-w-0">
                  <p className="font-semibold text-navy">{t(`types.${doc.type}`)}</p>
                  <p className="truncate text-sm text-slate">{doc.originalFileName}</p>
                  {doc.rejectionReason && (
                    <Alert tone="warning" title={t("replacementGuidanceTitle")} className="mt-3">
                      {doc.rejectionReason}
                    </Alert>
                  )}
                </div>
                <div className="flex flex-col gap-2 sm:items-end">
                  <Badge variant={statusVariant[doc.status]}>{t(`status.${doc.status}`)}</Badge>
                  <TutorDocumentRowActions documentId={doc.id} canModify={doc.status !== "APPROVED"} />
                </div>
              </Surface>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
