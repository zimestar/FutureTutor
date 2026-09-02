import { CANADIAN_PROVINCES_AND_TERRITORIES, type CanadianProvinceCode } from "@/lib/canadianProvinces";

/**
 * BETA-AGE1 — province/territory-aware age-of-majority policy for
 * independent SELF_MANAGED Student signup.
 *
 * PRODUCT POLICY, not legal advice — this codifies the owner's own explicit
 * threshold decision for the current Canadian product; it does not
 * constitute a legal determination of age of majority for any purpose
 * beyond FutureTutor's own account-authority model.
 *
 * `Record<CanadianProvinceCode, 18 | 19>` requires every key from the
 * canonical province list (src/lib/canadianProvinces.ts) to be present —
 * this is a compile-time exhaustiveness check, not a second competing
 * list: if a province were ever added to/removed from the canonical list,
 * this object would fail to typecheck until updated to match.
 */
const AGE_OF_MAJORITY_BY_PROVINCE: Record<CanadianProvinceCode, 18 | 19> = {
  AB: 18,
  MB: 18,
  ON: 18,
  PE: 18,
  QC: 18,
  SK: 18,
  BC: 19,
  NB: 19,
  NL: 19,
  NT: 19,
  NS: 19,
  NU: 19,
  YT: 19,
};

export function ageOfMajorityForProvince(province: CanadianProvinceCode): 18 | 19 {
  return AGE_OF_MAJORITY_BY_PROVINCE[province];
}

/**
 * Pure calendar-date age calculation — deliberately NOT
 * `asOf.getFullYear() - dateOfBirth.getFullYear()` alone (that overcounts
 * by one for any birthday not yet reached this calendar year). Both
 * `dateOfBirth` and `asOf` are read via UTC getters consistently, treating
 * each as a calendar date rather than a wall-clock instant — this codebase
 * already constructs Student `dateOfBirth` values as UTC midnight
 * (`new Date(\`${dateOfBirth}T00:00:00.000Z\`)`, src/lib/actions/auth.ts),
 * so comparing via UTC getters on both sides avoids any timezone-dependent
 * off-by-one (a local-vs-UTC getter mismatch is exactly the class of bug
 * Phase F's `getAvailableSlots` fix — noted in the BETA-USER1 audit —
 * already had to correct once in this codebase, for an unrelated reason).
 *
 * Boundary behavior, verified by the exact examples the mission specifies:
 * one full day before a birthday is one year younger; the birthday itself
 * (and every day after) is the new age. A Feb 29 birthday naturally
 * resolves its "not yet had birthday" comparison against March 1 in a
 * non-leap `asOf` year (there is no Feb 29 to compare against that year),
 * which is the same convention most real-world systems already use — not
 * a special case this function needs to add.
 */
export function calculateAgeAsOf(dateOfBirth: Date, asOf: Date): number {
  let age = asOf.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const birthdayNotYetReachedThisYear =
    asOf.getUTCMonth() < dateOfBirth.getUTCMonth() ||
    (asOf.getUTCMonth() === dateOfBirth.getUTCMonth() && asOf.getUTCDate() < dateOfBirth.getUTCDate());
  if (birthdayNotYetReachedThisYear) {
    age -= 1;
  }
  return age;
}

/**
 * The single eligibility question this module answers: may this
 * (dateOfBirth, province) pair create a new independent SELF_MANAGED
 * Student account today? `asOf` defaults to the real current time but is
 * an explicit parameter so tests never depend on wall-clock time.
 */
export function isEligibleForSelfManagedSignup(
  dateOfBirth: Date,
  province: CanadianProvinceCode,
  asOf: Date = new Date()
): boolean {
  return calculateAgeAsOf(dateOfBirth, asOf) >= ageOfMajorityForProvince(province);
}

export { CANADIAN_PROVINCES_AND_TERRITORIES };
export type { CanadianProvinceCode };
