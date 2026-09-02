import "server-only";
import { randomBytes, createHash } from "crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { writeAuditLog } from "@/lib/audit";

/**
 * BETA-EMAILVERIFY1 — email ownership verification. Structured identically
 * to src/services/passwordReset.ts (pure decision helpers + a guarded
 * transactional core + an injectable clock), and reuses the exact same
 * `VerificationToken` model reuse strategy that module already established:
 *   - `identifier` is purpose-namespaced (`email-verification:<email>`, not
 *     the bare email) so this can never collide with, or be deleted by,
 *     password-reset's own "invalidate previous tokens" step against the
 *     same table — the two namespaces are structurally disjoint.
 *   - `token` stores the SHA-256 hash of the raw token — never the raw
 *     value.
 *   - Single-use consumption is a guarded `deleteMany` on the model's own
 *     unique compound key, identical reasoning to passwordReset.ts's own
 *     doc comment (Read Committed isolation already makes this atomic —
 *     no Serializable transaction needed).
 *
 * No schema migration was needed or made — confirmed the existing
 * VerificationToken model safely supports this via namespacing alone.
 */

// 24 hours — the mission's own suggested practical default. Deliberately
// longer than PASSWORD_RESET_TTL_MS (1 hour): a password-reset token grants
// full account takeover on its own and is a high-value target, whereas an
// email-verification token only proves mailbox control for an account whose
// password the holder must already know — a lower-urgency, lower-stakes
// action where a same-day-or-next-day window is normal (mirrors
// FamilyInvitation's own 72h TTL being longer than password-reset's for the
// same "lower urgency, lower stakes" reasoning).
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

const IDENTIFIER_PREFIX = "email-verification:";

export function normalizeVerificationEmail(email: string): string {
  return email.trim().toLowerCase();
}

function buildVerificationIdentifier(email: string): string {
  return `${IDENTIFIER_PREFIX}${normalizeVerificationEmail(email)}`;
}

/** Pure, no I/O — mirrors hashResetToken exactly. */
export function hashVerificationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** Cryptographically secure (crypto.randomBytes, never Math.random). Never
 * persisted, logged, or included in audit metadata — only its SHA-256 hash
 * is ever written to the DB. */
function generateVerificationToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString("base64url");
  return { rawToken, tokenHash: hashVerificationToken(rawToken) };
}

export function isVerificationTokenExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() < now.getTime();
}

/** Screens out input that could never possibly be a real token before any
 * DB lookup — mirrors isMalformedResetToken exactly. */
export function isMalformedVerificationToken(rawToken: unknown): boolean {
  return typeof rawToken !== "string" || rawToken.length < 16 || rawToken.length > 512;
}

export class InvalidOrExpiredVerificationTokenError extends Error {}
export class AccountNotEligibleForVerificationError extends Error {}

export interface SendVerificationEmailParams {
  email: string;
  verifyUrl: string;
  locale: string;
}

export type SendVerificationEmail = (params: SendVerificationEmailParams) => Promise<void>;

/** Local-dev delivery boundary — mirrors consoleDevSendPasswordResetEmail
 * exactly, including never treating this as an application log (AuditLog
 * never receives the raw token, here or anywhere else in this module). */
export const consoleDevSendVerificationEmail: SendVerificationEmail = async ({ email, verifyUrl, locale }) => {
  console.log(
    `[emailVerification] DEV ONLY — no email provider configured. ` +
      `Would send activation email to ${email} (locale=${locale}): ${verifyUrl}`
  );
};

interface IssueTokenDeps {
  now: Date;
  locale: string;
  sendEmail: SendVerificationEmail;
  buildVerifyUrl: (rawToken: string) => string;
}

/** Shared core: invalidate any outstanding token for this account, issue a
 * fresh one, send the email, write an audit event. Used by both the
 * immediately-after-signup path (send unconditionally, caller already knows
 * the account is eligible) and the enumeration-safe resend path below. */
