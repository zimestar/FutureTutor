"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { requireAdminPermission } from "@/services/adminPermissions";
import { db } from "@/lib/db";
import {
  storage,
  validateDocumentFile,
  generateDocumentStorageKey,
  sanitizeFileName,
  MAX_DOCUMENTS_PER_TUTOR,
  UnsupportedFileError,
  FileTooLargeError,
  DocumentStorageError,
} from "@/lib/storage";
import { approveDocument, rejectDocument, requestDocumentReplacement } from "@/services/tutorApplicationWorkflow";
import type { TutorDocumentType } from "@/generated/prisma/enums";

export type DocumentActionState = { error?: string; success?: boolean } | undefined;

async function requireTutorProfile() {
  const session = await auth();
  if (!session?.user || session.user.role !== "TUTOR") return null;
  return db.tutorProfile.findUnique({ where: { userId: session.user.id } });
}

async function requireAdmin() {
  const session = await auth();
  try { return await requireAdminPermission(session, "ADMIN_TUTORS_REVIEW"); } catch { return null; }
}

const VALID_DOCUMENT_TYPES: TutorDocumentType[] = [
  "TRANSCRIPT",
  "DIPLOMA",
  "DEGREE",
  "CERTIFICATE",
  "ENROLLMENT_PROOF",
  "OTHER",
];

export async function uploadDocumentAction(
  _prevState: DocumentActionState,
  formData: FormData
): Promise<DocumentActionState> {
  const t = await getTranslations("tutorDocuments.errors");
  const tutorProfile = await requireTutorProfile();
  if (!tutorProfile) return { error: t("notATutor") };

  const type = formData.get("type");
  const file = formData.get("file");
  if (typeof type !== "string" || !VALID_DOCUMENT_TYPES.includes(type as TutorDocumentType)) {
    return { error: t("invalidInput") };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: t("invalidInput") };
  }

  const existingCount = await db.tutorDocument.count({ where: { tutorProfileId: tutorProfile.id } });
  if (existingCount >= MAX_DOCUMENTS_PER_TUTOR) return { error: t("tooManyDocuments") };

  const buffer = Buffer.from(await file.arrayBuffer());
  let mimeType: string;
  try {
    mimeType = validateDocumentFile(buffer);
  } catch (error) {
    if (error instanceof FileTooLargeError) return { error: t("fileTooLarge") };
    if (error instanceof UnsupportedFileError) return { error: t("unsupportedFileType") };
    return { error: t("invalidInput") };
  }

  const storageKey = generateDocumentStorageKey({ userId: tutorProfile.userId, mimeType });
  try {
    await storage.putPrivateFile(storageKey, buffer);
  } catch (error) {
    if (error instanceof DocumentStorageError) return { error: t("storage") };
    throw error;
  }

  try {
    await db.tutorDocument.create({
      data: {
        tutorProfileId: tutorProfile.id,
        type: type as TutorDocumentType,
        storageKey,
        originalFileName: sanitizeFileName(file.name),
        mimeType,
        sizeBytes: buffer.byteLength,
        status: "PENDING_REVIEW",
      },
    });
  } catch (error) {
    // The DB row never got created — the newly uploaded object is orphaned.
    // Best-effort cleanup; failure here must not mask the original error.
    try { await storage.deletePrivateFile(storageKey); } catch { /* orphan cleanup can be retried operationally */ }
    throw error;
  }

  revalidatePath("/tutor/documents");
  return { success: true };
}

export type ReplaceDocumentState = { error?: string; success?: boolean } | undefined;

