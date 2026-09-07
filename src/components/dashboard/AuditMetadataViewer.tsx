import type { SafeMetadataField } from "@/lib/auditLogPresentation";

/**
 * ADMIN-AUDITLOG-VIEWER1 — renders an already-redacted, already-bounded
 * list of metadata fields (see redactAuditMetadata) as a plain key/value
 * list. Never receives or renders raw JSON — the caller has already
 * decided what's safe (redaction) and how much to show (bounding); this
 * component's only job is display.
 */
export function AuditMetadataViewer({ fields, emptyLabel, redactedLabel }: { fields: SafeMetadataField[]; emptyLabel: string; redactedLabel: string }) {
  if (fields.length === 0) {
    return <p className="text-sm text-text-secondary" data-testid="audit-metadata-empty">{emptyLabel}</p>;
  }

  return (
    <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2" data-testid="audit-metadata-list">
      {fields.map((field) => (
        <div key={field.key} className="min-w-0 rounded-md border border-border bg-surface-subtle p-2">
          <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">{field.key}</dt>
          <dd className="mt-0.5 break-words text-text-primary" data-testid={field.redacted ? "audit-metadata-redacted" : "audit-metadata-value"}>
            {field.redacted ? redactedLabel : field.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
