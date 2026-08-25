"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { requireAdminPermission } from "@/services/adminPermissions";
import { db } from "@/lib/db";
import {
  storage,
  validateDocumentFile,
  generateStorageKey,
  sanitizeFileName,
  MAX_DOCUMENTS_PER_TUTOR,
  UnsupportedFileError,
  FileTooLargeError,
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

  const storageKey = generateStorageKey();
  await storage.putPrivateFile(storageKey, buffer);

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
