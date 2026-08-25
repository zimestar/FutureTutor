import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAX_DOCUMENT_SIZE_BYTES,
  UnsupportedFileError,
  FileTooLargeError,
  validateDocumentFile,
  generateDocumentStorageKey,
  sanitizeFileName,
  isManagedDocumentKey,
  TUTOR_VERIFICATION_DOCUMENTS_BUCKET,
} from "@/lib/storage";

const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const svg = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>");

describe("Tutor verification document validation", () => {
  it.each([
    [pdf, "application/pdf"],
    [jpeg, "image/jpeg"],
    [png, "image/png"],
  ] as const)("accepts a valid document signature", (bytes, mime) => {
    expect(validateDocumentFile(bytes)).toBe(mime);
  });

  it("rejects SVG (no PDF/JPEG/PNG signature)", () => {
    expect(() => validateDocumentFile(svg)).toThrow(UnsupportedFileError);
  });

  it("rejects a renamed/disguised arbitrary binary", () => {
    expect(() => validateDocumentFile(Buffer.from([0x4d, 0x5a, 0x90, 0x00]))).toThrow(UnsupportedFileError); // MZ (Windows executable) header
  });

  it("rejects an empty file", () => {
    expect(() => validateDocumentFile(Buffer.alloc(0))).toThrow(UnsupportedFileError);
  });

  it("rejects an oversized file", () => {
    const oversized = Buffer.concat([pdf, Buffer.alloc(MAX_DOCUMENT_SIZE_BYTES)]);
    expect(() => validateDocumentFile(oversized)).toThrow(FileTooLargeError);
  });

  it("preserves the existing 10 MB size limit", () => {
    expect(MAX_DOCUMENT_SIZE_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe("Tutor verification document storage key generation", () => {
  it("generates a key namespaced under the owner's userId, with a server-generated UUID and derived extension", () => {
    const key = generateDocumentStorageKey({ userId: "user_abc123", mimeType: "application/pdf" });
    expect(key).toMatch(/^tutors\/user_abc123\/verification\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/);
  });

  it("never derives the extension from anything other than the validated MIME type", () => {
    expect(generateDocumentStorageKey({ userId: "u", mimeType: "image/jpeg" })).toMatch(/\.jpg$/);
    expect(generateDocumentStorageKey({ userId: "u", mimeType: "image/png" })).toMatch(/\.png$/);
    expect(() => generateDocumentStorageKey({ userId: "u", mimeType: "image/svg+xml" })).toThrow(UnsupportedFileError);
  });

  it("two keys for the same tutor are never equal (no filename/path collision)", () => {
    const a = generateDocumentStorageKey({ userId: "user_abc123", mimeType: "application/pdf" });
    const b = generateDocumentStorageKey({ userId: "user_abc123", mimeType: "application/pdf" });
    expect(a).not.toBe(b);
  });

  it("every generated key is itself accepted by the managed-key guard", () => {
    expect(isManagedDocumentKey(generateDocumentStorageKey({ userId: "user_abc123", mimeType: "application/pdf" }))).toBe(true);
  });
});

describe("Managed document key guard — path traversal / arbitrary object protection", () => {
  it("rejects path traversal attempts", () => {
    expect(isManagedDocumentKey("tutors/../../../etc/passwd")).toBe(false);
    expect(isManagedDocumentKey("tutors/u1/verification/../u2/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000000.pdf")).toBe(false);
  });

  it("rejects keys outside the tutors/{userId}/verification/ namespace", () => {
    expect(isManagedDocumentKey("some-other-bucket/object")).toBe(false);
    expect(isManagedDocumentKey("tutor-profile-images/tutors/u1/photo.jpg")).toBe(false);
  });

  it("rejects a disallowed extension (arbitrary object type)", () => {
    expect(isManagedDocumentKey("tutors/u1/verification/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000000.exe")).toBe(false);
    expect(isManagedDocumentKey("tutors/u1/verification/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000000.svg")).toBe(false);
  });

  it("accepts a well-formed managed key", () => {
    expect(isManagedDocumentKey("tutors/u1/verification/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000000.pdf")).toBe(true);
  });
});

describe("sanitizeFileName", () => {
  it("strips path separators so display filenames can never carry a path", () => {
    expect(sanitizeFileName("../../etc/passwd")).not.toContain("/");
    expect(sanitizeFileName("..\\..\\windows\\system32")).not.toContain("\\");
  });
});

describe("Tutor verification document storage — source boundary", () => {
  const source = readFileSync("src/lib/storage.ts", "utf8");

  it("is server-only and uses the server-only service-role credential, never a NEXT_PUBLIC_ variant", () => {
    expect(source).toContain('import "server-only"');
    expect(source).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(source).not.toMatch(/NEXT_PUBLIC_[A-Z_]*SERVICE_ROLE/);
  });

  it("targets the private tutor-verification-documents bucket, distinct from the public profile-photo bucket", () => {
    expect(TUTOR_VERIFICATION_DOCUMENTS_BUCKET).toBe("tutor-verification-documents");
    expect(source).not.toContain("tutor-profile-images");
    expect(source).not.toMatch(/object\/public\//); // never construct a public-bucket URL
  });

  it("never generates or persists a signed URL — retrieval is proxied through an already-authorized server route", () => {
    expect(source).not.toMatch(/\/storage\/v1\/object\/sign\//);
    expect(source).not.toMatch(/signedUrl|createSignedUrl/i);
  });

  it("validates every storage key against the managed-key pattern before any network call (path traversal / arbitrary object guard)", () => {
    const putIdx = source.indexOf("async putPrivateFile");
    const getIdx = source.indexOf("async getFileBuffer");
    const delIdx = source.indexOf("async deletePrivateFile");
    const nextFetchAfter = (from: number) => source.indexOf("fetch(", from);
    for (const methodIdx of [putIdx, getIdx, delIdx]) {
      expect(methodIdx).toBeGreaterThan(-1);
      const assertIdx = source.indexOf("assertManagedDocumentKey(key)", methodIdx);
      expect(assertIdx).toBeGreaterThan(methodIdx);
      expect(assertIdx).toBeLessThan(nextFetchAfter(methodIdx));
    }
  });

  it("never logs the service-role credential or any storage key", () => {
    expect(source).not.toMatch(/console\.(?:log|info|warn|error)/);
  });
});

describe("Tutor document Server Actions — authorization/source contract", () => {
  const action = readFileSync("src/lib/actions/tutorDocuments.ts", "utf8");

  it("derives the Tutor identity from the authenticated server session, never from client-supplied form fields", () => {
    expect(action).toContain('session.user.role !== "TUTOR"');
    expect(action).toContain("userId: tutorProfile.userId");
    expect(action).not.toMatch(/formData\.get\(["'](?:userId|tutorId|tutorProfileId)["']\)/);
  });

  it("checks document ownership against the authenticated Tutor's own profile before replace or delete", () => {
    const replaceIdx = action.indexOf("export async function replaceDocumentAction");
    const removeIdx = action.indexOf("export async function removeDocumentAction");
    expect(action.indexOf("existing.tutorProfileId !== tutorProfile.id", replaceIdx)).toBeGreaterThan(replaceIdx);
    expect(action.indexOf("existing.tutorProfileId !== tutorProfile.id", removeIdx)).toBeGreaterThan(removeIdx);
  });

  it("never allows replace or delete once a document is APPROVED (preserves validation-evidence integrity)", () => {
    const matches = action.match(/existing\.status === "APPROVED"/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2); // replace + remove
  });

  it("uploads the new object before creating the DB row, and cleans up the orphan if the DB write fails", () => {
    const uploadIdx = action.indexOf("await storage.putPrivateFile(storageKey, buffer)");
    const createIdx = action.indexOf("await db.tutorDocument.create(");
    expect(uploadIdx).toBeGreaterThan(-1);
    expect(uploadIdx).toBeLessThan(createIdx);
    const catchIdx = action.indexOf("catch (error) {", createIdx);
    const cleanupIdx = action.indexOf("await storage.deletePrivateFile(storageKey)", catchIdx);
    expect(cleanupIdx).toBeGreaterThan(catchIdx);
  });

  it("on replace, uploads the new object first and only deletes the old object after the DB reference is safely persisted", () => {
    const replaceIdx = action.indexOf("export async function replaceDocumentAction");
    const uploadNewIdx = action.indexOf("await storage.putPrivateFile(newKey, buffer)", replaceIdx);
    const dbUpdateIdx = action.indexOf("await db.tutorDocument.update(", replaceIdx);
    const deleteOldIdx = action.lastIndexOf("await storage.deletePrivateFile(oldKey)");
    expect(uploadNewIdx).toBeGreaterThan(replaceIdx);
    expect(uploadNewIdx).toBeLessThan(dbUpdateIdx);
    expect(dbUpdateIdx).toBeLessThan(deleteOldIdx);
  });

  it("if the new upload fails outright, no storage call ever touches the old object (old document remains usable)", () => {
    const replaceIdx = action.indexOf("export async function replaceDocumentAction");
    const removeIdx = action.indexOf("export async function removeDocumentAction");
    const uploadCatchIdx = action.indexOf("replaceFailed", replaceIdx);
    const firstOldDeleteAfterUploadCatch = action.indexOf("await storage.deletePrivateFile(oldKey)", uploadCatchIdx);
    // The only deletion of oldKey happens after the DB update succeeds (asserted above),
    // never inside the upload-failure branch itself.
    const dbUpdateIdx = action.indexOf("await db.tutorDocument.update(", replaceIdx);
    expect(firstOldDeleteAfterUploadCatch).toBeGreaterThan(dbUpdateIdx);
    expect(removeIdx).toBeGreaterThan(replaceIdx);
  });

  it("on delete, removes the DB row (the authoritative reference) before best-effort deleting the storage object", () => {
    const removeIdx = action.indexOf("export async function removeDocumentAction");
    const dbDeleteIdx = action.indexOf("await db.tutorDocument.delete(", removeIdx);
    const storageDeleteIdx = action.indexOf("await storage.deletePrivateFile(existing.storageKey)", removeIdx);
    expect(dbDeleteIdx).toBeGreaterThan(removeIdx);
    expect(dbDeleteIdx).toBeLessThan(storageDeleteIdx);
  });
});

describe("Tutor document retrieval route — authorization/source contract", () => {
  const route = readFileSync("src/app/api/documents/[id]/route.ts", "utf8");

  it("denies unauthenticated access", () => {
    expect(route).toContain("if (!user)");
    expect(route).toMatch(/status:\s*401/);
  });

  it("grants access only to the owning Tutor or an Admin holding the ADMIN_TUTORS_READ permission — never a blanket role check", () => {
    expect(route).toContain("document.tutorProfile.userId === user.id");
    expect(route).toContain('requireAdminPermission(session, "ADMIN_TUTORS_READ")');
    expect(route).not.toMatch(/user\.role === "ADMIN"\s*\)\s*\{\s*isAdmin = true/); // never trust role alone
  });

  it("denies when neither owner nor authorized admin", () => {
    expect(route).toContain("!isOwner && !isAdmin");
    expect(route).toMatch(/status:\s*403/);
  });

  it("never persists or exposes a permanent public URL for the returned document", () => {
    expect(route).not.toMatch(/object\/public\//);
    expect(route).toContain("Cache-Control");
    expect(route).toMatch(/no-store/);
  });
});

describe("Admin permission scoping for Tutor documents (existing permission matrix, unchanged)", () => {
  it("only presets that legitimately review tutors can read Tutor documents", async () => {
    const { ADMIN_PRESETS } = await import("@/services/adminPermissions");
    expect(ADMIN_PRESETS.TUTOR_SUCCESS).toContain("ADMIN_TUTORS_READ");
    expect(ADMIN_PRESETS.FULL_ACCESS).toContain("ADMIN_TUTORS_READ");
  });

  it("Finance-Read-Only admins cannot read Tutor documents unless explicitly granted", async () => {
    const { ADMIN_PRESETS } = await import("@/services/adminPermissions");
    expect(ADMIN_PRESETS.FINANCE_READ_ONLY).not.toContain("ADMIN_TUTORS_READ");
  });

  it("Operations admins (view-only tutor access) do not get the review permission that gates document decisions", async () => {
    const { ADMIN_PRESETS } = await import("@/services/adminPermissions");
    expect(ADMIN_PRESETS.OPERATIONS).toContain("ADMIN_TUTORS_READ");
    expect(ADMIN_PRESETS.OPERATIONS).not.toContain("ADMIN_TUTORS_REVIEW");
  });
});
