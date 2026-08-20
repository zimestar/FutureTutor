import { describe, it, expect } from "vitest";
import {
  hashResetToken,
  isResetTokenExpired,
  isMalformedResetToken,
  normalizeResetEmail,
  PASSWORD_RESET_TTL_MS,
} from "./passwordReset";

// L1-01A — permanent unit tests for passwordReset.ts's pure (no I/O)
// helpers. The guarded transactional core (requestPasswordReset/
// resetPassword) is covered by passwordReset.integration.test.ts against
// the real isolated test database, since its whole point is DB-level
// atomicity/guarding behavior that can't be meaningfully faked with mocks.

describe("hashResetToken", () => {
  it("is deterministic for the same input", () => {
    expect(hashResetToken("same-raw-token")).toBe(hashResetToken("same-raw-token"));
  });

  it("produces a 64-character lowercase hex SHA-256 digest", () => {
    const hash = hashResetToken("some-raw-token-value");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never returns the raw input itself (test matrix item 3 precondition)", () => {
    const raw = "raw-token-must-not-appear-in-hash";
    expect(hashResetToken(raw)).not.toBe(raw);
    expect(hashResetToken(raw)).not.toContain(raw);
  });

  it("produces different hashes for different tokens", () => {
    expect(hashResetToken("token-a")).not.toBe(hashResetToken("token-b"));
  });
});

describe("isResetTokenExpired", () => {
  const expiresAt = new Date("2026-01-01T12:00:00.000Z");

  it("is not expired strictly before the expiry instant", () => {
    expect(isResetTokenExpired(expiresAt, new Date(expiresAt.getTime() - 1))).toBe(false);
  });

  it("is NOT yet expired exactly at the expiry instant — strict '<' semantics, matching familyManagement.ts's isInvitationExpired precedent exactly", () => {
    expect(isResetTokenExpired(expiresAt, new Date(expiresAt.getTime()))).toBe(false);
  });

  it("is expired strictly after the expiry instant", () => {
    expect(isResetTokenExpired(expiresAt, new Date(expiresAt.getTime() + 1))).toBe(true);
  });

  it("defaults `now` to the current time when omitted", () => {
    expect(isResetTokenExpired(new Date(Date.now() - 1000))).toBe(true);
    expect(isResetTokenExpired(new Date(Date.now() + 1000 * 60))).toBe(false);
  });
});

describe("isMalformedResetToken", () => {
  it("rejects non-string values", () => {
    expect(isMalformedResetToken(undefined)).toBe(true);
    expect(isMalformedResetToken(null)).toBe(true);
    expect(isMalformedResetToken(123)).toBe(true);
    expect(isMalformedResetToken({})).toBe(true);
  });

  it("rejects the empty string and other too-short strings", () => {
    expect(isMalformedResetToken("")).toBe(true);
    expect(isMalformedResetToken("short")).toBe(true);
  });

  it("rejects absurdly long strings", () => {
    expect(isMalformedResetToken("a".repeat(600))).toBe(true);
  });

  it("accepts a well-formed-length token string (final validity is a DB lookup concern, not this function's)", () => {
    expect(isMalformedResetToken("a".repeat(43))).toBe(false); // 32 raw bytes, base64url-encoded length
  });
});

describe("normalizeResetEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeResetEmail("  Someone@Example.COM  ")).toBe("someone@example.com");
  });
});

describe("PASSWORD_RESET_TTL_MS", () => {
  it("is a positive, finite duration", () => {
    expect(PASSWORD_RESET_TTL_MS).toBeGreaterThan(0);
    expect(Number.isFinite(PASSWORD_RESET_TTL_MS)).toBe(true);
  });
});
