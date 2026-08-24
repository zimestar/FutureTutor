import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_PROFILE_IMAGE_BYTES, ProfileImageValidationError, validateProfileImage } from "@/lib/supabaseProfileImages";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

describe("Tutor profile image validation", () => {
  it.each([[jpeg, "image/jpeg", "jpg"], [png, "image/png", "png"], [webp, "image/webp", "webp"]] as const)("accepts a valid image signature", (bytes, mime, extension) => {
    expect(validateProfileImage(bytes, mime).extension).toBe(extension);
  });
  it("rejects an unsupported declared format", () => expect(() => validateProfileImage(png, "image/svg+xml")).toThrow(ProfileImageValidationError));
  it("rejects renamed arbitrary binary content", () => expect(() => validateProfileImage(new Uint8Array([1,2,3,4]), "image/png")).toThrow(ProfileImageValidationError));
  it("rejects a MIME/signature mismatch", () => expect(() => validateProfileImage(jpeg, "image/png")).toThrow(ProfileImageValidationError));
  it("rejects empty and oversized payloads", () => {
    expect(() => validateProfileImage(new Uint8Array(), "image/png")).toThrow(ProfileImageValidationError);
    expect(() => validateProfileImage(new Uint8Array(MAX_PROFILE_IMAGE_BYTES + 1), "image/png")).toThrow(ProfileImageValidationError);
  });
});

describe("Tutor profile image authorization/source contract", () => {
  const action = readFileSync("src/lib/actions/tutorProfileImage.ts", "utf8");
  const storage = readFileSync("src/lib/supabaseProfileImages.ts", "utf8");
  it("derives the Tutor identity from the authenticated server session", () => {
    expect(action).toContain('session.user.role !== "TUTOR"');
    expect(action).toContain("userId: user.id");
    expect(action).not.toMatch(/formData\.get\(["'](?:userId|tutorId)/);
  });
  it("keeps the service-role credential server-only and uses generated keys", () => {
    expect(storage).toContain('import "server-only"');
    expect(storage).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(storage).not.toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY");
    expect(storage).toContain("randomUUID()");
  });
  it("uploads before replacing the database reference and only then cleans up", () => {
    expect(action.indexOf("await uploadTutorProfileImage")).toBeLessThan(action.indexOf("data: { image: uploaded.publicUrl }"));
    expect(action.indexOf("data: { image: uploaded.publicUrl }")).toBeLessThan(action.lastIndexOf("await deleteTutorProfileImage"));
  });
  it("only derives deletion keys inside the authenticated Tutor's managed namespace", () => {
    expect(action).toContain("profileImageKeyFromPublicUrl(user.image, user.id)");
    expect(storage).toContain("expectedUserId");
    expect(storage).toContain("ownedPrefix");
    expect(storage).toContain("Invalid managed profile-image key");
  });
  it("never serializes or logs the service-role credential", () => {
    expect(storage).not.toMatch(/console\.(?:log|info|warn|error)/);
    expect(action).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
