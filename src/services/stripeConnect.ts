import "server-only";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { getStripeClient } from "@/lib/stripe";
import { stripeConnectOnboardingAvailable } from "@/lib/stripeConnectConfig";
import { stripeConnectAccountCountry } from "@/lib/stripeConnectCountry";
import type { StripeConnectStatus } from "@/generated/prisma/enums";

/**
 * BETA-LAUNCHFIX1 — thrown by ensureConnectAccount when Stripe Connect
 * onboarding is not currently available (see stripeConnectConfig.ts). Kept
 * distinct from any Stripe SDK error class since it never reaches Stripe at
 * all — this is a pre-Stripe, config-level rejection.
 */
export class StripeConnectDisabledError extends Error {}

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

/**
 * PROD-CONNECT-V2-MIGRATION2 — maps the Accounts v2 create-account
 * response's recipient/stripe_transfers capability status onto the same
 * StripeConnectStatus model deriveTutorStripeConnectStatus produces for
 * v1-shaped payloads. Used ONLY immediately after a fresh
 * stripe.v2.core.accounts.create() call.
 *
 * Every ONGOING status read (the account.updated webhook, and the manual
 * resync on `?onboarding=return`) intentionally keeps going through the
 * unchanged deriveTutorStripeConnectStatus above, never this function —
 * confirmed via Stripe's own documentation (PROD-CONNECT-V2-MIGRATION1
 * §10) that a v2-created account still fires the classic v1-shaped
 * `account.updated` event, and that a v1 accounts.retrieve() call still
 * returns v1-shaped data for a v2-created account. This avoids needing a
 * single dual-shape derivation function, per the certified plan's explicit
 * recommendation.
 *
 * Stripe's own documentation states a freshly created account "exists in
 * a pending state" — PENDING is therefore the expected, near-universal
 * result here (ACTIVE is not realistically reachable before any KYC has
 * happened). This function still reads the real response rather than
 * hardcoding that, so it stays correct if Stripe ever returns something
 * more specific inline.
 */
export function deriveInitialStatusFromV2Account(account: Stripe.V2.Core.Account): StripeConnectStatus {
  const status = account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
  if (status === "active") return "ACTIVE";
  if (status === "restricted") return "RESTRICTED";
  if (status === "unsupported") return "DISABLED";
  return "PENDING";
}

/** Step A/B/C — idempotent by construction: TutorProfile.stripeConnectAccountId
 * is the durable anchor; a retry finds the existing account rather than
 * creating a second one.
 *
 * PROD-CONNECT-RETRYFIX1 — the Stripe idempotency key additionally includes
 * stripeConnectAttemptEpoch. Stripe caches a POST's result under its
 * idempotency key regardless of outcome, including a 4xx — so a permanent,
 * un-varying key would replay a confirmed pre-creation rejection (e.g. an
 * incomplete Connect platform profile) forever, even after the underlying
 * condition is fixed, since nothing about the key ever changes. The epoch
 * advances only when accounts.create throws StripeInvalidRequestError — the
 * one error class Stripe's own SDK reserves for a definitive 400/404
 * rejection of the request itself, which by construction means no Account
 * object was created (confirmed empirically: zero connected accounts existed
 * after every such failure during PROD-CONNECT1). Every other outcome
 * (5xx/StripeAPIError, network/StripeConnectionError, rate limits, auth/
 * permission errors) is treated by Stripe's own documentation as ambiguous
 * or definitively NOT a proof-of-non-creation, so the epoch — and therefore
 * the idempotency key — must stay unchanged, preserving the original
 * crash-recovery guarantee (a retry safely rediscovers a possibly-already-
 * created account instead of risking a duplicate). The advancing update is
 * a guarded compare-and-swap on the exact epoch just used, so two concurrent
 * requests hitting the same confirmed rejection can't double-advance. */
