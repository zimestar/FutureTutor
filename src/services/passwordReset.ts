import "server-only";
import { randomBytes, createHash } from "crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { writeAuditLog } from "@/lib/audit";

/**
 * L1-01A — Secure Account Recovery backend. Forgot-password / reset-password
 * business logic, structured the same way every other guarded single-use
 * time-limited server-side operation in this codebase is (Session Lifecycle
 * Phases 1-4, H.8, Phase H.4/H.5 family invitations): pure decision helpers
 * (no I/O) + a guarded transactional core (delete-then-count-check, never a
 * blind read-then-write) + an injectable clock (never client-supplied time).
 *
 * Token storage reuses the existing `VerificationToken` model (Auth.js
 * adapter scaffold, currently unused anywhere in this app — see the L1-01A
 * task's own pre-investigation) rather than adding a migration:
 *   - `identifier` stores a purpose-namespaced key (`password-reset:<email>`,
 *     not the bare email) so a future email-verification feature reusing the
 *     same table by bare email can never collide with an outstanding
 *     password-reset row, or have it deleted by this module's
 *     "invalidate previous tokens" step (§10 of the task).
 *   - `token` stores the SHA-256 hash of the raw token — never the raw
 *     value — mirroring src/services/familyManagement.ts's
 *     hashInvitationToken precedent exactly (task security contract §B).
 *   - `expires` is the server-computed expiry (contract §C).
 *   - Single-use consumption is a guarded `deleteMany` keyed on the model's
 *     own unique compound key (identifier, token): under Postgres's default
 *     Read Committed isolation, a second concurrent DELETE against an
 *     already-deleted row simply affects 0 rows once the first commits (no
 *     read-then-write TOCTOU window, no serialization anomaly possible) —
 *     the exact same "single UPDATE/DELETE is already atomic, no Serializable
 *     isolation needed" reasoning this codebase's own
 *     claimGuardianInvitation already documents. withSerializableRetry is
 *     deliberately NOT used here for that reason.
 */

// Judgment call (no existing precedent to reuse): 1 hour. Deliberately
// shorter than FamilyInvitation's 72h TTL — a password-reset token is a much
// higher-value target (it grants full account takeover on its own, whereas a
// family invitation only grants a relationship pending further approval), so
// a tighter window is the safer default absent explicit product guidance.
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

const IDENTIFIER_PREFIX = "password-reset:";

export function normalizeResetEmail(email: string): string {
  return email.trim().toLowerCase();
}

function buildResetIdentifier(email: string): string {
  return `${IDENTIFIER_PREFIX}${normalizeResetEmail(email)}`;
}

/** Pure, no I/O — SHA-256 hex digest of a raw token. Exported so unit tests
 * can assert hashing behavior directly without a database, mirroring
 * hashInvitationToken's own precedent. */
export function hashResetToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** Cryptographically secure token (crypto.randomBytes, never Math.random).
 * Returned to the caller exactly once — never persisted, logged, or
 * included in any audit metadata. Only its SHA-256 hash is ever written to
 * the DB. */
function generateResetToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString("base64url");
  return { rawToken, tokenHash: hashResetToken(rawToken) };
}

/** Pure, no I/O. */
export function isResetTokenExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() < now.getTime();
}

/** Pure, no I/O — defends resetPassword against non-string / absurdly
 * short-or-long client input before any DB lookup (test matrix item 10,
 * "malformed token rejected"). A syntactically well-formed but unknown
 * token is rejected later, by the DB lookup finding no matching hash — this
 * only screens out input that could never possibly be a real token. */
export function isMalformedResetToken(rawToken: unknown): boolean {
  return typeof rawToken !== "string" || rawToken.length < 16 || rawToken.length > 512;
}

export class InvalidOrExpiredResetTokenError extends Error {}
export class ResetPasswordPolicyError extends Error {}
export class AccountNotEligibleForResetError extends Error {}

export interface SendPasswordResetEmailParams {
  email: string;
  resetUrl: string;
  locale: string;
}

export type SendPasswordResetEmail = (params: SendPasswordResetEmailParams) => Promise<void>;

/**
 * Delivery boundary. §9 of the L1-01A task: "if no production-capable email
 * delivery exists, implement the recovery business contract up to a clean
 * delivery boundary ... report the missing production delivery dependency."
 * Grep confirms zero email infrastructure exists anywhere in this codebase
 * (.env.example's RESEND_API_KEY is commented out and unread by any code;
 * no EmailService/sendEmail exists) — this is that boundary, mirroring
 * notify.ts's own "explicit not-configured state" discipline.
 *
 * Judgment call: this prints the reset URL (including the raw token) to
 * stdout, treated here as the functional local-dev equivalent of "the user
 * received the email," not as an application log — AuditLog and any
 * persisted/structured log path in this module never receive the raw token
 * (see requestPasswordReset/resetPassword below). A real provider (Resend
 * or equivalent) MUST replace this before production launch; see the L1-01A
 * report's EMAIL DELIVERY section.
 */
