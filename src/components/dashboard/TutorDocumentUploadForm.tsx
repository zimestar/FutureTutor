"use client";

import { useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { UploadCloud, FileText } from "lucide-react";
import { Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { uploadDocumentAction } from "@/lib/actions/tutorDocuments";

const DOCUMENT_TYPES = ["TRANSCRIPT", "DIPLOMA", "DEGREE", "CERTIFICATE", "ENROLLMENT_PROOF", "OTHER"] as const;
const ACCEPTED_MIME_TYPES = "application/pdf,image/jpeg,image/png";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TutorDocumentUploadForm() {
  const t = useTranslations("tutorDocuments");
  const [state, formAction, pending] = useActionState(uploadDocumentAction, undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleClear(event: React.MouseEvent) {
    // Nested <button> inside the <label> — browsers do not forward a click
    // from a real interactive descendant (button/a/input/...) into a
    // synthetic click on the label's associated control, but preventDefault/
    // stopPropagation is kept as defense-in-depth across browser quirks.
    event.preventDefault();
    event.stopPropagation();
    setSelectedFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2 sm:items-start lg:grid-cols-[14rem_minmax(0,1fr)_auto]">
      {state?.error && (
        <p role="alert" className="w-full rounded-md bg-error-light px-4 py-3 text-sm font-semibold text-error sm:col-span-2 lg:col-span-3">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="w-full rounded-md bg-success-light px-4 py-3 text-sm font-semibold text-success sm:col-span-2 lg:col-span-3">
          {t("uploadSuccess")}
        </p>
      )}
      <div className="min-w-0">
        <label htmlFor="type" className="mb-1.5 block text-sm font-semibold text-navy">
          {t("typeLabel")}
        </label>
        <Select id="type" name="type" required className="w-full">
          {DOCUMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`types.${type}`)}
            </option>
          ))}
        </Select>
      </div>

      <div className="min-w-0">
        <label
          htmlFor="file"
          aria-label={selectedFile ? t("fileSelectedAria", { filename: selectedFile.name }) : t("chooseFileAria")}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (!file || !inputRef.current) return;
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            inputRef.current.files = dataTransfer.files;
            setSelectedFile(file);
          }}
          className={`flex min-h-32 w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed px-4 py-5 text-center transition-colors focus-within:outline-2 focus-within:outline-blue focus-within:outline-offset-2 ${
            isDragging ? "border-blue bg-blue/5" : "border-neutral-300 bg-neutral-100/60 hover:border-navy hover:bg-neutral-100"
          }`}
        >
          <input
            ref={inputRef}
            id="file"
            name="file"
            type="file"
            accept={ACCEPTED_MIME_TYPES}
            required
            className="sr-only"
            onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
          />
          {selectedFile ? (
            <>
              <FileText className="size-6 text-blue" aria-hidden="true" />
              <span className="max-w-full truncate text-sm font-semibold text-navy">{selectedFile.name}</span>
              <span className="text-xs text-slate">{formatFileSize(selectedFile.size)}</span>
              <button
                type="button"
                onClick={handleClear}
                className="mt-1 rounded text-xs font-semibold text-blue underline underline-offset-2 hover:text-blue-hover focus-visible:outline-2 focus-visible:outline-blue focus-visible:outline-offset-2"
              >
                {t("changeFile")}
              </button>
            </>
          ) : (
            <>
              <UploadCloud className="size-6 text-slate" aria-hidden="true" />
              <span className="text-sm font-semibold text-navy">{t("dragDropPrompt")}</span>
              <span className="text-xs text-slate">{t("dragDropOr")}</span>
              <span className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-bold text-navy">
                {t("chooseFile")}
              </span>
              <span className="text-xs text-slate">{t("uploadHint")}</span>
            </>
          )}
        </label>
      </div>

      <Button type="submit" disabled={pending || !selectedFile} className="w-full self-start sm:w-auto">
        {pending ? t("uploading") : t("upload")}
      </Button>
    </form>
  );
}
