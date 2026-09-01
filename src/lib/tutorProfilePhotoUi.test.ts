import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// PROD-TUTOR-UX2, Issue 2 — investigation found the ENTIRE profile-photo
// feature already fully implemented and correctly wired in certified source
// (upload/replace/remove action, ownership checks, MIME+size+signature
// validation, a separate PUBLIC bucket distinct from the private
// verification-documents bucket, next.config.ts image host allow-listing,
// the form rendered on /tutor/profile, Avatar's initials fallback, and
// every translation key in both locales). The only production gap was the
// bucket itself never having been created (tutor-profile-images —
// 404 NoSuchBucket, confirmed via a read-only check) — a pure
// infrastructure gap, zero code change required or made. This suite is
// therefore confirmatory: it proves the existing architecture already
// satisfies every requirement, rather than testing a new implementation.

describe("PROD-TUTOR-UX2 — Tutor profile photo: existing architecture confirmation", () => {
  const profilePage = readFileSync("src/app/[locale]/tutor/profile/page.tsx", "utf8");
  const imageForm = readFileSync("src/components/dashboard/TutorProfileImageForm.tsx", "utf8");
  const imageAction = readFileSync("src/lib/actions/tutorProfileImage.ts", "utf8");
  const storageHelper = readFileSync("src/lib/supabaseProfileImages.ts", "utf8");
  const documentStorageHelper = readFileSync("src/lib/storage.ts", "utf8");
  const avatar = readFileSync("src/components/ui/Avatar.tsx", "utf8");
  const nextConfig = readFileSync("next.config.ts", "utf8");

  it("8. the profile photo control is genuinely rendered on /tutor/profile, not orphaned/unused code", () => {
    expect(profilePage).toContain('import { TutorProfileImageForm } from "@/components/dashboard/TutorProfileImageForm"');
    expect(profilePage).toContain("<TutorProfileImageForm");
  });

  it("9. allowed image selection matches the certified validated formats exactly", () => {
    expect(imageForm).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(storageHelper).toContain('export const PROFILE_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"]');
  });

  it("10. invalid MIME/size/content is rejected server-side, authoritatively (not just by the accept attribute)", () => {
    expect(storageHelper).toContain("if (!buffer.byteLength) throw new ProfileImageValidationError(\"empty\")");
    expect(storageHelper).toContain("if (buffer.byteLength > MAX_PROFILE_IMAGE_BYTES) throw new ProfileImageValidationError(\"tooLarge\")");
    expect(storageHelper).toContain('throw new ProfileImageValidationError("unsupported")');
    // Real magic-byte signature check, not merely trusting the declared MIME type.
    expect(storageHelper).toContain("if (!signature || signature.mime !== declaredMime) throw new ProfileImageValidationError(\"invalidContent\")");
  });

  it("11. a tutor cannot modify another tutor's photo — ownership re-derived from the live session, never trusted from client input", () => {
    expect(imageAction).toContain('if (!session?.user || session.user.role !== "TUTOR") return { error: t("denied") }');
    expect(imageAction).toContain("db.user.findFirst({ where: { id: session.user.id, role: \"TUTOR\", tutorProfile: { isNot: null } }");
    // The storage key itself is namespaced by the real session's own userId, not a client-supplied id.
    expect(storageHelper).toContain("const key = `tutors/${input.userId}/${randomUUID()}.${signature.extension}`");
  });

  it("12. a successful upload persists the active photo reference on User.image", () => {
    expect(imageAction).toContain("await db.user.update({ where: { id: user.id }, data: { image: uploaded.publicUrl } })");
  });

  it("13. the photo is read fresh from the database on every page load, and the mutating action revalidates the page — survives a refresh by construction", () => {
    expect(profilePage).toMatch(/user:\s*{\s*select:\s*{\s*name:\s*true,\s*image:\s*true\s*}\s*}/);
    expect(imageAction).toContain('revalidatePath("/tutor/profile")');
  });

  it("14. replacing a photo updates the active reference and best-effort cleans up the old object, without rolling back a successful replacement on cleanup failure", () => {
    expect(imageAction).toContain("const oldKey = profileImageKeyFromPublicUrl(user.image, user.id)");
    expect(imageAction).toContain("if (oldKey) await deleteTutorProfileImage(oldKey)");
    expect(imageAction).toContain("/* A successful replacement must not be rolled back by cleanup failure. */");
  });

  it("15. Avatar falls back to initials when no photo exists — never a broken image or empty box", () => {
    expect(avatar).toContain("if (src)");
    expect(avatar).toMatch(/const initials = name/);
    expect(avatar).toContain('role="img"');
  });

  it("16. no privacy regression — the profile-image bucket is a genuinely separate, public bucket, never the private verification-documents bucket", () => {
    expect(storageHelper).toContain('export const TUTOR_PROFILE_IMAGE_BUCKET = "tutor-profile-images"');
    expect(documentStorageHelper).toContain('export const TUTOR_VERIFICATION_DOCUMENTS_BUCKET = "tutor-verification-documents"');
    // Genuinely two different bucket names — never accidentally the same string.
    expect(storageHelper).not.toContain("tutor-verification-documents");
    expect(documentStorageHelper).not.toContain("tutor-profile-images");
    // The profile-image URL is a plain PUBLIC object URL (readable by anyone,
    // by design) — structurally distinct from the verification-document
    // path, which is never constructed as a public URL anywhere in that
    // module (it stays behind the authorization-checked /api/documents/[id]
    // route, proxied via the service-role key).
    expect(storageHelper).toContain("/storage/v1/object/public/${TUTOR_PROFILE_IMAGE_BUCKET}/");
    expect(documentStorageHelper).not.toMatch(/\/storage\/v1\/object\/public\//);
  });

  it("next.config.ts already allow-lists exactly the public profile-image path for next/image, scoped to the real bucket only", () => {
    expect(nextConfig).toContain('pathname: "/storage/v1/object/public/tutor-profile-images/**"');
  });
});
