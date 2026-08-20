import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";
import {
  requestPasswordReset,
  resetPassword,
  hashResetToken,
  InvalidOrExpiredResetTokenError,
  ResetPasswordPolicyError,
  PASSWORD_RESET_TTL_MS,
  type SendPasswordResetEmailParams,
} from "./passwordReset";

// L1-01A — permanent DB-integration tests for the password-reset domain
// (VerificationToken-backed request/reset flow, real concurrent-use race).
// Runs ONLY against the isolated DATABASE_URL_TEST database, verified via
// resolveVerifiedTestDatabase() in beforeAll — mirrors
// familyManagement.integration.test.ts's own established structure exactly.

let db: PrismaClient;
const createdUserIds: string[] = [];
const createdEmails: string[] = [];

beforeAll(() => {
  const target = resolveVerifiedTestDatabase();
  const adapter = new PrismaPg({ connectionString: target.connectionString });
  db = new PrismaClient({ adapter });
});

afterAll(async () => {
  await db?.$disconnect();
});

afterEach(async () => {
  if (createdEmails.length > 0) {
    await db.verificationToken.deleteMany({
      where: { identifier: { in: createdEmails.map((e) => `password-reset:${e}`) } },
    });
  }
  if (createdUserIds.length > 0) {
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  createdEmails.length = 0;
  createdUserIds.length = 0;
});

function uniqueEmail(prefix: string) {
  return `pwreset-it-${prefix}-${randomUUID()}@futuretutor.test`;
}

const OLD_PASSWORD = "OldPassword123!";
const NEW_PASSWORD = "NewPassword456!";

async function createUserWithPassword(prefix: string, opts: { deactivatedAt?: Date; plainPassword?: string } = {}) {
  const email = uniqueEmail(prefix);
  createdEmails.push(email);
  const passwordHash = await bcrypt.hash(opts.plainPassword ?? OLD_PASSWORD, 12);
  const user = await db.user.create({
    data: {
      email,
      role: "STUDENT",
      name: "Reset Test User",
      passwordHash,
      deactivatedAt: opts.deactivatedAt ?? null,
    },
  });
  createdUserIds.push(user.id);
  return { user, email };
}

/** Captures every reset URL a call to requestPasswordReset would have
 * emailed, without actually sending anything — the raw token is extracted
 * from the URL for the test's own use (the same "raw token exists exactly
 * once at generation" contract a real inbox would give a real user). */
function capturingSendEmail() {
  const captured: SendPasswordResetEmailParams[] = [];
  const sendEmail = async (params: SendPasswordResetEmailParams) => {
    captured.push(params);
  };
  return { captured, sendEmail };
}

function extractToken(resetUrl: string): string {
  const token = new URL(resetUrl).searchParams.get("token");
  if (!token) throw new Error("test helper: resetUrl had no token param");
  return token;
}

function buildResetUrl(rawToken: string) {
  return `http://localhost:3100/en/reset-password?token=${encodeURIComponent(rawToken)}`;
}

describe("requestPasswordReset", () => {
  it("1. existing account requests reset -> resolves without throwing, token persisted safely", async () => {
    const { email } = await createUserWithPassword("existing");
    const { captured, sendEmail } = capturingSendEmail();

    await requestPasswordReset(db, email, { locale: "en", sendEmail, buildResetUrl });

    expect(captured).toHaveLength(1);
    const rawToken = extractToken(captured[0].resetUrl);

    const row = await db.verificationToken.findUnique({ where: { token: hashResetToken(rawToken) } });
    expect(row).not.toBeNull();
    expect(row?.identifier).toBe(`password-reset:${email}`);
  });

  it("2. unknown email requests reset -> same generic (void, no throw) response, no user disclosure", async () => {
    const unknownEmail = uniqueEmail("unknown");
    createdEmails.push(unknownEmail);
    const { captured, sendEmail } = capturingSendEmail();

    const requestedCountBefore = await db.auditLog.count({ where: { action: "password_reset.requested" } });

    await expect(requestPasswordReset(db, unknownEmail, { locale: "en", sendEmail, buildResetUrl })).resolves.toBeUndefined();

    // No email sent, no token row created, no audit row written — an
    // external observer of this module's own side effects has nothing to
    // distinguish this from a transient no-op.
    expect(captured).toHaveLength(0);
    const row = await db.verificationToken.findFirst({ where: { identifier: `password-reset:${unknownEmail}` } });
    expect(row).toBeNull();
    const requestedCountAfter = await db.auditLog.count({ where: { action: "password_reset.requested" } });
    expect(requestedCountAfter).toBe(requestedCountBefore);
  });

  it("3. raw token value is never stored — only its SHA-256 hash", async () => {
    const { email } = await createUserWithPassword("rawcheck");
    const { captured, sendEmail } = capturingSendEmail();

    await requestPasswordReset(db, email, { locale: "en", sendEmail, buildResetUrl });
    const rawToken = extractToken(captured[0].resetUrl);

    const rawLookup = await db.verificationToken.findUnique({ where: { token: rawToken } });
    expect(rawLookup).toBeNull(); // the raw value is NOT a valid lookup key

    const hashedLookup = await db.verificationToken.findUnique({ where: { token: hashResetToken(rawToken) } });
    expect(hashedLookup).not.toBeNull();
    expect(hashedLookup?.token).not.toBe(rawToken);
  });

  it("16. unknown-email outcome is not distinguishable from known-email outcome via the returned result", async () => {
    const { email: knownEmail } = await createUserWithPassword("known16");
    const unknownEmail = uniqueEmail("unknown16");
    const { sendEmail: sendA } = capturingSendEmail();
    const { sendEmail: sendB } = capturingSendEmail();

    const knownResult = await requestPasswordReset(db, knownEmail, { locale: "en", sendEmail: sendA, buildResetUrl });
    const unknownResult = await requestPasswordReset(db, unknownEmail, { locale: "en", sendEmail: sendB, buildResetUrl });

    expect(knownResult).toBeUndefined();
    expect(unknownResult).toBeUndefined();
  });

  it("13. a second reset request invalidates the first token (deterministic active-token policy)", async () => {
    const { email } = await createUserWithPassword("tworequests");
    const first = capturingSendEmail();
    const second = capturingSendEmail();

    await requestPasswordReset(db, email, { locale: "en", sendEmail: first.sendEmail, buildResetUrl });
    const firstRawToken = extractToken(first.captured[0].resetUrl);

    await requestPasswordReset(db, email, { locale: "en", sendEmail: second.sendEmail, buildResetUrl });
    const secondRawToken = extractToken(second.captured[0].resetUrl);

    expect(firstRawToken).not.toBe(secondRawToken);

    // The stale first token can never unexpectedly win.
    await expect(
      resetPassword(db, firstRawToken, NEW_PASSWORD, { hashPassword: (p) => bcrypt.hash(p, 12) })
    ).rejects.toBeInstanceOf(InvalidOrExpiredResetTokenError);

    // The current (second) token is the only one that can succeed.
    const result = await resetPassword(db, secondRawToken, NEW_PASSWORD, { hashPassword: (p) => bcrypt.hash(p, 12) });
    expect(result.userId).toBeDefined();
  });

  it("does not issue a token for a deactivated account", async () => {
    const { email } = await createUserWithPassword("deactivated", { deactivatedAt: new Date() });
    const { captured, sendEmail } = capturingSendEmail();

    await requestPasswordReset(db, email, { locale: "en", sendEmail, buildResetUrl });

    expect(captured).toHaveLength(0);
  });
});

describe("resetPassword", () => {
  async function issueToken(prefix: string) {
    const { user, email } = await createUserWithPassword(prefix);
    const { captured, sendEmail } = capturingSendEmail();
    await requestPasswordReset(db, email, { locale: "en", sendEmail, buildResetUrl });
    const rawToken = extractToken(captured[0].resetUrl);
    return { user, email, rawToken };
  }

  it("4. valid token + valid password -> password replaced, token consumed", async () => {
    const { user, rawToken } = await issueToken("valid");

    const result = await resetPassword(db, rawToken, NEW_PASSWORD, { hashPassword: (p) => bcrypt.hash(p, 12) });
    expect(result.userId).toBe(user.id);

    const tokenRow = await db.verificationToken.findUnique({ where: { token: hashResetToken(rawToken) } });
    expect(tokenRow).toBeNull(); // consumed

    const updatedUser = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser.passwordHash).not.toBe(user.passwordHash);
  });

  it("5 & 6. old password fails, new password succeeds, after reset", async () => {
    const { user, rawToken } = await issueToken("swap");
    await resetPassword(db, rawToken, NEW_PASSWORD, { hashPassword: (p) => bcrypt.hash(p, 12) });

    const updatedUser = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await bcrypt.compare(OLD_PASSWORD, updatedUser.passwordHash!)).toBe(false);
    expect(await bcrypt.compare(NEW_PASSWORD, updatedUser.passwordHash!)).toBe(true);
  });

  it("7. the same token cannot be reused after a successful reset", async () => {
    const { rawToken } = await issueToken("reuse");
    await resetPassword(db, rawToken, NEW_PASSWORD, { hashPassword: (p) => bcrypt.hash(p, 12) });

    await expect(
      resetPassword(db, rawToken, "AnotherPassword789!", { hashPassword: (p) => bcrypt.hash(p, 12) })
    ).rejects.toBeInstanceOf(InvalidOrExpiredResetTokenError);
  });

  it("8. an expired token is rejected", async () => {
    const { rawToken } = await issueToken("expired");
    const afterExpiry = new Date(Date.now() + PASSWORD_RESET_TTL_MS + 1000);

    await expect(
      resetPassword(db, rawToken, NEW_PASSWORD, { now: afterExpiry, hashPassword: (p) => bcrypt.hash(p, 12) })
    ).rejects.toBeInstanceOf(InvalidOrExpiredResetTokenError);
  });

  it("9. an invalid (well-formed but unknown) token is rejected", async () => {
    const fakeToken = randomUUID() + randomUUID(); // syntactically plausible length, never issued
    await expect(
      resetPassword(db, fakeToken, NEW_PASSWORD, { hashPassword: (p) => bcrypt.hash(p, 12) })
    ).rejects.toBeInstanceOf(InvalidOrExpiredResetTokenError);
  });

  it("10. a malformed (too-short) token is rejected", async () => {
    await expect(
      resetPassword(db, "short", NEW_PASSWORD, { hashPassword: (p) => bcrypt.hash(p, 12) })
    ).rejects.toBeInstanceOf(InvalidOrExpiredResetTokenError);
  });

  it("11. password policy is enforced (same standard as signup: 8-72 chars)", async () => {
    const { rawToken } = await issueToken("weakpw");
    await expect(
      resetPassword(db, rawToken, "short1", { hashPassword: (p) => bcrypt.hash(p, 12) })
    ).rejects.toBeInstanceOf(ResetPasswordPolicyError);

    // The token must still be valid/usable after a rejected weak-password
    // attempt (policy rejection must not itself burn the token).
    const result = await resetPassword(db, rawToken, NEW_PASSWORD, { hashPassword: (p) => bcrypt.hash(p, 12) });
    expect(result.userId).toBeDefined();
  });

  it("12. reset does not mutate user role/profile — only passwordHash changes", async () => {
    const { user, rawToken } = await issueToken("rolecheck");
    await resetPassword(db, rawToken, NEW_PASSWORD, { hashPassword: (p) => bcrypt.hash(p, 12) });

    const updatedUser = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser.role).toBe(user.role);
    expect(updatedUser.name).toBe(user.name);
    expect(updatedUser.email).toBe(user.email);
  });

  it("14. concurrent use of the same token -> exactly one reset succeeds", async () => {
    const { rawToken } = await issueToken("concurrent");

    const results = await Promise.allSettled([
      resetPassword(db, rawToken, "ConcurrentA1!", { hashPassword: (p) => bcrypt.hash(p, 12) }),
      resetPassword(db, rawToken, "ConcurrentB1!", { hashPassword: (p) => bcrypt.hash(p, 12) }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(InvalidOrExpiredResetTokenError);
  });

  it("15. no raw token or plaintext/hashed password ever appears in AuditLog metadata", async () => {
    const { user, rawToken } = await issueToken("auditsafe");
    await resetPassword(db, rawToken, NEW_PASSWORD, { hashPassword: (p) => bcrypt.hash(p, 12) });

    const rows = await db.auditLog.findMany({ where: { entityId: user.id, entityType: "User" } });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const serialized = JSON.stringify(row);
      expect(serialized).not.toContain(rawToken);
      expect(serialized).not.toContain(NEW_PASSWORD);
      expect(serialized).not.toContain(OLD_PASSWORD);
      const updatedUser = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(serialized).not.toContain(updatedUser.passwordHash!);
    }
  });

  it("a deactivated account cannot complete a reset even with an otherwise-valid token", async () => {
    const { user, email, rawToken } = await issueToken("deactivate-midflight");
    // Deactivate AFTER the token was issued, simulating a race between
    // request and reset.
    await db.user.update({ where: { id: user.id }, data: { deactivatedAt: new Date() } });

    await expect(
      resetPassword(db, rawToken, NEW_PASSWORD, { hashPassword: (p) => bcrypt.hash(p, 12) })
    ).rejects.toBeInstanceOf(InvalidOrExpiredResetTokenError);

    const unchanged = await db.user.findUniqueOrThrow({ where: { email } });
    expect(await bcrypt.compare(OLD_PASSWORD, unchanged.passwordHash!)).toBe(true);
  });
});
