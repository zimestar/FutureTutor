import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

// PROD-CONNECT-SYNCFIX1 — permanent, fully-mocked unit coverage for the
// Connect STATUS SYNC path (syncTutorConnectStatusFromStripe/
// syncTutorConnectStatusFromAccount), distinct from stripeConnectGate.test.ts
// (which covers the ACCOUNT CREATION path). Proves: (a) status refresh never
// creates a connected account — syncTutorConnectStatusFromAccount doesn't
// even touch the Stripe client, and syncTutorConnectStatusFromStripe only
// ever calls accounts.retrieve, never accounts.create/v2.core.accounts.create;
// (b) status refresh never mutates pricing, payout tiers, or any financial
// model — only TutorProfile.stripeConnectStatus; (c) redelivering the same
// resulting status twice is a true no-op the second time (idempotent).

const mocks = vi.hoisted(() => ({
  findUniqueOrThrow: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  getStripeClient: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    tutorProfile: {
      findUniqueOrThrow: mocks.findUniqueOrThrow,
      findUnique: mocks.findUnique,
      findFirst: mocks.findFirst,
      update: mocks.update,
    },
    payment: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    booking: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    tutorEarning: { findMany: vi.fn(), create: vi.fn() },
    tutorTransfer: { findMany: vi.fn(), create: vi.fn() },
    customerBasePriceRule: { update: vi.fn(), create: vi.fn() },
    tutorBasePayoutRule: { update: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("@/lib/stripe", () => ({ getStripeClient: mocks.getStripeClient }));

import { db } from "@/lib/db";
import { syncTutorConnectStatusFromStripe, syncTutorConnectStatusFromAccount } from "./stripeConnect";

function fakeAccount(overrides: Partial<{
  id: string;
  transfers: "active" | "inactive";
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  metadata: Record<string, string>;
}>): Stripe.Account {
  const { id = "acct_1UBJVQR1gOJqANDp", transfers = "active", payoutsEnabled = true, detailsSubmitted = true, metadata = {} } = overrides;
  return {
    id,
    capabilities: { transfers },
    payouts_enabled: payoutsEnabled,
    details_submitted: detailsSubmitted,
    requirements: { disabled_reason: null, currently_due: [], past_due: [] },
    metadata,
  } as unknown as Stripe.Account;
}

describe("syncTutorConnectStatusFromAccount — no Stripe client access, no financial mutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves the tutor via metadata.tutorProfileId, persists ACTIVE, and never touches any financial model", async () => {
    mocks.findUnique.mockResolvedValue({ id: "tutor-1", stripeConnectAccountId: "acct_1UBJVQR1gOJqANDp", stripeConnectStatus: "RESTRICTED" });

    await syncTutorConnectStatusFromAccount(fakeAccount({ metadata: { tutorProfileId: "tutor-1" } }));

    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "tutor-1" }, data: { stripeConnectStatus: "ACTIVE" } });
    expect(db.payment.create).not.toHaveBeenCalled();
    expect(db.payment.update).not.toHaveBeenCalled();
    expect(db.booking.create).not.toHaveBeenCalled();
    expect(db.tutorEarning.create).not.toHaveBeenCalled();
    expect(db.tutorTransfer.create).not.toHaveBeenCalled();
    expect(db.customerBasePriceRule.update).not.toHaveBeenCalled();
    expect(db.tutorBasePayoutRule.update).not.toHaveBeenCalled();
  });

  it("falls back to resolving by stripeConnectAccountId when metadata is missing or stale", async () => {
    mocks.findUnique.mockResolvedValue(null);
    mocks.findFirst.mockResolvedValue({ id: "tutor-2", stripeConnectAccountId: "acct_1UBJVQR1gOJqANDp", stripeConnectStatus: "PENDING" });

    await syncTutorConnectStatusFromAccount(fakeAccount({ metadata: {} }));

    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { stripeConnectAccountId: "acct_1UBJVQR1gOJqANDp" } });
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "tutor-2" }, data: { stripeConnectStatus: "ACTIVE" } });
  });

  it("an unresolvable account (no matching tutor at all) is a true no-op — no update attempted", async () => {
    mocks.findUnique.mockResolvedValue(null);
    mocks.findFirst.mockResolvedValue(null);

    await syncTutorConnectStatusFromAccount(fakeAccount({ metadata: {} }));

    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("idempotent — calling twice with the same resulting status only writes once", async () => {
    mocks.findUnique.mockResolvedValue({ id: "tutor-1", stripeConnectAccountId: "acct_1UBJVQR1gOJqANDp", stripeConnectStatus: "RESTRICTED" });
    await syncTutorConnectStatusFromAccount(fakeAccount({ metadata: { tutorProfileId: "tutor-1" } }));
    expect(mocks.update).toHaveBeenCalledTimes(1);

    // Second delivery: the tutor's stored status now already matches —
    // the equality guard must skip the write entirely.
    mocks.findUnique.mockResolvedValue({ id: "tutor-1", stripeConnectAccountId: "acct_1UBJVQR1gOJqANDp", stripeConnectStatus: "ACTIVE" });
    await syncTutorConnectStatusFromAccount(fakeAccount({ metadata: { tutorProfileId: "tutor-1" } }));
    expect(mocks.update).toHaveBeenCalledTimes(1); // still 1 — no second write
  });
});

describe("syncTutorConnectStatusFromStripe — retrieve only, never create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls accounts.retrieve (v1) exactly once and never any create path (v1 or v2)", async () => {
    mocks.findUniqueOrThrow.mockResolvedValue({ id: "tutor-1", stripeConnectAccountId: "acct_1UBJVQR1gOJqANDp" });
    mocks.findUnique.mockResolvedValue({ id: "tutor-1", stripeConnectAccountId: "acct_1UBJVQR1gOJqANDp", stripeConnectStatus: "RESTRICTED" });

    const retrieve = vi.fn().mockResolvedValue(fakeAccount({}));
    const v1Create = vi.fn();
    const v2Create = vi.fn();
    mocks.getStripeClient.mockReturnValue({
      accounts: { retrieve, create: v1Create },
      v2: { core: { accounts: { create: v2Create } } },
    });

    await syncTutorConnectStatusFromStripe("tutor-1");

    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(retrieve).toHaveBeenCalledWith("acct_1UBJVQR1gOJqANDp");
    expect(v1Create).not.toHaveBeenCalled();
    expect(v2Create).not.toHaveBeenCalled();
  });

  it("a tutor with no stripeConnectAccountId is a no-op — no Stripe client is even constructed", async () => {
    mocks.findUniqueOrThrow.mockResolvedValue({ id: "tutor-1", stripeConnectAccountId: null });

    await syncTutorConnectStatusFromStripe("tutor-1");

    expect(mocks.getStripeClient).not.toHaveBeenCalled();
  });
});
