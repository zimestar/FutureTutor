import "server-only";
import { randomUUID } from "crypto";

export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_DOCUMENTS_PER_TUTOR = 20;
export const TUTOR_VERIFICATION_DOCUMENTS_BUCKET = "tutor-verification-documents";

const SIGNATURES: { mimeType: string; extension: string; magic: number[] }[] = [
  { mimeType: "application/pdf", extension: "pdf", magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mimeType: "image/jpeg", extension: "jpg", magic: [0xff, 0xd8, 0xff] },
  { mimeType: "image/png", extension: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
];

export class UnsupportedFileError extends Error {}
export class FileTooLargeError extends Error {}
export class DocumentStorageError extends Error {}

/**
 * Validates a document upload against its actual bytes, not just the
 * browser-declared Content-Type. Returns the sniffed MIME type on success —
 * callers should store this, not the client's claim.
 */
export function validateDocumentFile(buffer: Buffer): string {
  if (buffer.byteLength === 0) {
    throw new UnsupportedFileError("File is empty");
  }
  if (buffer.byteLength > MAX_DOCUMENT_SIZE_BYTES) {
    throw new FileTooLargeError(`File exceeds ${MAX_DOCUMENT_SIZE_BYTES} bytes`);
  }
  const match = SIGNATURES.find((sig) => sig.magic.every((byte, i) => buffer[i] === byte));
  if (!match) {
    throw new UnsupportedFileError("File type not recognized as PDF, JPEG, or PNG");
  }
  return match.mimeType;
}

function extensionForMimeType(mimeType: string): string {
  const match = SIGNATURES.find((sig) => sig.mimeType === mimeType);
  if (!match) throw new UnsupportedFileError(`Unrecognized MIME type: ${mimeType}`);
  return match.extension;
}

function mimeTypeFromKey(key: string): string {
  const match = SIGNATURES.find((sig) => key.endsWith(`.${sig.extension}`));
  if (!match) throw new DocumentStorageError("Unrecognized document key extension");
  return match.mimeType;
}

export interface StorageService {
  putPrivateFile(key: string, buffer: Buffer): Promise<void>;
  getFileBuffer(key: string): Promise<Buffer>;
  deletePrivateFile(key: string): Promise<void>;
}

/**
 * Storage keys are always server-generated (crypto.randomUUID() namespaced
 * under the authenticated Tutor's own userId) — never derived from user
 * input, and re-validated against DOCUMENT_KEY_PATTERN before every storage
 * operation as defense in depth against a key ever reaching this module from
 * anywhere other than a value already persisted on a TutorDocument row.
 */
const DOCUMENT_KEY_PATTERN = /^tutors\/[^/]+\/verification\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|png)$/;

export function isManagedDocumentKey(key: string): boolean {
  return DOCUMENT_KEY_PATTERN.test(key);
}

function assertManagedDocumentKey(key: string): void {
  if (!isManagedDocumentKey(key)) {
    throw new DocumentStorageError("Invalid managed document key");
  }
}

function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new DocumentStorageError("Supabase document storage is not configured");
  }
  return { url, serviceRoleKey };
}

function encodedObjectPath(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

function objectUrl(url: string, key: string): string {
  return `${url}/storage/v1/object/${TUTOR_VERIFICATION_DOCUMENTS_BUCKET}/${encodedObjectPath(key)}`;
}

/**
 * PRIVATE Supabase Storage bucket (tutor-verification-documents). Every call
 * uses the server-only service-role credential — never exposed to the
 * client — and this module is never imported from a Client Component.
 * No public URL is ever constructed or persisted for this bucket; retrieval
 * goes through this same service-role-authenticated path, proxied to the
 * caller only after /api/documents/[id] has already authorized the request.
 */
class SupabaseTutorDocumentStorageService implements StorageService {
  async putPrivateFile(key: string, buffer: Buffer): Promise<void> {
    assertManagedDocumentKey(key);
    const { url, serviceRoleKey } = config();
    const response = await fetch(objectUrl(url, key), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "Content-Type": mimeTypeFromKey(key),
        "x-upsert": "false",
      },
      body: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
    });
    if (!response.ok) throw new DocumentStorageError(`Document upload failed (${response.status})`);
  }

  async getFileBuffer(key: string): Promise<Buffer> {
    assertManagedDocumentKey(key);
    const { url, serviceRoleKey } = config();
    const response = await fetch(objectUrl(url, key), {
      method: "GET",
      headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
      cache: "no-store",
    });
    if (!response.ok) throw new DocumentStorageError(`Document retrieval failed (${response.status})`);
    return Buffer.from(await response.arrayBuffer());
  }

  async deletePrivateFile(key: string): Promise<void> {
    assertManagedDocumentKey(key);
    const { url, serviceRoleKey } = config();
    const response = await fetch(objectUrl(url, key), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
    });
    if (!response.ok && response.status !== 404) {
      throw new DocumentStorageError(`Document deletion failed (${response.status})`);
    }
  }
}

export const storage: StorageService = new SupabaseTutorDocumentStorageService();

export function generateDocumentStorageKey(input: { userId: string; mimeType: string }): string {
  const extension = extensionForMimeType(input.mimeType);
  return `tutors/${input.userId}/verification/${randomUUID()}/${randomUUID()}.${extension}`;
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[/\\]/g, "_").slice(0, 200);
}
