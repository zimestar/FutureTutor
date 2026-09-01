import { describe, it, expect } from "vitest";
import type Stripe from "stripe";
import { deriveTutorStripeConnectStatus, deriveInitialStatusFromV2Account } from "./stripeConnect";

// PAY-1B onboarding-regression fix — pure unit coverage for
// deriveTutorStripeConnectStatus, isolated from the DB/Stripe-client
// plumbing already covered by stripeConnect.integration.test.ts. Minimal
// fixture shape mirrors that file's own FakeStripeAccount convention.

function account(overrides: Partial<{
  transfers: "active" | "inactive";
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  disabledReason: string | null;
  currentlyDue: string[];
  pastDue: string[];
}>): Stripe.Account {
  const {
    transfers = "inactive",
    payoutsEnabled = false,
    detailsSubmitted = false,
    disabledReason = null,
    currentlyDue = [],
    pastDue = [],
  } = overrides;
  return {
    capabilities: { transfers },
    payouts_enabled: payoutsEnabled,
    details_submitted: detailsSubmitted,
    requirements: { disabled_reason: disabledReason, currently_due: currentlyDue, past_due: pastDue },
  } as unknown as Stripe.Account;
}

describe("deriveTutorStripeConnectStatus", () => {
  it("REGRESSION — a freshly-created account with disabled_reason but details NOT submitted is PENDING, not DISABLED (the real observed Express account shape immediately after account creation)", () => {
    // Confirmed against a real Stripe test-mode Express account created via
    // this exact code path: Stripe populates requirements.disabled_reason
    // ("requirements.past_due") on essentially every not-yet-onboarded
    // account — this must never hide the tutor's only "continue setup"
    // entry point on /tutor/payouts.
    const result = deriveTutorStripeConnectStatus(
      account({ disabledReason: "requirements.past_due", detailsSubmitted: false, currentlyDue: ["business_type", "external_account", "tos_acceptance.date"] })
    );
    expect(result).toBe("PENDING");
  });

  it("a genuinely restricted account (disabled_reason present AND details already submitted) is DISABLED", () => {
    const result = deriveTutorStripeConnectStatus(
      account({ disabledReason: "requirements.past_due", detailsSubmitted: true, pastDue: ["individual.verification.document"] })
    );
    expect(result).toBe("DISABLED");
  });

  it("transfers active + payouts enabled is ACTIVE, regardless of any stale disabled_reason-shaped requirements object", () => {
    const result = deriveTutorStripeConnectStatus(account({ transfers: "active", payoutsEnabled: true }));
    expect(result).toBe("ACTIVE");
  });

  it("details submitted with outstanding requirements but no disabled_reason is RESTRICTED", () => {
    const result = deriveTutorStripeConnectStatus(
      account({ detailsSubmitted: true, currentlyDue: ["individual.id_number"] })
    );
    expect(result).toBe("RESTRICTED");
  });

  it("a fresh account with no requirements and nothing submitted falls through to PENDING", () => {
    const result = deriveTutorStripeConnectStatus(account({}));
    expect(result).toBe("PENDING");
  });

  it("outstanding requirements but details NOT submitted is PENDING, not RESTRICTED (still mid-onboarding)", () => {
    const result = deriveTutorStripeConnectStatus(
      account({ detailsSubmitted: false, currentlyDue: ["business_type"] })
    );
    expect(result).toBe("PENDING");
  });
});

// PROD-CONNECT-V2-MIGRATION2 — pure unit coverage for
// deriveInitialStatusFromV2Account, the Accounts v2 counterpart used only
// immediately after ensureConnectAccount's stripe.v2.core.accounts.create()
// call. Fixture shape mirrors the real v2 Account response's
// configuration.recipient.capabilities.stripe_balance.stripe_transfers
// path (confirmed against the installed Stripe SDK's own v2 type
// definitions).

function v2Account(status?: "active" | "pending" | "restricted" | "unsupported"): Stripe.V2.Core.Account {
  return {
    id: "acct_fake_v2",
    object: "v2.core.account",
    applied_configurations: ["recipient"],
    livemode: true,
    configuration: status
      ? { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status, status_details: [] } } } } }
      : undefined,
  } as unknown as Stripe.V2.Core.Account;
}

describe("deriveInitialStatusFromV2Account", () => {
  it("active stripe_transfers capability maps to ACTIVE", () => {
    expect(deriveInitialStatusFromV2Account(v2Account("active"))).toBe("ACTIVE");
  });

  it("restricted stripe_transfers capability maps to RESTRICTED", () => {
    expect(deriveInitialStatusFromV2Account(v2Account("restricted"))).toBe("RESTRICTED");
  });

  it("unsupported stripe_transfers capability maps to DISABLED", () => {
    expect(deriveInitialStatusFromV2Account(v2Account("unsupported"))).toBe("DISABLED");
  });

  it("pending stripe_transfers capability maps to PENDING (the expected, near-universal result immediately after creation)", () => {
    expect(deriveInitialStatusFromV2Account(v2Account("pending"))).toBe("PENDING");
  });

  it("no configuration.recipient in the response at all falls through safely to PENDING, never throws", () => {
    expect(deriveInitialStatusFromV2Account(v2Account(undefined))).toBe("PENDING");
  });
});