export const consoleDevSendPasswordResetEmail: SendPasswordResetEmail = async ({ email, resetUrl, locale }) => {
  console.log(
    `[passwordReset] DEV ONLY — no email provider configured (see .env.example RESEND_API_KEY). ` +
      `Would send password-reset email to ${email} (locale=${locale}): ${resetUrl}`
  );
};

export interface RequestPasswordResetDeps {
  /** Injectable clock — never client-supplied time (matches this codebase's
   * established convention). */
  now?: Date;
  locale: string;
  sendEmail: SendPasswordResetEmail;
  /** Builds the absolute, locale-aware reset URL from the raw token. Kept
   * as an injected function (rather than this module importing next-intl
   * navigation / headers directly) so this stays a plain, DB/email-only
   * service with no framework-request coupling — mirrors every other
   * service in src/services taking its collaborators as parameters. */
  buildResetUrl: (rawToken: string) => string;
}

/**
 * §7 — the single authoritative "forgot password" entry point.
 *
 * Deliberately returns void and NEVER throws for "no such user" / "account
 * not eligible" — those are the exact same code path as "user exists," so
 * the caller (the Server Action) can return one identical generic response
 * regardless of outcome (contract §A, "must NOT reveal whether the email
 * exists"). A genuine infrastructure failure (DB error, email-send error)
 * DOES throw — the Server Action layer is responsible for catching that and
 * still presenting the same generic outcome to the browser, only logging
 * the failure server-side.
 */
export async function requestPasswordReset(
  client: PrismaClient,
  rawEmail: string,
  deps: RequestPasswordResetDeps
): Promise<void> {
  const email = normalizeResetEmail(rawEmail);
  const now = deps.now ?? new Date();

  const user = await client.user.findUnique({
    where: { email },
    select: { id: true, deactivatedAt: true, passwordHash: true },
  });

  // No account, a deactivated account, or an account with no local password
  // (a future OAuth-only account, once Account/Session are ever actually
  // wired up) — all silently no-op. No distinguishing branch, no error, no
  // audit row: per §11, an unknown-email request must never be logged in a
  // way that exposes account membership.
  if (!user || user.deactivatedAt || !user.passwordHash) {
    return;
  }

  const identifier = buildResetIdentifier(email);
  const { rawToken, tokenHash } = generateResetToken();
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS);

  // §10 — "invalidate/replace older outstanding reset token(s)": delete any
  // existing tokens for this identifier before issuing a new one, so at
  // most one reset token is ever active per account (test matrix item 13 —
  // deterministic active-token policy, stale token cannot unexpectedly
  // win). Wrapped in a transaction purely for delete+create atomicity, not
  // for any concurrency-correctness reason — Read Committed default
  // isolation is sufficient here (no invariant depends on it beyond "don't
  // leave the table half-updated").
  await client.$transaction(async (tx) => {
    await tx.verificationToken.deleteMany({ where: { identifier } });
    await tx.verificationToken.create({ data: { identifier, token: tokenHash, expires: expiresAt } });
  });

  const resetUrl = deps.buildResetUrl(rawToken);
  await deps.sendEmail({ email, resetUrl, locale: deps.locale });

  // §11 — safe event, no plaintext password / hash / raw token anywhere in
  // metadata. Explicitly passed `client` (not the default `db` singleton
  // writeAuditLog would otherwise fall back to) so this write targets the
  // same database this whole call was given — load-bearing for the
  // integration tests, which inject an isolated test-database client here.
  await writeAuditLog(
    {
      actorUserId: user.id,
      action: "password_reset.requested",
      entityType: "User",
      entityId: user.id,
    },
    client
  );
}

export interface ResetPasswordDeps {
  now?: Date;
  /** The authoritative password-hashing contract — callers pass
   * `(password) => bcrypt.hash(password, 12)`, the exact same call shape
   * registerAction uses (task §H / §5). Injected rather than imported
   * directly so this module has no bcryptjs dependency of its own and unit
   * tests can substitute a fast fake. */
  hashPassword: (password: string) => Promise<string>;
}

