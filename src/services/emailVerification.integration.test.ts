import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";
import {
  sendVerificationEmailForAccount,
  resendEmailVerification,
  verifyEmail,
  hashVerificationToken,
  InvalidOrExpiredVerificationTokenError,
  EMAIL_VERIFICATION_TTL_MS,
  type SendVerificationEmailParams,
} from "./emailVerification";
import { requestPasswordReset, resetPassword, hashResetToken } from "./passwordReset";

// BETA-EMAILVERIFY1 — permanent DB-integration tests for the email
// ownership verification domain. Mirrors passwordReset.integration.test.ts's
// own established structure exactly. Runs ONLY against the isolated
// DATABASE_URL_TEST database, verified via resolveVerifiedTestDatabase() in
// beforeAll.

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
      where: {
        identifier: {
          in: [
            ...createdEmails.map((e) => `email-verification:${e}`),
            ...createdEmails.map((e) => `password-reset:${e}`),
          ],
        },
      },
    });
  }
  if (createdUserIds.length > 0) {
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  createdEmails.length = 0;
  createdUserIds.length = 0;
});

function uniqueEmail(prefix: string) {
  return `emailverify-it-${prefix}-${randomUUID()}@futuretutor.test`;
}

const PASSWORD = "SomePassword123!";

async function createUnverifiedUser(prefix: string, opts: { deactivatedAt?: Date } = {}) {
  const email = uniqueEmail(prefix);
  createdEmails.push(email);
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const user = await db.user.create({
    data: {
      email,
      role: "STUDENT",
      name: "Verification Test User",
      passwordHash,
      emailVerified: null,
      deactivatedAt: opts.deactivatedAt ?? null,
    },
  });
  createdUserIds.push(user.id);
  return { user, email };
}

/** Captures every activation email that would have been sent, without
 * actually sending anything — mirrors passwordReset.integration.test.ts's
 * capturingSendEmail() exactly. */
function capturingSendEmail() {
  const captured: SendVerificationEmailParams[] = [];
  const sendEmail = async (params: SendVerificationEmailParams) => {
    captured.push(params);
  };
  return { captured, sendEmail };
}

function extractToken(verifyUrl: string): string {
  const token = new URL(verifyUrl).searchParams.get("token");
  if (!token) throw new Error("test helper: verifyUrl had no token param");
  return token;
}

function buildVerifyUrl(rawToken: string) {
  return `http://localhost:3100/en/verify-email?token=${encodeURIComponent(rawToken)}`;
}

describe("sendVerificationEmailForAccount", () => {
  it("issues a token and sends an email for a freshly-created account", async () => {
    const { user } = await createUnverifiedUser("fresh");
    const { captured, sendEmail } = capturingSendEmail();

    await sendVerificationEmailForAccount(db, user, { locale: "en", sendEmail, buildVerifyUrl });

    expect(captured).toHaveLength(1);
    const rawToken = extractToken(captured[0].verifyUrl);
    const row = await db.verificationToken.findUnique({ where: { token: hashVerificationToken(rawToken) } });
    expect(row).not.toBeNull();
    expect(row?.identifier).toBe(`email-verification:${user.email}`);
  });

  it("writes an email_verification.requested audit event", async () => {
    const { user } = await createUnverifiedUser("audit-requested");
    const { sendEmail } = capturingSendEmail();

    const before = await db.auditLog.count({ where: { action: "email_verification.requested", entityId: user.id } });
    await sendVerificationEmailForAccount(db, user, { locale: "en", sendEmail, buildVerifyUrl });
    const after = await db.auditLog.count({ where: { action: "email_verification.requested", entityId: user.id } });

    expect(after).toBe(before + 1);
  });

  it("never persists the raw token — only its SHA-256 hash", async () => {
    const { user } = await createUnverifiedUser("rawcheck");
    const { captured, sendEmail } = capturingSendEmail();

    await sendVerificationEmailForAccount(db, user, { locale: "en", sendEmail, buildVerifyUrl });
    const rawToken = extractToken(captured[0].verifyUrl);

    const rawLookup = await db.verificationToken.findUnique({ where: { token: rawToken } });
    expect(rawLookup).toBeNull();
    const hashedLookup = await db.verificationToken.findUnique({ where: { token: hashVerificationToken(rawToken) } });
    expect(hashedLookup).not.toBeNull();
  });
});

