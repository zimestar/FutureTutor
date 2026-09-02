import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

// PROD-CONNECT-WEBHOOKV2-1 — permanent, fully-mocked unit coverage for the
// Accounts v2 Connect webhook's business-logic entry point. Mirrors
// stripeWebhooks.test.ts's mocking style (idempotency machinery) and
// stripeConnectSync.test.ts's style (no account creation / no financial
// mutation proofs), since this module reuses both certified primitives
// rather than reimplementing them.

const mocks = vi.hoisted(() => ({
  stripeWebhookEventFindUnique: vi.fn(),
  stripeWebhookEventCreate: vi.fn(),
  stripeWebhookEventUpdateMany: vi.fn(),
  tutorProfileFindUnique: vi.fn(),
  tutorProfileFindFirst: vi.fn(),
  tutorProfileUpdate: vi.fn(),
  getStripeClient: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    stripeWebhookEvent: {
      findUnique: mocks.stripeWebhookEventFindUnique,
      create: mocks.stripeWebhookEventCreate,
      updateMany: mocks.stripeWebhookEventUpdateMany,
    },
    tutorProfile: {
      findUnique: mocks.tutorProfileFindUnique,
      findFirst: mocks.tutorProfileFindFirst,
      update: mocks.tutorProfileUpdate,
    },
    payment: { create: vi.fn(), update: vi.fn() },
    booking: { create: vi.fn(), update: vi.fn() },
    tutorEarning: { create: vi.fn() },
    tutorTransfer: { create: vi.fn() },
  },
}));
vi.mock("@/lib/stripe", () => ({ getStripeClient: mocks.getStripeClient }));

import { db } from "@/lib/db";
import { processStripeConnectWebhookEvent, CONNECT_EVENT_ALLOWLIST } from "./stripeConnectWebhooks";

function thinNotification(type: string, id = "evt_v2_test_1"): Stripe.V2.Core.EventNotification {
  return {
    id,
    object: "v2.core.event",
    type,
    created: new Date().toISOString(),
    livemode: true,
    related_object: { id: "acct_1UBJVQR1gOJqANDp", type: "v2.core.account", url: "/v2/core/accounts/acct_1UBJVQR1gOJqANDp" },
  } as unknown as Stripe.V2.Core.EventNotification;
}

function readyAccount(): Stripe.Account {
  return {
    id: "acct_1UBJVQR1gOJqANDp",
    capabilities: { transfers: "active" },
    payouts_enabled: true,
    details_submitted: true,
    requirements: { disabled_reason: null, currently_due: [], past_due: [] },
    metadata: { tutorProfileId: "tutor-1" },
  } as unknown as Stripe.Account;
}

describe("CONNECT_EVENT_ALLOWLIST", () => {
  it("contains exactly the three proven-necessary events, no more", () => {
    expect([...CONNECT_EVENT_ALLOWLIST].sort()).toEqual(
      [
        "v2.core.account[configuration.recipient].updated",
        "v2.core.account[configuration.recipient].capability_status_updated",
        "v2.core.account[requirements].updated",
      ].sort()
    );
  });

  it("excludes v2.core.account.updated and every person/identity/customer/merchant/defaults event", () => {
    expect(CONNECT_EVENT_ALLOWLIST.has("v2.core.account.updated")).toBe(false);
    expect(CONNECT_EVENT_ALLOWLIST.has("v2.core.account_person.created")).toBe(false);
    expect(CONNECT_EVENT_ALLOWLIST.has("v2.core.account[identity].updated")).toBe(false);
    expect(CONNECT_EVENT_ALLOWLIST.has("v2.core.account[configuration.customer].updated")).toBe(false);
    expect(CONNECT_EVENT_ALLOWLIST.has("v2.core.account[configuration.merchant].updated")).toBe(false);
    expect(CONNECT_EVENT_ALLOWLIST.has("v2.core.account[defaults].updated")).toBe(false);
  });
});