/**
 * §8 — the single authoritative "reset password" entry point. Validates the
 * token, validates expiry, identifies the account, hashes the new password,
 * replaces it, and consumes the token — all inside one transaction, so
 * password replacement and token consumption can never partially succeed
 * (task §8's own explicit requirement) and so a concurrent double-use of
 * the same raw token has exactly one winner (test matrix item 14).
 *
 * Every failure path (malformed / unknown / already-consumed / expired
 * token, ineligible account) throws InvalidOrExpiredResetTokenError — the
 * SAME error, indistinguishable to the caller, matching contract §E/§F/§G's
 * "reusing/expired/invalid token must fail" without leaking which specific
 * reason applied.
 */
export async function resetPassword(
  client: PrismaClient,
  rawToken: string,
  newPassword: string,
  deps: ResetPasswordDeps
): Promise<{ userId: string }> {
  if (isMalformedResetToken(rawToken)) {
    throw new InvalidOrExpiredResetTokenError();
  }

  // Password policy is enforced by the caller (Server Action, via
  // resetPasswordSchema) before this is ever invoked in the real request
  // path — re-checked here too so this service is safe to call directly
  // (e.g. from tests or a future non-form caller) without silently skipping
  // the policy. Kept as a length-only mirror of passwordPolicySchema
  // (min 8 / max 72) rather than importing the Zod schema, so this service
  // has no dependency on the schemas layer.
  if (newPassword.length < 8 || newPassword.length > 72) {
    throw new ResetPasswordPolicyError();
  }

  const now = deps.now ?? new Date();
  const tokenHash = hashResetToken(rawToken);

  // bcrypt hashing is CPU-bound and independent of any DB state — done
  // before opening the transaction so the transaction (and any row locks it
  // takes) stays open for as short a time as possible.
  const passwordHash = await deps.hashPassword(newPassword);

  try {
    return await client.$transaction(async (tx) => {
      const tokenRow = await tx.verificationToken.findUnique({ where: { token: tokenHash } });
      if (!tokenRow || !tokenRow.identifier.startsWith(IDENTIFIER_PREFIX)) {
        throw new InvalidOrExpiredResetTokenError();
      }

      if (isResetTokenExpired(tokenRow.expires, now)) {
        // Best-effort cleanup of the stale row. Not required for
        // correctness (an expired row can never validate again regardless
        // of whether it's deleted), but keeps the table from accumulating
        // dead rows indefinitely.
        await tx.verificationToken.deleteMany({ where: { identifier: tokenRow.identifier, token: tokenRow.token } });
        throw new InvalidOrExpiredResetTokenError();
      }

      // Guarded single-use consumption — see module doc comment for why a
      // plain deleteMany + count-check is sufficient here without
      // Serializable isolation. If another concurrent call already consumed
      // this exact (identifier, token) pair, this deletes 0 rows.
      const consumed = await tx.verificationToken.deleteMany({
        where: { identifier: tokenRow.identifier, token: tokenRow.token },
      });
      if (consumed.count === 0) {
        throw new InvalidOrExpiredResetTokenError();
      }

      const email = tokenRow.identifier.slice(IDENTIFIER_PREFIX.length);
      const user = await tx.user.findUnique({ where: { email }, select: { id: true, deactivatedAt: true } });
      if (!user || user.deactivatedAt) {
        // The account was deactivated (or, in principle, deleted) between
        // request and reset. Fails closed rather than reviving/mutating a
        // deactivated account's password.
        throw new AccountNotEligibleForResetError();
      }

      // §H — same authoritative hashing contract as registration, and
      // ONLY the passwordHash column is touched: role/profile/anything
      // else on User is never mutated by this module (test matrix item 12,
      // auth firewall §13).
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });

      await writeAuditLog(
        {
          actorUserId: user.id,
          action: "password_reset.completed",
          entityType: "User",
          entityId: user.id,
        },
        tx
      );

      return { userId: user.id };
    });
  } catch (error) {
    if (error instanceof InvalidOrExpiredResetTokenError || error instanceof AccountNotEligibleForResetError) {
      // Logged OUTSIDE the (now-rolled-back) transaction, standalone
      // against the top-level client, so the failure event itself is
      // durably recorded even though nothing else about this attempt was.
      // No entityId/actorUserId here even when a real user was transiently
      // resolvable (expired/reused-token case) — this keeps the failure
      // log uniform across every rejection reason, including the pure
      // garbage-token case where no user was ever resolved, so its shape
      // alone can never be used to distinguish "real expired token" from
      // "attacker guessing tokens" (§11).
      await writeAuditLog(
        {
          action: "password_reset.invalid_or_expired",
          entityType: "User",
        },
        client
      ).catch(() => {
        // Audit-logging failure must never mask the real (already
        // higher-priority) error below.
      });
      // AccountNotEligibleForResetError collapses into the same public
      // error as every other rejection reason (contract §E/§F/§G) — never
      // surfaced as a distinct case to the caller.
      throw new InvalidOrExpiredResetTokenError();
    }
    throw error;
  }
}