describe("resendEmailVerification", () => {
  it("issues a fresh token for an eligible unverified account", async () => {
    const { email } = await createUnverifiedUser("resend-eligible");
    const { captured, sendEmail } = capturingSendEmail();

    await resendEmailVerification(db, email, { locale: "en", sendEmail, buildVerifyUrl });

    expect(captured).toHaveLength(1);
  });

  it("no-ops for an unknown email — no enumeration signal", async () => {
    const unknownEmail = uniqueEmail("unknown");
    createdEmails.push(unknownEmail);
    const { captured, sendEmail } = capturingSendEmail();

    await expect(resendEmailVerification(db, unknownEmail, { locale: "en", sendEmail, buildVerifyUrl })).resolves.toBeUndefined();
    expect(captured).toHaveLength(0);
  });

  it("no-ops for an ALREADY-VERIFIED account — does not leak state, nothing to resend", async () => {
    const { user, email } = await createUnverifiedUser("already-verified");
    await db.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
    const { captured, sendEmail } = capturingSendEmail();

    await resendEmailVerification(db, email, { locale: "en", sendEmail, buildVerifyUrl });

    expect(captured).toHaveLength(0);
  });

  it("no-ops for a DEACTIVATED account — mirrors requestPasswordReset's identical refusal", async () => {
    const { email } = await createUnverifiedUser("resend-deactivated", { deactivatedAt: new Date() });
    const { captured, sendEmail } = capturingSendEmail();

    await resendEmailVerification(db, email, { locale: "en", sendEmail, buildVerifyUrl });

    expect(captured).toHaveLength(0);
  });

  it("supersedes a prior outstanding token — the old one can no longer verify", async () => {
    const { user, email } = await createUnverifiedUser("supersede");
    const first = capturingSendEmail();
    const second = capturingSendEmail();

    await sendVerificationEmailForAccount(db, user, {
      locale: "en",
      sendEmail: first.sendEmail,
      buildVerifyUrl,
    });
    const firstRawToken = extractToken(first.captured[0].verifyUrl);

    await resendEmailVerification(db, email, { locale: "en", sendEmail: second.sendEmail, buildVerifyUrl });
    const secondRawToken = extractToken(second.captured[0].verifyUrl);

    expect(firstRawToken).not.toBe(secondRawToken);
    await expect(verifyEmail(db, firstRawToken)).rejects.toBeInstanceOf(InvalidOrExpiredVerificationTokenError);

    const result = await verifyEmail(db, secondRawToken);
    expect(result.userId).toBeDefined();
  });

  it("unknown-email outcome is not distinguishable from known-email outcome via the returned result", async () => {
    const { email: knownEmail } = await createUnverifiedUser("known-resend");
    const unknownEmail = uniqueEmail("unknown-resend");
    createdEmails.push(unknownEmail);
    const { sendEmail: sendA } = capturingSendEmail();
    const { sendEmail: sendB } = capturingSendEmail();

    const knownResult = await resendEmailVerification(db, knownEmail, { locale: "en", sendEmail: sendA, buildVerifyUrl });
    const unknownResult = await resendEmailVerification(db, unknownEmail, { locale: "en", sendEmail: sendB, buildVerifyUrl });

    expect(knownResult).toBeUndefined();
    expect(unknownResult).toBeUndefined();
  });
});