export async function ensureConnectAccount(tutorProfileId: string): Promise<string> {
  // BETA-LAUNCHFIX1 — the single authoritative choke point: checked here,
  // not only in startStripeOnboardingAction, so that ANY caller of this
  // function (present or future) is stopped before any Stripe SDK network
  // operation, regardless of how it was reached. This is deliberately the
  // very first line — before even the DB read below — so a disabled gate
  // costs nothing but a string comparison.
  if (!stripeConnectOnboardingAvailable()) {
    throw new StripeConnectDisabledError("Stripe Connect onboarding is not currently available.");
  }

  const tutor = await db.tutorProfile.findUniqueOrThrow({
    where: { id: tutorProfileId },
    include: { user: { select: { email: true } } },
  });
  if (tutor.stripeConnectAccountId) return tutor.stripeConnectAccountId;

  const stripe = getStripeClient();
  const attemptEpoch = tutor.stripeConnectAttemptEpoch;
  const idempotencyKey = `connect-account:${tutorProfileId}:${attemptEpoch}`;
  // PROD-CONNECT-V2-COUNTRYFIX1 — resolved as its own statement, before the
  // Stripe call below, so an unsupported/misconfigured country fails
  // structurally before any Stripe SDK network operation — not merely as
  // a side effect of object-literal evaluation order.
  const accountCountry = stripeConnectAccountCountry();

  // PROD-CONNECT-V2-MIGRATION2 — Accounts v2, per the certified migration
  // plan's §7 configuration (recipient + Express Dashboard access +
  // platform responsible for fees/losses, matching the marketplace
  // acknowledgements already accepted on the Stripe Dashboard). `include`
  // requests the recipient capability status inline so
  // deriveInitialStatusFromV2Account below has real data to read.
  //
  // PROD-CONNECT-V2-COUNTRYFIX1 — LIVE2's controlled live attempt found
  // Stripe now requires identity.country before configuration.recipient
  // can be set (StripeInvalidRequestError, code identity_country_required
  // — the platform-activation blocker itself was separately confirmed
  // resolved). stripeConnectAccountCountry() is the sole, fail-closed
  // source for this value — see its own doc comment.
  let account: Stripe.V2.Core.Account;
  try {
    account = await stripe.v2.core.accounts.create(
      {
        contact_email: tutor.user.email,
        dashboard: "express",
        identity: {
          country: accountCountry,
        },
        defaults: {
          responsibilities: {
            fees_collector: "application",
            losses_collector: "application",
          },
        },
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: { stripe_transfers: { requested: true } },
            },
          },
        },
        include: ["configuration.recipient"],
        metadata: { tutorProfileId },
      },
      { idempotencyKey }
    );
  } catch (error) {
    // Error-class-based, not shape-based — unchanged from the v1
    // implementation. StripeInvalidRequestError remains the class Stripe's
    // own SDK resolves a definitive 4xx to (confirmed for v2 requests too:
    // Error.js's generateV2Error falls through to the same statusCode-based
    // generateV1Error classification for anything that isn't one of v2's
    // few specially-named error types), so this still proves nothing was
    // created and the epoch can safely advance for the next attempt. Every
    // other outcome (5xx, network, rate limit, auth/permission) leaves the
    // epoch untouched, preserving PROD-CONNECT-RETRYFIX1's crash-recovery
    // guarantee unchanged.
    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      await db.tutorProfile.updateMany({
        where: { id: tutorProfileId, stripeConnectAccountId: null, stripeConnectAttemptEpoch: attemptEpoch },
        data: { stripeConnectAttemptEpoch: { increment: 1 } },
      });
    }
    throw error;
  }

  const status = deriveInitialStatusFromV2Account(account);
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
 * Links expire quickly and are never stored/reused.
 *
 * PROD-CONNECT-V2-MIGRATION2 — v2 Account Links (per the certified plan's
 * §6): still a single-use, redirect-based, Stripe-hosted URL — no embedded
 * ConnectJS component required, preserving the existing tutor-facing UX
 * unchanged. */
export async function createOnboardingLink(tutorProfileId: string, returnUrl: string, refreshUrl: string): Promise<string> {
  const accountId = await ensureConnectAccount(tutorProfileId);
  const stripe = getStripeClient();
  const link = await stripe.v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["recipient"],
        return_url: returnUrl,
        refresh_url: refreshUrl,
      },
    },
  });
  return link.url;
}

// PROD-CONNECT-V2-MIGRATION2 — deliberately still stripe.accounts.retrieve
// (v1), not stripe.v2.core.accounts.retrieve, even for a v2-created
// account id. Confirmed via Stripe's own documentation that a v1 endpoint
// referencing a v2 Account id returns v1-shaped data, so this keeps
// deriveTutorStripeConnectStatus's existing, unchanged, well-tested v1
// logic as the single source of truth for every ongoing status read —
// the certified migration plan's explicit recommendation to avoid a
// second, v2-shaped derivation function on this path.
export async function syncTutorConnectStatusFromStripe(tutorProfileId: string): Promise<void> {
  const tutor = await db.tutorProfile.findUniqueOrThrow({ where: { id: tutorProfileId } });
  if (!tutor.stripeConnectAccountId) return;
  const stripe = getStripeClient();
  const account = await stripe.accounts.retrieve(tutor.stripeConnectAccountId);
  await syncTutorConnectStatusFromAccount(account);
}

/**
 * PROD-CONNECT-SYNCFIX1 — the single trigger condition for an authenticated,
 * on-page-load resync (src/app/[locale]/tutor/payouts/page.tsx), extracted
 * so it's unit-testable without rendering the page. Two independent reasons
 * to resync:
 *   - `onboarding === "return"`: the tutor just came back from Stripe-hosted
 *     onboarding (unchanged from the original, pre-existing behavior).
 *   - status is not yet a terminal/settled value (anything other than
 *     ACTIVE/DISABLED): defense-in-depth against a missed or delayed
 *     webhook — investigated in PROD-CONNECT-ONBOARD1/SYNCFIX1, where a
 *     real connected account reached Stripe's fully-active state while
 *     FutureTutor's local record stayed stuck at its account-creation-time
 *     value with no webhook ever having arrived to correct it. Once a
 *     tutor's status is genuinely ACTIVE or DISABLED, this stops firing on
 *     every page load — only an unsettled status keeps re-checking.
 */
export function shouldResyncStripeConnectStatus(status: StripeConnectStatus, onboardingParam: string | undefined): boolean {
  return onboardingParam === "return" || (status !== "ACTIVE" && status !== "DISABLED");
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
