import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { createReadStream } from "fs";
import path from "path";

export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_DOCUMENTS_PER_TUTOR = 20;

const SIGNATURES: { mimeType: string; magic: number[] }[] = [
  { mimeType: "application/pdf", magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mimeType: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  { mimeType: "image/png", magic: [0x89, 0x50, 0x4e, 0x47] },
];

export class UnsupportedFileError extends Error {}
export class FileTooLargeError extends Error {}

/**
 * Validates a document upload against its actual bytes, not just the
 * browser-declared Content-Type. Returns the sniffed MIME type on success —
 * callers should store this, not the client's claim.
 */
export function validateDocumentFile(buffer: Buffer): string {
  if (buffer.byteLength > MAX_DOCUMENT_SIZE_BYTES) {
    throw new FileTooLargeError(`File exceeds ${MAX_DOCUMENT_SIZE_BYTES} bytes`);
  }
  const match = SIGNATURES.find((sig) => sig.magic.every((byte, i) => buffer[i] === byte));
  if (!match) {
    throw new UnsupportedFileError("File type not recognized as PDF, JPEG, or PNG");
  }
  return match.mimeType;
}

export interface StorageService {
  putPrivateFile(key: string, buffer: Buffer): Promise<void>;
  getFileBuffer(key: string): Promise<Buffer>;
  getFileStream(key: string): ReturnType<typeof createReadStream>;
}

const STORAGE_ROOT = path.join(process.cwd(), "storage", "tutor-documents");

/**
 * Local-disk dev stub. Storage keys are always server-generated
 * (crypto.randomUUID()) — never derived from user input — so there is no
 * user-controlled path segment anywhere in this implementation. Swapping to
 * a real provider (R2/S3) later means implementing this same interface
 * against that SDK; no caller changes.
 */
class LocalDiskStorageService implements StorageService {
  async putPrivateFile(key: string, buffer: Buffer): Promise<void> {
    await mkdir(STORAGE_ROOT, { recursive: true });
    await writeFile(this.resolve(key), buffer);
  }

  async getFileBuffer(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  getFileStream(key: string) {
    return createReadStream(this.resolve(key));
  }

  private resolve(key: string): string {
    // Keys are always our own randomUUID() output (see generateStorageKey),
    // never user input, so this join can't be used for path traversal.
    return path.join(STORAGE_ROOT, key);
  }
}

export const storage: StorageService = new LocalDiskStorageService();

export function generateStorageKey(): string {
  return randomUUID();
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[/\\]/g, "_").slice(0, 200);
}
