import { beforeEach, describe, expect, it, vi } from "vitest";

// BETA-LAUNCHFIX1 — permanent, fully-mocked unit coverage proving
// ensureConnectAccount stops BEFORE any database read or Stripe SDK call
// when Stripe Connect onboarding is disabled — the authoritative backstop
// behind startStripeOnboardingAction's own early-exit (see
// src/lib/actions/stripeConnectGate.test.ts for the action-layer coverage).
// Deliberately a plain unit test (not .integration.test.ts) — both the DB
// and the Stripe client are mocked so this proves the gate fires before
// either is ever touched, without needing a real database.

const mocks = vi.hoisted(() => ({
  stripeConnectOnboardingAvailable: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  getStripeClient: vi.fn(),
}));

vi.mock("@/lib/stripeConnectConfig", () => ({
  stripeConnectOnboardingAvailable: mocks.stripeConnectOnboardingAvailable,
}));
vi.mock("@/lib/db", () => ({
  db: { tutorProfile: { findUniqueOrThrow: mocks.findUniqueOrThrow, updateMany: vi.fn() } },
}));
vi.mock("@/lib/stripe", () => ({ getStripeClient: mocks.getStripeClient }));

import { ensureConnectAccount, createOnboardingLink, StripeConnectDisabledError } from "./stripeConnect";

describe("ensureConnectAccount — BETA-LAUNCHFIX1 Connect availability gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("F/G. gate disabled -> throws StripeConnectDisabledError before ANY database read or Stripe client construction — reproduces the exact BETA-LAUNCH1 P0 scenario (an otherwise-fully-eligible APPROVED tutor still cannot create an account)", async () => {
    mocks.stripeConnectOnboardingAvailable.mockReturnValue(false);
    // Configure the DB mock as if a real, fully-eligible APPROVED tutor
    // exists — proving the rejection is NOT because the tutor lookup failed,
    // but because the gate itself stops execution first.
    mocks.findUniqueOrThrow.mockResolvedValue({
      id: "tutor-profile-1",
      applicationStatus: "APPROVED",
      stripeConnectAccountId: null,
      user: { email: "tutor@example.com" },
    });

    await expect(ensureConnectAccount("tutor-profile-1")).rejects.toThrow(StripeConnectDisabledError);

    expect(mocks.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(mocks.getStripeClient).not.toHaveBeenCalled();
  });

  it("F. createOnboardingLink (a crafted/direct caller bypassing the Server Action entirely) is stopped identically — it delegates to ensureConnectAccount first, so no Account Link call is ever reached either", async () => {
    mocks.stripeConnectOnboardingAvailable.mockReturnValue(false);

    await expect(
      createOnboardingLink("tutor-profile-1", "https://example.com/return", "https://example.com/refresh")
    ).rejects.toThrow(StripeConnectDisabledError);

    expect(mocks.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(mocks.getStripeClient).not.toHaveBeenCalled();
  });

  it("the gate is re-read on every call, not cached — flipping it mid-process is picked up immediately", async () => {
    mocks.stripeConnectOnboardingAvailable.mockReturnValue(false);
    await expect(ensureConnectAccount("tutor-profile-1")).rejects.toThrow(StripeConnectDisabledError);

    mocks.stripeConnectOnboardingAvailable.mockReturnValue(true);
    mocks.findUniqueOrThrow.mockResolvedValue({
      id: "tutor-profile-1",
      stripeConnectAccountId: "acct_already_exists",
      user: { email: "tutor@example.com" },
    });
    // With the gate now enabled and an account already on file, the
    // function's own existing idempotent short-circuit returns it directly
    // — proving execution genuinely proceeds past the gate this time,
    // without needing a real Stripe client mock for this assertion.
    await expect(ensureConnectAccount("tutor-profile-1")).resolves.toBe("acct_already_exists");
  });
});

