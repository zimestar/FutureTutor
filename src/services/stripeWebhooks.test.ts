import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

// PROD-CONNECT-SYNCFIX1 — permanent unit coverage for processStripeWebhookEvent's
// idempotency guarantee (no prior test file existed for this service) and for
// the account.updated dispatch specifically, since that's the exact event
// this mission's investigation centered on. Payment/refund/dispute business
// logic is mocked as no-ops — this file proves the CLAIM/dispatch machinery,
// not any individual event handler's business logic (already covered
// elsewhere for the payment paths).

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  syncTutorConnectStatusFromAccount: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    stripeWebhookEvent: {
      findUnique: mocks.findUnique,
      create: mocks.create,
      updateMany: mocks.updateMany,
    },
  },
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn() }));
vi.mock("@/services/payments", () => ({
  resolvePaymentFromStripePaymentIntent: vi.fn(),
  resolveCaptureOutcomeAndConverge: vi.fn(),
  convergeToCaptureFailed: vi.fn(),
  recordPaymentAttemptBestEffort: vi.fn(),
  reconcileStripeFinancialDetails: vi.fn(),
  resolveRefundOutcomeAndConverge: vi.fn(),
}));
vi.mock("@/services/stripeConnect", () => ({
  syncTutorConnectStatusFromAccount: mocks.syncTutorConnectStatusFromAccount,
}));

import { processStripeWebhookEvent } from "./stripeWebhooks";

function accountUpdatedEvent(id: string): Stripe.Event {
  return {
    id,
    type: "account.updated",
    data: { object: { id: "acct_1UBJVQR1gOJqANDp", object: "account" } },
  } as unknown as Stripe.Event;
}

describe("processStripeWebhookEvent — idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("a new event is claimed, business logic runs exactly once, and the row is marked PROCESSED", async () => {
    mocks.findUnique.mockResolvedValueOnce(null); // not seen before
    mocks.create.mockResolvedValue({ id: "row-1", processingStatus: "RECEIVED" });
    mocks.updateMany.mockResolvedValueOnce({ count: 1 }); // claim succeeds
    mocks.updateMany.mockResolvedValueOnce({ count: 1 }); // -> PROCESSED

    await processStripeWebhookEvent(accountUpdatedEvent("evt_new_1"));

    expect(mocks.syncTutorConnectStatusFromAccount).toHaveBeenCalledTimes(1);
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ processingStatus: "PROCESSED" }) })
    );
  });

  it("redelivering an already-PROCESSED event is a true no-op — business logic is never invoked a second time", async () => {
    mocks.findUnique.mockResolvedValueOnce({ id: "row-1", processingStatus: "PROCESSED" });

    await processStripeWebhookEvent(accountUpdatedEvent("evt_dup_1"));

    expect(mocks.syncTutorConnectStatusFromAccount).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("a concurrent delivery that loses the claim race does not run business logic", async () => {
    mocks.findUnique.mockResolvedValueOnce({ id: "row-1", processingStatus: "RECEIVED" });
    mocks.updateMany.mockResolvedValueOnce({ count: 0 }); // another delivery already claimed it

    await processStripeWebhookEvent(accountUpdatedEvent("evt_race_1"));

    expect(mocks.syncTutorConnectStatusFromAccount).not.toHaveBeenCalled();
  });

  it("account.updated correctly dispatches the raw event payload to syncTutorConnectStatusFromAccount", async () => {
    mocks.findUnique.mockResolvedValueOnce(null);
    mocks.create.mockResolvedValue({ id: "row-2", processingStatus: "RECEIVED" });
    mocks.updateMany.mockResolvedValueOnce({ count: 1 });
    mocks.updateMany.mockResolvedValueOnce({ count: 1 });

    const event = accountUpdatedEvent("evt_dispatch_1");
    await processStripeWebhookEvent(event);

    expect(mocks.syncTutorConnectStatusFromAccount).toHaveBeenCalledWith(event.data.object);
  });

  it("a failed business-logic run marks the row FAILED (retryable), not PROCESSED", async () => {
    mocks.findUnique.mockResolvedValueOnce(null);
    mocks.create.mockResolvedValue({ id: "row-3", processingStatus: "RECEIVED" });
    mocks.updateMany.mockResolvedValueOnce({ count: 1 }); // claim succeeds
    mocks.syncTutorConnectStatusFromAccount.mockRejectedValueOnce(new Error("transient DB error"));

    await expect(processStripeWebhookEvent(accountUpdatedEvent("evt_fail_1"))).rejects.toThrow("transient DB error");

    expect(mocks.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ processingStatus: "FAILED" }) })
    );
  });
});
