import "server-only";

/**
 * BETA-EMAILVERIFY1 — migration-free rollout gate.
 *
 * The production user inventory taken before this feature was built found
 * that `User.emailVerified` is `null` for every one of the 9 existing
 * production users — INCLUDING the existing SUPER_ADMIN account (created
 * before the admin-invitation flow that normally stamps `emailVerified` at
 * acceptance existed). A gate keyed on `emailVerified == null` alone would
 * therefore have locked out every legitimate existing user, including the
 * platform's own only administrator — exactly the "accidentally lock
 * existing production users out" failure the mission explicitly warns
 * against.
 *
 * Instead, this gate is keyed on `User.createdAt` against a single
 * explicit cutoff timestamp, read from `EMAIL_VERIFICATION_REQUIRED_SINCE`
 * — an env var, not a schema field, so this entire rollout mechanism is
 * migration-free by construction. Only an account created AT OR AFTER the
 * cutoff, that has not verified its email, is gated; every account created
 * before the cutoff (all 9 pre-existing users, and anything created before
 * this feature's own deploy) is grandfathered in, regardless of its
 * `emailVerified` value, forever — this module never re-derives "is this a
 * legacy account" from anything other than `createdAt` vs. the cutoff.
 *
 * Fails closed in the PERMISSIVE direction on a missing/invalid value —
 * the opposite of closedBetaConfig.ts's own fail-closed direction, and
 * deliberately so: closedBetaConfig.ts's risk asymmetry favors blocking
 * (an accidentally-open financial gate is the catastrophic outcome), while
 * this gate's risk asymmetry favors NOT blocking (an accidentally-enforced
 * verification gate with no cutoff set would lock out the site's own
 * admin account and every existing user the moment this code deploys,
 * which is unambiguously worse than "new accounts don't require
 * verification yet"). An unset or unparseable value means the gate is
 * fully inert — nobody is ever blocked — until a real cutoff is
 * deliberately set.
 */

export function emailVerificationRequiredSince(): Date | null {
  const raw = process.env.EMAIL_VERIFICATION_REQUIRED_SINCE;
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

/**
 * True only when: the account has never verified its email AND it was
 * created at or after the configured cutoff. Never re-evaluates any other
 * account property (role, suspension, etc.) — this is purely "does this
 * specific account need to prove email ownership before authorize() may
 * succeed," a single, narrow question.
 */
export function isEmailVerificationRequiredForUser(user: { emailVerified: Date | null; createdAt: Date }): boolean {
  if (user.emailVerified) return false;
  const cutoff = emailVerificationRequiredSince();
  if (!cutoff) return false;
  return user.createdAt.getTime() >= cutoff.getTime();
}