export async function replaceDocumentAction(
  _prevState: ReplaceDocumentState,
  formData: FormData
): Promise<ReplaceDocumentState> {
  const t = await getTranslations("tutorDocuments.errors");
  const tutorProfile = await requireTutorProfile();
  if (!tutorProfile) return { error: t("notATutor") };

  const documentId = formData.get("documentId");
  const file = formData.get("file");
  if (typeof documentId !== "string" || !documentId) return { error: t("notFound") };
  if (!(file instanceof File) || file.size === 0) return { error: t("invalidInput") };

  const existing = await db.tutorDocument.findUnique({ where: { id: documentId } });
  if (!existing || existing.tutorProfileId !== tutorProfile.id) return { error: t("notFound") };
  if (existing.status === "APPROVED") return { error: t("cannotModify") };

  const buffer = Buffer.from(await file.arrayBuffer());
  let mimeType: string;
  try {
    mimeType = validateDocumentFile(buffer);
  } catch (error) {
    if (error instanceof FileTooLargeError) return { error: t("fileTooLarge") };
    if (error instanceof UnsupportedFileError) return { error: t("unsupportedFileType") };
    return { error: t("invalidInput") };
  }

  const newKey = generateDocumentStorageKey({ userId: tutorProfile.userId, mimeType });
  try {
    await storage.putPrivateFile(newKey, buffer);
  } catch {
    // Old object/DB row are both untouched — the previous document is still usable.
    return { error: t("replaceFailed") };
  }

  const oldKey = existing.storageKey;
  try {
    await db.tutorDocument.update({
      where: { id: documentId },
      data: {
        storageKey: newKey,
        originalFileName: sanitizeFileName(file.name),
        mimeType,
        sizeBytes: buffer.byteLength,
        status: "PENDING_REVIEW",
        rejectionReason: null,
        reviewedAt: null,
        reviewedByUserId: null,
        adminNotes: null,
      },
    });
  } catch {
    // DB update failed — the old row/object are still exactly as they were,
    // so the tutor's previous document remains usable. Best-effort cleanup
    // of the orphaned new object; cleanup failure is non-fatal.
    try { await storage.deletePrivateFile(newKey); } catch { /* orphan cleanup can be retried operationally */ }
    return { error: t("replaceFailed") };
  }

  // The DB row now points at the new object — only now is it safe to
  // best-effort remove the old one. Cleanup failure is non-fatal; a
  // successful replacement must never be rolled back by it.
  try { await storage.deletePrivateFile(oldKey); } catch { /* orphan cleanup can be retried operationally */ }

  revalidatePath("/tutor/documents");
  return { success: true };
}

export type RemoveDocumentState = { error?: string; success?: boolean } | undefined;

export async function removeDocumentAction(
  _prevState: RemoveDocumentState,
  formData: FormData
): Promise<RemoveDocumentState> {
  const t = await getTranslations("tutorDocuments.errors");
  const tutorProfile = await requireTutorProfile();
  if (!tutorProfile) return { error: t("notATutor") };

  const documentId = formData.get("documentId");
  if (typeof documentId !== "string" || !documentId) return { error: t("notFound") };

  const existing = await db.tutorDocument.findUnique({ where: { id: documentId } });
  if (!existing || existing.tutorProfileId !== tutorProfile.id) return { error: t("notFound") };
  if (existing.status === "APPROVED") return { error: t("cannotModify") };

  try {
    await db.tutorDocument.delete({ where: { id: documentId } });
  } catch {
    return { error: t("generic") };
  }

  // The DB row is gone — the object is now unreferenced. Best-effort delete;
  // a leftover unreferenced object is safe and can be cleaned up later.
  try { await storage.deletePrivateFile(existing.storageKey); } catch { /* orphan cleanup can be retried operationally */ }

  revalidatePath("/tutor/documents");
  return { success: true };
}

export async function approveDocumentAction(documentId: string, formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) return;
  const document = await db.tutorDocument.findUnique({ where: { id: documentId } });
  if (!document) return;
  const adminNotes = formData.get("adminNotes");
  await approveDocument(documentId, admin.id, typeof adminNotes === "string" && adminNotes ? adminNotes : undefined);
  revalidatePath(`/admin/tutors/${document.tutorProfileId}`);
}

export async function rejectDocumentAction(documentId: string, formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) return;
  const document = await db.tutorDocument.findUnique({ where: { id: documentId } });
  if (!document) return;
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return;
  await rejectDocument(documentId, admin.id, reason);
  revalidatePath(`/admin/tutors/${document.tutorProfileId}`);
}

export async function requestDocumentReplacementAction(documentId: string, formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) return;
  const document = await db.tutorDocument.findUnique({ where: { id: documentId } });
  if (!document) return;
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return;
  await requestDocumentReplacement(documentId, admin.id, reason);
  revalidatePath(`/admin/tutors/${document.tutorProfileId}`);
}