describe("verifyEmail", () => {
  async function issueToken(prefix: string, opts: { deactivatedAt?: Date } = {}) {
    const { user, email } = await createUnverifiedUser(prefix, opts);
    const { captured, sendEmail } = capturingSendEmail();
    await sendVerificationEmailForAccount(db, user, { locale: "en", sendEmail, buildVerifyUrl });
    const rawToken = extractToken(captured[0].verifyUrl);
    return { user, email, rawToken };
  }

  it("valid token -> emailVerified set, token consumed", async () => {
    const { user, rawToken } = await issueToken("valid");

    const result = await verifyEmail(db, rawToken);
    expect(result.userId).toBe(user.id);

    const tokenRow = await db.verificationToken.findUnique({ where: { token: hashVerificationToken(rawToken) } });
    expect(tokenRow).toBeNull(); // consumed

    const updatedUser = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser.emailVerified).not.toBeNull();
  });

  it("the same token cannot be reused after a successful verification (replay fails)", async () => {
    const { rawToken } = await issueToken("reuse");
    await verifyEmail(db, rawToken);

    await expect(verifyEmail(db, rawToken)).rejects.toBeInstanceOf(InvalidOrExpiredVerificationTokenError);
  });

  it("an expired token is rejected", async () => {
    const { rawToken } = await issueToken("expired");
    const afterExpiry = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS + 1000);

    await expect(verifyEmail(db, rawToken, { now: afterExpiry })).rejects.toBeInstanceOf(InvalidOrExpiredVerificationTokenError);
  });

  it("an invalid (well-formed but unknown) token is rejected", async () => {
    const fakeToken = randomUUID() + randomUUID();
    await expect(verifyEmail(db, fakeToken)).rejects.toBeInstanceOf(InvalidOrExpiredVerificationTokenError);
  });

  it("a malformed (too-short) token is rejected", async () => {
    await expect(verifyEmail(db, "short")).rejects.toBeInstanceOf(InvalidOrExpiredVerificationTokenError);
  });

  it("verification does not mutate role/profile/passwordHash — only emailVerified changes", async () => {
    const { user, rawToken } = await issueToken("rolecheck");
    await verifyEmail(db, rawToken);

    const updatedUser = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser.role).toBe(user.role);
    expect(updatedUser.name).toBe(user.name);
    expect(updatedUser.passwordHash).toBe(user.passwordHash);
  });

  it("concurrent use of the same token -> exactly one verification succeeds (race safety)", async () => {
    const { rawToken } = await issueToken("concurrent");

    const results = await Promise.allSettled([verifyEmail(db, rawToken), verifyEmail(db, rawToken)]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(InvalidOrExpiredVerificationTokenError);
  });

  it("no raw token ever appears in AuditLog metadata", async () => {
    const { user, rawToken } = await issueToken("auditsafe");
    await verifyEmail(db, rawToken);

    const rows = await db.auditLog.findMany({ where: { entityId: user.id, entityType: "User" } });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(JSON.stringify(row)).not.toContain(rawToken);
    }
  });

  it("writes an email_verification.completed audit event on success", async () => {
    const { user, rawToken } = await issueToken("audit-completed");
    await verifyEmail(db, rawToken);

    const rows = await db.auditLog.findMany({ where: { action: "email_verification.completed", entityId: user.id } });
    expect(rows).toHaveLength(1);
  });

  it("writes an email_verification.invalid_or_expired audit event on failure, with no entityId (uniform shape, no enumeration signal)", async () => {
    const before = await db.auditLog.count({ where: { action: "email_verification.invalid_or_expired" } });
    await expect(verifyEmail(db, "totally-unknown-token-value")).rejects.toBeInstanceOf(InvalidOrExpiredVerificationTokenError);
    const after = await db.auditLog.count({ where: { action: "email_verification.invalid_or_expired" } });
    expect(after).toBe(before + 1);
  });

  // ---------------------------------------------------------------------
  // Mission §10 — suspension interaction: verification must never bypass
  // suspension, and must never clear deactivatedAt.
  // ---------------------------------------------------------------------

  it("mission §10: a token issued for an account that is DEACTIVATED before consumption fails closed — emailVerified is never set, deactivatedAt is never touched", async () => {
    const { user, rawToken } = await issueToken("deactivate-midflight");
    await db.user.update({ where: { id: user.id }, data: { deactivatedAt: new Date() } });

    await expect(verifyEmail(db, rawToken)).rejects.toBeInstanceOf(InvalidOrExpiredVerificationTokenError);

    const unchanged = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(unchanged.emailVerified).toBeNull();
    expect(unchanged.deactivatedAt).not.toBeNull();
  });

  it("mission §10: verifying never clears an existing deactivatedAt — a currently-deactivated account's own verification attempt is rejected outright (no path exists where it could clear it)", async () => {
    const { user } = await createUnverifiedUser("already-deactivated", { deactivatedAt: new Date("2026-01-01T00:00:00.000Z") });
    const { captured, sendEmail } = capturingSendEmail();
    await sendVerificationEmailForAccount(db, user, { locale: "en", sendEmail, buildVerifyUrl });
    const rawToken = extractToken(captured[0].verifyUrl);

    await expect(verifyEmail(db, rawToken)).rejects.toBeInstanceOf(InvalidOrExpiredVerificationTokenError);

    const unchanged = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(unchanged.deactivatedAt).toEqual(new Date("2026-01-01T00:00:00.000Z"));
  });

  // ---------------------------------------------------------------------
  // Mission §11 — password-reset isolation: the two token namespaces must
  // be cryptographically and semantically disjoint, sharing the same
  // underlying VerificationToken table without ever colliding.
  // ---------------------------------------------------------------------

  it("mission §11: an email-verification token cannot be used to reset a password", async () => {
    const { rawToken } = await issueToken("isolation-verify-token");

    await expect(
      resetPassword(db, rawToken, "AttackerChosenPassword1!", { hashPassword: (p) => bcrypt.hash(p, 12) })
    ).rejects.toThrow();
  });

  it("mission §11: a password-reset token cannot be used to verify an email", async () => {
    const { email } = await createUnverifiedUser("isolation-reset-token");
    const resetCapture: { resetUrl: string }[] = [];
    await requestPasswordReset(db, email, {
      locale: "en",
      sendEmail: async (params) => {
        resetCapture.push({ resetUrl: params.resetUrl });
      },
      buildResetUrl: (rawToken) => `http://localhost:3100/en/reset-password?token=${encodeURIComponent(rawToken)}`,
    });
    const resetRawToken = new URL(resetCapture[0].resetUrl).searchParams.get("token")!;

    await expect(verifyEmail(db, resetRawToken)).rejects.toBeInstanceOf(InvalidOrExpiredVerificationTokenError);
  });

  it("mission §11: issuing a verification token does not disturb an existing, separately-issued password-reset token for the same account", async () => {
    const { user, email } = await createUnverifiedUser("no-cross-invalidate");
    const resetCapture: { resetUrl: string }[] = [];
    await requestPasswordReset(db, email, {
      locale: "en",
      sendEmail: async (params) => {
        resetCapture.push({ resetUrl: params.resetUrl });
      },
      buildResetUrl: (rawToken) => `http://localhost:3100/en/reset-password?token=${encodeURIComponent(rawToken)}`,
    });
    const resetRawToken = new URL(resetCapture[0].resetUrl).searchParams.get("token")!;

    const { sendEmail: verifySend } = capturingSendEmail();
    await sendVerificationEmailForAccount(db, user, { locale: "en", sendEmail: verifySend, buildVerifyUrl });

    // The password-reset token, issued BEFORE the verification token, must
    // still be present and valid — proving the two namespaces' "invalidate
    // previous token(s)" steps are scoped independently and never collide.
    const resetRow = await db.verificationToken.findUnique({ where: { token: hashResetToken(resetRawToken) } });
    expect(resetRow).not.toBeNull();
    expect(resetRow?.identifier).toBe(`password-reset:${email}`);
  });
});
