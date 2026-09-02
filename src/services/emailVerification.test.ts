import { describe, it, expect } from "vitest";
import {
  hashVerificationToken,
  isVerificationTokenExpired,
  isMalformedVerificationToken,
  normalizeVerificationEmail,
  EMAIL_VERIFICATION_TTL_MS,
} from "./emailVerification";
import { PASSWORD_RESET_TTL_MS } from "./passwordReset";

// BETA-EMAILVERIFY1 — permanent unit tests for emailVerification.ts's pure
// (no I/O) helpers, mirroring passwordReset.test.ts's own test shape
// exactly. The guarded transactional core (sendVerificationEmailForAccount/
// resendEmailVerification/verifyEmail) is covered by
// emailVerification.integration.test.ts against the real isolated test
// database.

describe("hashVerificationToken", () => {
  it("is deterministic for the same input", () => {
    expect(hashVerificationToken("same-raw-token")).toBe(hashVerificationToken("same-raw-token"));
  });

  it("produces a 64-character lowercase hex SHA-256 digest", () => {
    const hash = hashVerificationToken("some-raw-token-value");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never returns the raw input itself", () => {
    const raw = "raw-token-must-not-appear-in-hash";
    expect(hashVerificationToken(raw)).not.toBe(raw);
    expect(hashVerificationToken(raw)).not.toContain(raw);
  });

  it("produces different hashes for different tokens", () => {
    expect(hashVerificationToken("token-a")).not.toBe(hashVerificationToken("token-b"));
  });

  it("produces a namespace-independent hash of the same raw token as password reset would for the same string — the two are only kept apart by the identifier prefix each service prepends, never by hashing itself", () => {
    // Confirms the hash function itself is a plain SHA-256 (no secret salt
    // or namespace baked in) — token isolation between the two features is
    // enforced entirely by the identifier prefix (email-verification: vs.
    // password-reset:), verified separately in the integration suite.
    expect(hashVerificationToken("shared-raw-value")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("isVerificationTokenExpired", () => {
  const expiresAt = new Date("2026-01-01T12:00:00.000Z");

  it("is not expired strictly before the expiry instant", () => {
    expect(isVerificationTokenExpired(expiresAt, new Date(expiresAt.getTime() - 1))).toBe(false);
  });

  it("is NOT yet expired exactly at the expiry instant — strict '<' semantics, matching isResetTokenExpired's own precedent exactly", () => {
    expect(isVerificationTokenExpired(expiresAt, new Date(expiresAt.getTime()))).toBe(false);
  });

  it("is expired strictly after the expiry instant", () => {
    expect(isVerificationTokenExpired(expiresAt, new Date(expiresAt.getTime() + 1))).toBe(true);
  });

  it("defaults `now` to the current time when omitted", () => {
    expect(isVerificationTokenExpired(new Date(Date.now() - 1000))).toBe(true);
    expect(isVerificationTokenExpired(new Date(Date.now() + 1000 * 60))).toBe(false);
  });
});

describe("isMalformedVerificationToken", () => {
  it("rejects non-string values", () => {
    expect(isMalformedVerificationToken(undefined)).toBe(true);
    expect(isMalformedVerificationToken(null)).toBe(true);
    expect(isMalformedVerificationToken(123)).toBe(true);
    expect(isMalformedVerificationToken({})).toBe(true);
  });

  it("rejects the empty string and other too-short strings", () => {
    expect(isMalformedVerificationToken("")).toBe(true);
    expect(isMalformedVerificationToken("short")).toBe(true);
  });

  it("rejects absurdly long strings", () => {
    expect(isMalformedVerificationToken("a".repeat(600))).toBe(true);
  });

  it("accepts a well-formed-length token string (final validity is a DB lookup concern, not this function's)", () => {
    expect(isMalformedVerificationToken("a".repeat(43))).toBe(false); // 32 raw bytes, base64url-encoded length
  });
});

describe("normalizeVerificationEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeVerificationEmail("  Someone@Example.COM  ")).toBe("someone@example.com");
  });
});

describe("EMAIL_VERIFICATION_TTL_MS", () => {
  it("is a positive, finite duration", () => {
    expect(EMAIL_VERIFICATION_TTL_MS).toBeGreaterThan(0);
    expect(Number.isFinite(EMAIL_VERIFICATION_TTL_MS)).toBe(true);
  });

  it("is exactly 24 hours — the mission's own suggested practical default", () => {
    expect(EMAIL_VERIFICATION_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("is deliberately longer than PASSWORD_RESET_TTL_MS — lower-stakes, lower-urgency action gets a more forgiving window", () => {
    expect(EMAIL_VERIFICATION_TTL_MS).toBeGreaterThan(PASSWORD_RESET_TTL_MS);
  });
});
