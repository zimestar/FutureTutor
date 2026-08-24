import "server-only";
import { randomUUID } from "node:crypto";

export const TUTOR_PROFILE_IMAGE_BUCKET = "tutor-profile-images";
export const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
export const PROFILE_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export class ProfileImageValidationError extends Error {
  constructor(public readonly code: "empty" | "tooLarge" | "unsupported" | "invalidContent") { super(code); }
}
export class ProfileImageStorageError extends Error {}

const signatures = [
  { mime: "image/jpeg", extension: "jpg", matches: (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", extension: "png", matches: (b: Uint8Array) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v) },
  { mime: "image/webp", extension: "webp", matches: (b: Uint8Array) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP" },
] as const;

export function validateProfileImage(buffer: Uint8Array, declaredMime: string) {
  if (!buffer.byteLength) throw new ProfileImageValidationError("empty");
  if (buffer.byteLength > MAX_PROFILE_IMAGE_BYTES) throw new ProfileImageValidationError("tooLarge");
  if (!PROFILE_IMAGE_MIME_TYPES.includes(declaredMime as (typeof PROFILE_IMAGE_MIME_TYPES)[number])) {
    throw new ProfileImageValidationError("unsupported");
  }
  const signature = signatures.find((candidate) => candidate.matches(buffer));
  if (!signature || signature.mime !== declaredMime) throw new ProfileImageValidationError("invalidContent");
  return signature;
}

function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new ProfileImageStorageError("Supabase profile-image storage is not configured");
  return { url, serviceRoleKey };
}

function encodedObjectPath(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

export async function uploadTutorProfileImage(input: { userId: string; bytes: Uint8Array; mimeType: string }) {
  const signature = validateProfileImage(input.bytes, input.mimeType);
  const { url, serviceRoleKey } = config();
  const key = `tutors/${input.userId}/${randomUUID()}.${signature.extension}`;
  const response = await fetch(`${url}/storage/v1/object/${TUTOR_PROFILE_IMAGE_BUCKET}/${encodedObjectPath(key)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, "Content-Type": signature.mime, "x-upsert": "false" },
    body: input.bytes.buffer.slice(input.bytes.byteOffset, input.bytes.byteOffset + input.bytes.byteLength) as ArrayBuffer,
  });
  if (!response.ok) throw new ProfileImageStorageError(`Profile-image upload failed (${response.status})`);
  return { key, publicUrl: `${url}/storage/v1/object/public/${TUTOR_PROFILE_IMAGE_BUCKET}/${encodedObjectPath(key)}` };
}

export function profileImageKeyFromPublicUrl(value: string | null | undefined, expectedUserId: string): string | null {
  if (!value) return null;
  const { url } = config();
  const prefix = `${url}/storage/v1/object/public/${TUTOR_PROFILE_IMAGE_BUCKET}/`;
  if (!value.startsWith(prefix)) return null;
  try {
    const key = decodeURIComponent(value.slice(prefix.length));
    const ownedPrefix = `tutors/${expectedUserId}/`;
    return key.startsWith(ownedPrefix) && /^tutors\/[^/]+\/[0-9a-f-]+\.(?:jpg|png|webp)$/.test(key) ? key : null;
  } catch {
    return null;
  }
}

export async function deleteTutorProfileImage(key: string) {
  if (!/^tutors\/[^/]+\/[0-9a-f-]+\.(?:jpg|png|webp)$/.test(key)) {
    throw new ProfileImageStorageError("Invalid managed profile-image key");
  }
  const { url, serviceRoleKey } = config();
  const response = await fetch(`${url}/storage/v1/object/${TUTOR_PROFILE_IMAGE_BUCKET}/${encodedObjectPath(key)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
  });
  if (!response.ok && response.status !== 404) throw new ProfileImageStorageError(`Profile-image deletion failed (${response.status})`);
}