async function issueVerificationTokenAndSendEmail(
  client: PrismaClient,
  user: { id: string; email: string },
  deps: IssueTokenDeps
): Promise<void> {
  const identifier = buildVerificationIdentifier(user.email);
  const { rawToken, tokenHash } = generateVerificationToken();
  const expiresAt = new Date(deps.now.getTime() + EMAIL_VERIFICATION_TTL_MS);

  // At most one active verification token per account at any time — same
  // "invalidate/supersede prior token(s)" policy as password reset.
  await client.$transaction(async (tx) => {
    await tx.verificationToken.deleteMany({ where: { identifier } });
    await tx.verificationToken.create({ data: { identifier, token: tokenHash, expires: expiresAt } });
  });

  const verifyUrl = deps.buildVerifyUrl(rawToken);
  await deps.sendEmail({ email: user.email, verifyUrl, locale: deps.locale });

  await writeAuditLog(
    {
      actorUserId: user.id,
      action: "email_verification.requested",
      entityType: "User",
      entityId: user.id,
    },
    client
  );
}

export interface SendVerificationEmailForAccountDeps {
  now?: Date;
  locale: string;
  sendEmail: SendVerificationEmail;
  buildVerifyUrl: (rawToken: string) => string;
}

/**
 * Called immediately after creating a brand-new User (ordinary signup,
 * GUARDIAN_LINK claim-with-new-account, STUDENT_LOGIN claim-with-new-account)
 * — the caller already has the User row, so no eligibility/enumeration
 * concern applies here (unlike resendEmailVerification below, which is
 * reachable directly by an unauthenticated visitor and must not reveal
 * anything about arbitrary accounts).
 */
export async function sendVerificationEmailForAccount(
  client: PrismaClient,
  user: { id: string; email: string },
  deps: SendVerificationEmailForAccountDeps
): Promise<void> {
  await issueVerificationTokenAndSendEmail(client, user, { ...deps, now: deps.now ?? new Date() });
}

export interface ResendEmailVerificationDeps {
  now?: Date;
  locale: string;
  sendEmail: SendVerificationEmail;
  buildVerifyUrl: (rawToken: string) => string;
}

/**
 * The public "resend verification" entry point — reachable by anyone who
 * knows (or guesses) an email address, so it follows requestPasswordReset's
 * exact no-enumeration contract: returns void and never throws for "no such
 * user" / "already verified" / "deactivated" — all four outcomes (unknown
 * email, verified account, deactivated account, and a genuine send) are the
 * same code path from the caller's perspective, so the Server Action layer
 * can return one identical generic response regardless of which applies.
 *
 * - Unknown email: no-op (no enumeration).
 * - Already verified: no-op — "does not leak state" (test matrix), and
 *   there's nothing to resend.
 * - Deactivated: no-op — mirrors requestPasswordReset's identical refusal
 *   to hand a suspended account any further self-service capability, even
 *   one (like this) that wouldn't by itself un-suspend them.
 * - No password hash set (in principle, a future OAuth-only account): no-op,
 *   mirrors requestPasswordReset's same guard.
 */
export async function resendEmailVerification(
  client: PrismaClient,
  rawEmail: string,
  deps: ResendEmailVerificationDeps
): Promise<void> {
  const email = normalizeVerificationEmail(rawEmail);
  const now = deps.now ?? new Date();

  const user = await client.user.findUnique({
    where: { email },
    select: { id: true, email: true, emailVerified: true, deactivatedAt: true, passwordHash: true },
  });

  if (!user || user.emailVerified || user.deactivatedAt || !user.passwordHash) {
    return;
  }

  await issueVerificationTokenAndSendEmail(client, user, { ...deps, now });
}

export interface VerifyEmailDeps {
  now?: Date;
}

