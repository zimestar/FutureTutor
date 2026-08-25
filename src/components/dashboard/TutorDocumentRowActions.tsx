"use client";

import { useActionState, useId } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { replaceDocumentAction, removeDocumentAction } from "@/lib/actions/tutorDocuments";

export function TutorDocumentRowActions({ documentId, canModify }: { documentId: string; canModify: boolean }) {
  const t = useTranslations("tutorDocuments");
  const [replaceState, replaceFormAction, replacePending] = useActionState(replaceDocumentAction, undefined);
  const [removeState, removeFormAction, removePending] = useActionState(removeDocumentAction, undefined);
  const fileInputId = useId();

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`/api/documents/${documentId}`}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-semibold text-blue underline"
        >
          {t("view")}
        </a>
        {canModify && (
          <>
            <form action={replaceFormAction} className="flex items-center gap-2">
              <input type="hidden" name="documentId" value={documentId} />
              <label htmlFor={fileInputId} className="sr-only">
                {t("fileLabel")}
              </label>
              <input
                id={fileInputId}
                name="file"
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                required
                className="max-w-40 text-xs text-navy sm:max-w-48"
              />
              <Button type="submit" variant="outline" size="sm" disabled={replacePending}>
                {replacePending ? t("replacing") : t("replace")}
              </Button>
            </form>
            <form action={removeFormAction}>
              <input type="hidden" name="documentId" value={documentId} />
              <Button type="submit" variant="destructive" size="sm" disabled={removePending}>
                {removePending ? t("removing") : t("remove")}
              </Button>
            </form>
          </>
        )}
      </div>
      {replaceState?.error && (
        <p role="alert" className="text-xs font-semibold text-error">
          {replaceState.error}
        </p>
      )}
      {removeState?.error && (
        <p role="alert" className="text-xs font-semibold text-error">
          {removeState.error}
        </p>
      )}
    </div>
  );
}
