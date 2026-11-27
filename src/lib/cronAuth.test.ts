import { describe, expect, it } from "vitest";
import { isValidCronSecret } from "./cronAuth";

describe("isValidCronSecret", () => {
  it("accepts the exact secret", () => {
    expect(isValidCronSecret("s3cret-value", "s3cret-value")).toBe(true);
  });

  it("rejects a different value, including a prefix or a longer value", () => {
    expect(isValidCronSecret("s3cret", "s3cret-value")).toBe(false);
    expect(isValidCronSecret("s3cret-value-extra", "s3cret-value")).toBe(false);
    expect(isValidCronSecret("S3CRET-VALUE", "s3cret-value")).toBe(false);
  });

  it("never matches when either side is missing or empty", () => {
    expect(isValidCronSecret(null, "s3cret-value")).toBe(false);
    expect(isValidCronSecret("", "s3cret-value")).toBe(false);
    expect(isValidCronSecret("s3cret-value", undefined)).toBe(false);
    expect(isValidCronSecret("", "")).toBe(false);
  });
});