/**
 * The single authoritative "activate my account" entry point. Validates the
 * token, validates expiry, consumes it exactly once, sets
 * `User.emailVerified = now()` — all inside one transaction, mirroring
 * resetPassword's exact structure (guarded deleteMany consumption BEFORE
 * the eligibility check, so a concurrent double-click has exactly one
 * winner; every failure path throws the SAME
 * InvalidOrExpiredVerificationTokenError, indistinguishable to the caller).
 *
 * A deactivated account fails closed here (AccountNotEligibleForVerificationError,
 * collapsed into the same public error) — mission §10's "verification must
 * never bypass suspension" requirement, satisfied the same way
 * resetPassword already satisfies the analogous requirement for password
 * resets: the token is consumed either way (mirrors existing behavior for a
 * deactivated account's password-reset token), `deactivatedAt` is never
 * touched, and `emailVerified` is never set for a currently-suspended
 * account. If later reactivated, the account can request a fresh
 * verification email through the normal resend flow.
 */
export async function verifyEmail(
  client: PrismaClient,
  rawToken: string,
  deps: VerifyEmailDeps = {}
): Promise<{ userId: string }> {
  if (isMalformedVerificationToken(rawToken)) {
    throw new InvalidOrExpiredVerificationTokenError();
  }

  const now = deps.now ?? new Date();
  const tokenHash = hashVerificationToken(rawToken);

  try {
    return await client.$transaction(async (tx) => {
      const tokenRow = await tx.verificationToken.findUnique({ where: { token: tokenHash } });
      if (!tokenRow || !tokenRow.identifier.startsWith(IDENTIFIER_PREFIX)) {
        throw new InvalidOrExpiredVerificationTokenError();
      }

      if (isVerificationTokenExpired(tokenRow.expires, now)) {
        // Best-effort cleanup — not required for correctness (an expired
        // row can never validate again regardless), keeps the table tidy.
        await tx.verificationToken.deleteMany({ where: { identifier: tokenRow.identifier, token: tokenRow.token } });
        throw new InvalidOrExpiredVerificationTokenError();
      }

      const consumed = await tx.verificationToken.deleteMany({
        where: { identifier: tokenRow.identifier, token: tokenRow.token },
      });
      if (consumed.count === 0) {
        throw new InvalidOrExpiredVerificationTokenError();
      }

      const email = tokenRow.identifier.slice(IDENTIFIER_PREFIX.length);
      const user = await tx.user.findUnique({ where: { email }, select: { id: true, deactivatedAt: true, emailVerified: true } });
      if (!user || user.deactivatedAt) {
        throw new AccountNotEligibleForVerificationError();
      }

      // Idempotent no-op if somehow already verified (e.g. a resend issued
      // after verification already completed, followed by a stale click on
      // the OLD link — the old link's token was already deleted by the
      // resend's own "invalidate previous token" step, so this branch is
      // largely defensive, not a reachable normal path).
      if (!user.emailVerified) {
        await tx.user.update({ where: { id: user.id }, data: { emailVerified: now } });
      }

      await writeAuditLog(
        {
          actorUserId: user.id,
          action: "email_verification.completed",
          entityType: "User",
          entityId: user.id,
        },
        tx
      );

      return { userId: user.id };
    });
  } catch (error) {
    if (error instanceof InvalidOrExpiredVerificationTokenError || error instanceof AccountNotEligibleForVerificationError) {
      // Logged OUTSIDE the (rolled-back) transaction, standalone — same
      // uniform-shape reasoning as password reset's own failure log: no
      // entityId/actorUserId, so this event's shape alone can never
      // distinguish "real expired token" from "attacker guessing tokens."
      await writeAuditLog(
        {
          action: "email_verification.invalid_or_expired",
          entityType: "User",
        },
        client
      ).catch(() => {
        // Audit-logging failure must never mask the real, higher-priority
        // error below.
      });
      throw new InvalidOrExpiredVerificationTokenError();
    }
    throw error;
  }
}
