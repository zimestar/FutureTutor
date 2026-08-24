import "server-only";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { getStripeClient } from "@/lib/stripe";
import type { StripeConnectStatus } from "@/generated/prisma/enums";

/**
 * The ONLY place in the codebase allowed to interpret raw Stripe Account
 * fields — every other call site (the transfer-creation sweep, the admin
 * UI) consumes the already-normalized TutorProfile.stripeConnectStatus.
 *
 * Based on the `transfers` capability + payouts_enabled specifically —
 * FutureTutor uses separate charges and transfers and never creates a
 * direct charge on a tutor's connected account, so card_payments/other
 * charge-side capabilities are irrelevant here. Field shapes confirmed
 * against the installed Stripe SDK's own type definitions
 * (node_modules/stripe); re-verify against current Stripe documentation
 * if the SDK version ever changes.
 */
export function deriveTutorStripeConnectStatus(account: Stripe.Account): StripeConnectStatus {
  const requirements = account.requirements;
  // A freshly-created (or still-incomplete) Express account normally has
  // requirements.disabled_reason populated (typically
  // "requirements.past_due") purely because onboarding hasn't been
  // completed yet — Stripe sets this on essentially every not-yet-
  // submitted account, not only ones that have genuinely been restricted
  // after being active. Trusting it unconditionally here misclassified a
  // brand-new account as DISABLED, which the payouts page treats exactly
  // like ACTIVE (no "continue setup" action shown) — permanently hiding
  // the tutor's only way back into onboarding. disabled_reason is only a
  // meaningful DISABLED signal once the tutor has actually submitted their
  // details; before that, an outstanding-requirements account falls
  // through to the ordinary PENDING/RESTRICTED handling below.
  if (requirements?.disabled_reason && account.details_submitted) return "DISABLED";

  const transfersActive = account.capabilities?.transfers === "active";
  if (transfersActive && account.payouts_enabled) return "ACTIVE";

  const hasOutstandingRequirements =
    (requirements?.currently_due?.length ?? 0) > 0 || (requirements?.past_due?.length ?? 0) > 0;
  if (hasOutstandingRequirements && account.details_submitted) return "RESTRICTED";

  return "PENDING";
}

/** Step A/B/C — idempotent by construction: TutorProfile.stripeConnectAccountId
 * is the durable anchor; a retry finds the existing account rather than
 * creating a second one. */
export async function ensureConnectAccount(tutorProfileId: string): Promise<string> {
  const tutor = await db.tutorProfile.findUniqueOrThrow({
    where: { id: tutorProfileId },
    include: { user: { select: { email: true } } },
  });
  if (tutor.stripeConnectAccountId) return tutor.stripeConnectAccountId;

  const stripe = getStripeClient();
  const account = await stripe.accounts.create(
    {
      type: "express",
      email: tutor.user.email,
      capabilities: { transfers: { requested: true } },
      metadata: { tutorProfileId },
    },
    { idempotencyKey: `connect-account:${tutorProfileId}` }
  );

  const status = deriveTutorStripeConnectStatus(account);
  await db.tutorProfile.updateMany({
    where: { id: tutorProfileId, stripeConnectAccountId: null },
    data: { stripeConnectAccountId: account.id, stripeConnectStatus: status },
  });

  // A concurrent request may have already persisted a different (or the
  // same, from Stripe's own idempotency) account id — always return
  // whatever is now authoritatively on the row.
  const persisted = await db.tutorProfile.findUniqueOrThrow({ where: { id: tutorProfileId } });
  return persisted.stripeConnectAccountId ?? account.id;
}

/** Tutors resume incomplete onboarding by generating a fresh link — Account
 * Links expire quickly and are never stored/reused. */
export async function createOnboardingLink(tutorProfileId: string, returnUrl: string, refreshUrl: string): Promise<string> {
  const accountId = await ensureConnectAccount(tutorProfileId);
  const stripe = getStripeClient();
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    return_url: returnUrl,
    refresh_url: refreshUrl,
  });
  return link.url;
}

export async function syncTutorConnectStatusFromStripe(tutorProfileId: string): Promise<void> {
  const tutor = await db.tutorProfile.findUniqueOrThrow({ where: { id: tutorProfileId } });
  if (!tutor.stripeConnectAccountId) return;
  const stripe = getStripeClient();
  const account = await stripe.accounts.retrieve(tutor.stripeConnectAccountId);
  await syncTutorConnectStatusFromAccount(account);
}

/** Called from the account.updated webhook — resolves which TutorProfile the
 * account belongs to via server-set metadata first, falling back to the
 * stored stripeConnectAccountId. */
export async function syncTutorConnectStatusFromAccount(account: Stripe.Account): Promise<void> {
  const metadataTutorProfileId = account.metadata?.tutorProfileId;
  let tutor = metadataTutorProfileId
    ? await db.tutorProfile.findUnique({ where: { id: metadataTutorProfileId } })
    : null;
  if (!tutor || tutor.stripeConnectAccountId !== account.id) {
    tutor = await db.tutorProfile.findFirst({ where: { stripeConnectAccountId: account.id } });
  }
  if (!tutor) return; // unknown account — nothing local to update

  const status = deriveTutorStripeConnectStatus(account);
  if (tutor.stripeConnectStatus !== status) {
    await db.tutorProfile.update({ where: { id: tutor.id }, data: { stripeConnectStatus: status } });
  }
}