// PROD-CONNECT-V2-COUNTRYFIX1 — permanent coverage for the exact payload
// LIVE2's live attempt found broken (missing identity.country, causing
// StripeInvalidRequestError/identity_country_required). Same fully-mocked
// approach as above — a real Stripe client is never constructed, only a
// stub whose accounts.create call is inspected for its exact params.
describe("ensureConnectAccount — PROD-CONNECT-V2-COUNTRYFIX1 payload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.stripeConnectOnboardingAvailable.mockReturnValue(true);
  });

  function stubStripeClient(createImpl: (params: unknown, options: { idempotencyKey: string }) => Promise<unknown>) {
    const create = vi.fn(createImpl);
    mocks.getStripeClient.mockReturnValue({ v2: { core: { accounts: { create } } } });
    return create;
  }

  it("A/D/E. the create payload includes identity.country=CA while every other certified field is unchanged", async () => {
    mocks.findUniqueOrThrow.mockResolvedValue({
      id: "tutor-profile-1",
      stripeConnectAccountId: null,
      stripeConnectAttemptEpoch: 4,
      user: { email: "tutor@example.com" },
    });
    const create = stubStripeClient(async () => ({
      id: "acct_new",
      configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: "pending" } } } } },
    }));

    await ensureConnectAccount("tutor-profile-1");

    expect(create).toHaveBeenCalledTimes(1);
    const [params] = create.mock.calls[0] as [Record<string, unknown>, { idempotencyKey: string }];
    expect(params.identity).toEqual({ country: "CA" });
    expect(params).toMatchObject({
      contact_email: "tutor@example.com",
      dashboard: "express",
      defaults: { responsibilities: { fees_collector: "application", losses_collector: "application" } },
      configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
      include: ["configuration.recipient"],
      metadata: { tutorProfileId: "tutor-profile-1" },
    });
  });

  it("I. idempotency key still uses the tutor's current attempt epoch, unmodified by this fix", async () => {
    mocks.findUniqueOrThrow.mockResolvedValue({
      id: "tutor-profile-1",
      stripeConnectAccountId: null,
      stripeConnectAttemptEpoch: 4,
      user: { email: "tutor@example.com" },
    });
    const create = stubStripeClient(async () => ({
      id: "acct_new",
      configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: "pending" } } } } },
    }));

    await ensureConnectAccount("tutor-profile-1");

    const [, options] = create.mock.calls[0] as [unknown, { idempotencyKey: string }];
    expect(options.idempotencyKey).toBe("connect-account:tutor-profile-1:4");
  });

  it("C. province codes are never sent as identity.country — the payload's country is always the fixed ISO code, independent of any province value", async () => {
    mocks.findUniqueOrThrow.mockResolvedValue({
      id: "tutor-profile-1",
      stripeConnectAccountId: null,
      stripeConnectAttemptEpoch: 0,
      user: { email: "tutor@example.com" },
      // A province-shaped value deliberately present on the mocked row to
      // prove ensureConnectAccount's payload construction never reads any
      // province field at all — it has no code path that could confuse
      // "ON"/"QC"/etc. with a country.
      province: "ON",
    });
    const create = stubStripeClient(async () => ({
      id: "acct_new",
      configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: "pending" } } } } },
    }));

    await ensureConnectAccount("tutor-profile-1");

    const [params] = create.mock.calls[0] as [Record<string, unknown>, { idempotencyKey: string }];
    expect(params.identity).toEqual({ country: "CA" });
    expect(params.identity).not.toEqual({ country: "ON" });
  });

  it("J. no Accounts v1 creation path exists — only v2.core.accounts.create is ever invoked", async () => {
    mocks.findUniqueOrThrow.mockResolvedValue({
      id: "tutor-profile-1",
      stripeConnectAccountId: null,
      stripeConnectAttemptEpoch: 0,
      user: { email: "tutor@example.com" },
    });
    const v1Create = vi.fn();
    const v2Create = vi.fn(async () => ({
      id: "acct_new",
      configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: "pending" } } } } },
    }));
    mocks.getStripeClient.mockReturnValue({ accounts: { create: v1Create }, v2: { core: { accounts: { create: v2Create } } } });

    await ensureConnectAccount("tutor-profile-1");

    expect(v2Create).toHaveBeenCalledTimes(1);
    expect(v1Create).not.toHaveBeenCalled();
  });

  it("K. the payload requests only the recipient configuration (Separate Charges and Transfers) — no card_payments/charge-side capability, no destination-charge-shaped field", async () => {
    mocks.findUniqueOrThrow.mockResolvedValue({
      id: "tutor-profile-1",
      stripeConnectAccountId: null,
      stripeConnectAttemptEpoch: 0,
      user: { email: "tutor@example.com" },
    });
    const create = stubStripeClient(async () => ({
      id: "acct_new",
      configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: "pending" } } } } },
    }));

    await ensureConnectAccount("tutor-profile-1");

    const [params] = create.mock.calls[0] as [Record<string, unknown>, { idempotencyKey: string }];
    const configuration = params.configuration as Record<string, unknown>;
    expect(Object.keys(configuration)).toEqual(["recipient"]);
    expect(configuration).not.toHaveProperty("customer");
    expect(configuration).not.toHaveProperty("merchant");
  });

  it("documents the current single-country product design explicitly: FutureTutor operates in Canada only today, so identity.country is always CA — not left implicit", async () => {
    mocks.findUniqueOrThrow.mockResolvedValue({
      id: "tutor-profile-1",
      stripeConnectAccountId: null,
      stripeConnectAttemptEpoch: 0,
      user: { email: "tutor@example.com" },
    });
    const create = stubStripeClient(async () => ({
      id: "acct_new",
      configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: "pending" } } } } },
    }));

    await ensureConnectAccount("tutor-profile-1");

    const [params] = create.mock.calls[0] as [Record<string, unknown>, { idempotencyKey: string }];
    expect((params.identity as { country: string }).country).toBe("CA");
  });
});