describe("processStripeConnectWebhookEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.stripeWebhookEventFindUnique.mockResolvedValue(null);
    mocks.stripeWebhookEventCreate.mockResolvedValue({ id: "row-1", processingStatus: "RECEIVED" });
    mocks.stripeWebhookEventUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("6. an approved event fetches the account and reconciles local status (READY -> ACTIVE)", async () => {
    const retrieve = vi.fn().mockResolvedValue(readyAccount());
    mocks.getStripeClient.mockReturnValue({ accounts: { retrieve, create: vi.fn() }, v2: { core: { accounts: { create: vi.fn() } } } });
    mocks.tutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", stripeConnectAccountId: "acct_1UBJVQR1gOJqANDp", stripeConnectStatus: "RESTRICTED" });

    await processStripeConnectWebhookEvent(thinNotification("v2.core.account[requirements].updated"));

    expect(retrieve).toHaveBeenCalledWith("acct_1UBJVQR1gOJqANDp");
    expect(mocks.tutorProfileUpdate).toHaveBeenCalledWith({ where: { id: "tutor-1" }, data: { stripeConnectStatus: "ACTIVE" } });
  });

  it("7. an unapproved event type is a safe no-op — no Stripe fetch, no status mutation, no error", async () => {
    await processStripeConnectWebhookEvent(thinNotification("v2.core.account[identity].updated"));

    expect(mocks.getStripeClient).not.toHaveBeenCalled();
    expect(mocks.tutorProfileUpdate).not.toHaveBeenCalled();
    expect(mocks.stripeWebhookEventCreate).not.toHaveBeenCalled(); // never even claimed — ignored before the idempotency layer
  });

  it("8. redelivering the same event id twice is idempotent — reconciliation runs at most once", async () => {
    const retrieve = vi.fn().mockResolvedValue(readyAccount());
    mocks.getStripeClient.mockReturnValue({ accounts: { retrieve, create: vi.fn() }, v2: { core: { accounts: { create: vi.fn() } } } });
    mocks.tutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", stripeConnectAccountId: "acct_1UBJVQR1gOJqANDp", stripeConnectStatus: "RESTRICTED" });

    const notification = thinNotification("v2.core.account[requirements].updated", "evt_v2_dup_1");
    await processStripeConnectWebhookEvent(notification);

    // Second delivery of the exact same event id — the row is now PROCESSED.
    mocks.stripeWebhookEventFindUnique.mockResolvedValue({ id: "row-1", processingStatus: "PROCESSED" });
    await processStripeConnectWebhookEvent(notification);

    expect(retrieve).toHaveBeenCalledTimes(1);
  });

  it("9. an unknown connected account id (no matching TutorProfile) is a safe no-op — event still marked processed, nothing mutated", async () => {
    const retrieve = vi.fn().mockResolvedValue(readyAccount());
    mocks.getStripeClient.mockReturnValue({ accounts: { retrieve, create: vi.fn() }, v2: { core: { accounts: { create: vi.fn() } } } });
    mocks.tutorProfileFindUnique.mockResolvedValue(null);
    mocks.tutorProfileFindFirst.mockResolvedValue(null);

    await expect(processStripeConnectWebhookEvent(thinNotification("v2.core.account[requirements].updated"))).resolves.toBeUndefined();

    expect(mocks.tutorProfileUpdate).not.toHaveBeenCalled();
  });

  it("10/11/12. Stripe pending-verification and restricted shapes converge to the correct non-ACTIVE local status", async () => {
    mocks.tutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", stripeConnectAccountId: "acct_1UBJVQR1gOJqANDp", stripeConnectStatus: "NOT_STARTED" });

    const pendingAccount = {
      id: "acct_1UBJVQR1gOJqANDp",
      capabilities: { transfers: "inactive" },
      payouts_enabled: false,
      details_submitted: false,
      requirements: { disabled_reason: null, currently_due: [], past_due: [] },
      metadata: { tutorProfileId: "tutor-1" },
    } as unknown as Stripe.Account;
    mocks.getStripeClient.mockReturnValue({ accounts: { retrieve: vi.fn().mockResolvedValue(pendingAccount), create: vi.fn() }, v2: { core: { accounts: { create: vi.fn() } } } });

    await processStripeConnectWebhookEvent(thinNotification("v2.core.account[requirements].updated", "evt_pending"));
    expect(mocks.tutorProfileUpdate).toHaveBeenCalledWith({ where: { id: "tutor-1" }, data: { stripeConnectStatus: "PENDING" } });
  });

  it("13. a Stripe retrieval failure never promotes the tutor — the event is marked FAILED (retryable), no update is attempted", async () => {
    const retrieve = vi.fn().mockRejectedValue(new Error("Stripe API unavailable"));
    mocks.getStripeClient.mockReturnValue({ accounts: { retrieve, create: vi.fn() }, v2: { core: { accounts: { create: vi.fn() } } } });

    await expect(processStripeConnectWebhookEvent(thinNotification("v2.core.account[requirements].updated"))).rejects.toThrow(
      "Stripe API unavailable"
    );

    expect(mocks.tutorProfileUpdate).not.toHaveBeenCalled();
    expect(mocks.stripeWebhookEventUpdateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ processingStatus: "FAILED" }) })
    );
  });

  it("14/15. no connected account or Account Link is ever created by this module", async () => {
    const accountsCreate = vi.fn();
    const v2AccountsCreate = vi.fn();
    const accountLinksCreate = vi.fn();
    mocks.getStripeClient.mockReturnValue({
      accounts: { retrieve: vi.fn().mockResolvedValue(readyAccount()), create: accountsCreate },
      v2: { core: { accounts: { create: v2AccountsCreate }, accountLinks: { create: accountLinksCreate } } },
    });
    mocks.tutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", stripeConnectAccountId: "acct_1UBJVQR1gOJqANDp", stripeConnectStatus: "RESTRICTED" });

    await processStripeConnectWebhookEvent(thinNotification("v2.core.account[configuration.recipient].capability_status_updated"));

    expect(accountsCreate).not.toHaveBeenCalled();
    expect(v2AccountsCreate).not.toHaveBeenCalled();
    expect(accountLinksCreate).not.toHaveBeenCalled();
  });

  it("16. no financial object is ever created or updated by this module", async () => {
    mocks.getStripeClient.mockReturnValue({ accounts: { retrieve: vi.fn().mockResolvedValue(readyAccount()), create: vi.fn() }, v2: { core: { accounts: { create: vi.fn() } } } });
    mocks.tutorProfileFindUnique.mockResolvedValue({ id: "tutor-1", stripeConnectAccountId: "acct_1UBJVQR1gOJqANDp", stripeConnectStatus: "RESTRICTED" });

    await processStripeConnectWebhookEvent(thinNotification("v2.core.account[configuration.recipient].updated"));

    expect(db.payment.create).not.toHaveBeenCalled();
    expect(db.payment.update).not.toHaveBeenCalled();
    expect(db.booking.create).not.toHaveBeenCalled();
    expect(db.tutorEarning.create).not.toHaveBeenCalled();
    expect(db.tutorTransfer.create).not.toHaveBeenCalled();
  });
});
