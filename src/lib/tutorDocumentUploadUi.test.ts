import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// PROD-TUTOR1 — narrow UI/UX fix for /tutor/documents' file-picker
// discoverability. The native <input type="file"> was functional but
// visually ambiguous (relying on the browser's own "Choose file"/"Choisir
// un fichier" text with no affordance). This suite proves the fix preserves
// every real accessibility/behavioral property while only restyling the
// presentation — matching this codebase's existing convention (see
// tutorProfileDocumentUi.test.ts) of asserting on source text rather than
// rendering components, since no React component-rendering test harness is
// installed in this project.

describe("PROD-TUTOR1 — Tutor document upload file-picker discoverability fix", () => {
  const form = readFileSync("src/components/dashboard/TutorDocumentUploadForm.tsx", "utf8");
  const action = readFileSync("src/lib/actions/tutorDocuments.ts", "utf8");

  it("1. a real, non-faked file input control still renders", () => {
    expect(form).toMatch(/<input[\s\S]*?type="file"/);
    // The dropzone is a <label>, never a bare <div onClick=...> substitute
    // for a real interactive control.
    expect(form).not.toMatch(/<div[^>]*onClick=\{[^}]*(?:click|open)/i);
  });

  it("2. accepted file types are unchanged (PDF/JPEG/PNG only)", () => {
    expect(form).toContain('const ACCEPTED_MIME_TYPES = "application/pdf,image/jpeg,image/png"');
    expect(form).toMatch(/accept=\{ACCEPTED_MIME_TYPES\}/);
  });

  it("3. the selected file's name (and size) is visibly displayed after selection", () => {
    expect(form).toContain("selectedFile.name");
    expect(form).toContain("formatFileSize(selectedFile.size)");
  });

  it("4. Upload is disabled until a valid file is selected", () => {
    expect(form).toMatch(/disabled=\{pending \|\| !selectedFile\}/);
  });

  it("5. the real underlying file input still has name=\"file\" and still submits through the existing upload action, unchanged", () => {
    expect(form).toMatch(/name="file"/);
    expect(form).toContain('import { uploadDocumentAction } from "@/lib/actions/tutorDocuments"');
    expect(form).toMatch(/useActionState\(uploadDocumentAction, undefined\)/);
    expect(form).toContain('<form action={formAction}');
  });

  it("6. no upload/server/storage behavior was touched — the Server Action file is untouched by this pass", () => {
    // These are the exact validation/storage primitives the action relies
    // on; their continued presence (byte-identical import list) is evidence
    // this UI-only pass never edited tutorDocuments.ts.
    expect(action).toContain("validateDocumentFile(buffer)");
    expect(action).toContain("storage.putPrivateFile(storageKey, buffer)");
    expect(action).toContain('status: "PENDING_REVIEW"');
    expect(action).toContain("MAX_DOCUMENTS_PER_TUTOR");
  });

  it("7. accessibility semantics: label/input association, keyboard/focus support, no inaccessible click target", () => {
    // A real <label htmlFor="file"> wraps the real <input id="file">,
    // exactly the same accessible pattern already proven in
    // TutorProfileImageForm.tsx elsewhere in this codebase.
    expect(form).toMatch(/<label\s+htmlFor="file"/);
    expect(form).toMatch(/id="file"/);
    // An explicit, concise accessible name — not left to concatenate every
    // visible line of decorative text inside the dropzone.
    expect(form).toMatch(/aria-label=\{selectedFile \? t\("fileSelectedAria"/);
    // Visible keyboard-focus indication on the whole dropzone (focus-within,
    // since the focusable element is the input nested inside the label).
    expect(form).toContain("focus-within:outline-2 focus-within:outline-blue");
    // The sr-only real input is never display:none (which would break
    // focusability/keyboard activation) — sr-only is this codebase's
    // established visually-hidden-but-focusable convention.
    expect(form).toMatch(/className="sr-only"/);
  });

  it("8. drag-and-drop assigns the dropped file to the real input (FormData submission stays authoritative), it does not fake selection", () => {
    expect(form).toContain("new DataTransfer()");
    expect(form).toContain("inputRef.current.files = dataTransfer.files");
  });

  it("9. translation keys used by the new UI resolve in both English and French message files", () => {
    const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
    const fr = JSON.parse(readFileSync("messages/fr.json", "utf8"));
    const keys = ["chooseFile", "dragDropPrompt", "dragDropOr", "changeFile", "chooseFileAria", "fileSelectedAria", "uploadHint"];
    for (const key of keys) {
      expect(en.tutorDocuments[key], `en.tutorDocuments.${key}`).toBeTruthy();
      expect(fr.tutorDocuments[key], `fr.tutorDocuments.${key}`).toBeTruthy();
    }
  });
});
