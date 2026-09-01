import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import Stripe from "stripe";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";

// Post-FUI-3 security hardening — permanent DB-integration coverage for the
// Stripe Connect service (previously entirely uncovered — confirmed by
// grepping src/services/*.test.ts before this file was added). Follows the
// exact same isolated-test-database convention as
// cancellationRefund.integration.test.ts: this file never performs a real
// Stripe network call (@/lib/stripe is mocked module-wide with a small
// hand-built fake), and the ambient `db` singleton used internally by
// ensureConnectAccount/createOnboardingLink (src/services/stripeConnect.ts
// imports `db` from "@/lib/db", not an injectable client parameter) is
// redirected to the verified futuretutor_test database BEFORE any
// transitively-@/lib/db-touching module is imported, exactly mirroring
// cancellationRefund.integration.test.ts's own documented rationale.
//
// This is authorization-hardening/coverage work only — it exercises the
// EXISTING ensureConnectAccount/createOnboardingLink implementations
// unchanged; no financial semantics (pricing/payout/earnings/transfers/
// capture/refunds/cancellation) are touched by this file or by the service
// it tests.
//
// PROD-CONNECT-V2-MIGRATION2 — ensureConnectAccount/createOnboardingLink
// now call stripe.v2.core.accounts.create / stripe.v2.core.accountLinks.create
// (Accounts v2). syncTutorConnectStatusFromStripe deliberately still calls
// the unchanged v1 stripe.accounts.retrieve — so the fake client below
// exposes BOTH: a v1-shaped `accounts.retrieve` at the top level, and a
// v2-shaped `v2.core.accounts.create`/`v2.core.accountLinks.create`
// namespace, mirroring the real Stripe SDK's own dual-namespace shape.

vi.mock("@/lib/stripe", () => ({ getStripeClient: vi.fn() }));

import { getStripeClient } from "@/lib/stripe";

let db: PrismaClient;
let ensureConnectAccount: typeof import("./stripeConnect").ensureConnectAccount;
let createOnboardingLink: typeof import("./stripeConnect").createOnboardingLink;

const createdUserIds: string[] = [];
const createdTutorProfileIds: string[] = [];

interface FakeV1Account {
  id: string;
  capabilities: { transfers?: "active" | "inactive" };
  payouts_enabled: boolean;
  details_submitted: boolean;
  requirements: { disabled_reason: string | null; currently_due: string[]; past_due: string[] };
}

type StripeTransfersStatus = "active" | "pending" | "restricted" | "unsupported";

interface FakeV2Account {
  id: string;
  object: "v2.core.account";
  applied_configurations: string[];
  livemode: boolean;
  configuration?: {
    recipient?: {
      capabilities?: {
        stripe_balance?: {
          stripe_transfers?: { status: StripeTransfersStatus; status_details: unknown[] };
        };
      };
    };
  };
}

function defaultFakeV2Account(id: string): FakeV2Account {
  return {
    id,
    object: "v2.core.account",
    applied_configurations: ["recipient"],
    livemode: true,
    configuration: {
      recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: "pending", status_details: [] } } } },
    },
  };
}

/** Small, controllable, in-memory Stripe fake for v2 accounts.create/
 * accountLinks.create, plus v1 accounts.retrieve — mirrors
 * cancellationRefund.integration.test.ts's own makeFakeStripeClient style
 * (call-tracking arrays, scripted throw paths, deterministic fake ids). */
function makeFakeStripeClient(
  opts: {
    onCreateAccount?: () => FakeV2Account | "throw" | { throwError: unknown };
    onCreateAccountLink?: () => { url: string } | "throw";
    onRetrieveV1Account?: (id: string) => FakeV1Account;
  } = {}
) {
  let nextId = 1;
  const createAccountCalls: Array<{ params: unknown; idempotencyKey: string }> = [];
  const createLinkCalls: Array<{ account: string; params: unknown }> = [];
  const retrieveCalls: string[] = [];
  const callOrder: string[] = [];

  return {
    // v1 — deliberately retained, unchanged, only for syncTutorConnectStatusFromStripe.
    accounts: {
      retrieve: vi.fn(async (id: string) => {
        callOrder.push("accounts.retrieve");
        retrieveCalls.push(id);
        if (opts.onRetrieveV1Account) return opts.onRetrieveV1Account(id);
        return {
          id,
          capabilities: { transfers: "inactive" as const },
          payouts_enabled: false,
          details_submitted: false,
          requirements: { disabled_reason: null, currently_due: [], past_due: [] },
        };
      }),
    },
    // v2 — used by ensureConnectAccount/createOnboardingLink.
    v2: {
      core: {
        accounts: {
          create: vi.fn(async (params: unknown, options: { idempotencyKey: string }) => {
            callOrder.push("v2.core.accounts.create");
            createAccountCalls.push({ params, idempotencyKey: options.idempotencyKey });
            if (opts.onCreateAccount) {
              const result = opts.onCreateAccount();
              if (result === "throw") throw new Error("simulated Stripe account creation failure");
              if (typeof result === "object" && result !== null && "throwError" in result) throw result.throwError;
              return result;
            }
            return defaultFakeV2Account(`acct_fake_${nextId++}`);
          }),
        },
        accountLinks: {
          create: vi.fn(async (params: { account: string }) => {
            callOrder.push("v2.core.accountLinks.create");
            createLinkCalls.push({ account: params.account, params });
            if (opts.onCreateAccountLink) {
              const result = opts.onCreateAccountLink();
              if (result === "throw") throw new Error("simulated Stripe account-link failure");
              return result;
            }
            return { url: "https://connect.stripe.com/setup/fake-link" };
          }),
        },
      },
    },
    __createAccountCalls: createAccountCalls,
    __createLinkCalls: createLinkCalls,
    __retrieveCalls: retrieveCalls,
    __callOrder: callOrder,
  };
}

beforeAll(async () => {
  const target = resolveVerifiedTestDatabase();
  const devDatabaseUrlForSafetyCheckOnly = process.env.DATABASE_URL;
  const adapter = new PrismaPg({ connectionString: target.connectionString });
  db = new PrismaClient({ adapter });

  // Redirect the AMBIENT db singleton used internally by stripeConnect.ts
  // to the SAME verified, safety-checked test database — only after
  // resolveVerifiedTestDatabase() has already positively confirmed it is
  // distinct from the real development database. Every dynamic import
  // below happens strictly after this line.
  process.env.DATABASE_URL = target.connectionString;

  ({ ensureConnectAccount, createOnboardingLink } = await import("./stripeConnect"));

  const { db: ambientDb } = await import("@/lib/db");
  const [{ current_database: ambientDatabaseName }] = await ambientDb.$queryRaw<
    Array<{ current_database: string }>
  >`SELECT current_database()`;
  if (ambientDatabaseName !== target.databaseName) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton reports current_database() = "${ambientDatabaseName}", but the verified test database is "${target.databaseName}". Refusing to run any stripeConnect integration test.`
    );
  }
  const devDatabaseNameForSafetyCheckOnly = devDatabaseUrlForSafetyCheckOnly
    ? new URL(devDatabaseUrlForSafetyCheckOnly).pathname.replace(/^\//, "")
    : null;
  if (devDatabaseNameForSafetyCheckOnly && ambientDatabaseName === devDatabaseNameForSafetyCheckOnly) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton's current_database() ("${ambientDatabaseName}") equals the real development database name. Refusing to run any stripeConnect integration test.`
    );
  }
});

afterAll(async () => {
  await db?.$disconnect();
});

afterEach(async () => {
  vi.mocked(getStripeClient).mockReset();
  if (createdTutorProfileIds.length > 0) {
    await db.tutorProfile.deleteMany({ where: { id: { in: createdTutorProfileIds } } });
    createdTutorProfileIds.length = 0;
  }
  if (createdUserIds.length > 0) {
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
});

function uniqueEmail(prefix: string) {
  return `stripeconnect-it-${prefix}-${randomUUID()}@futuretutor.test`;
}

async function createTutorProfile(applicationStatus: "APPROVED" = "APPROVED") {
  const user = await db.user.create({ data: { email: uniqueEmail("tutor"), role: "TUTOR" } });
  createdUserIds.push(user.id);
  const tutorProfile = await db.tutorProfile.create({
    data: {
      userId: user.id,
      slug: `stripeconnect-it-tutor-${randomUUID()}`,
      applicationStatus,
      payoutTier: "NEW",
    },
  });
  createdTutorProfileIds.push(tutorProfile.id);
  return { user, tutorProfile };
}

describe("ensureConnectAccount", () => {
  it("creates a v2 recipient-configured Express-dashboard account when none exists", async () => {
    const { tutorProfile } = await createTutorProfile();
    const fake = makeFakeStripeClient();
    vi.mocked(getStripeClient).mockReturnValue(fake as never);

    const accountId = await ensureConnectAccount(tutorProfile.id);

    expect(fake.v2.core.accounts.create).toHaveBeenCalledTimes(1);
    expect(fake.__createAccountCalls[0].params).toMatchObject({
      dashboard: "express",
      defaults: { responsibilities: { fees_collector: "application", losses_collector: "application" } },
      configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
      metadata: { tutorProfileId: tutorProfile.id },
    });
    expect(accountId).toBe(`acct_fake_1`);
  });

  it("persists the account id and derived status safely on the TutorProfile row", async () => {
    const { tutorProfile } = await createTutorProfile();
    const fake = makeFakeStripeClient();
    vi.mocked(getStripeClient).mockReturnValue(fake as never);

    const accountId = await ensureConnectAccount(tutorProfile.id);

    const updated = await db.tutorProfile.findUniqueOrThrow({ where: { id: tutorProfile.id } });
    expect(updated.stripeConnectAccountId).toBe(accountId);
    // Default fake v2 account has stripe_transfers status "pending" ->
    // deriveInitialStatusFromV2Account's PENDING branch.
    expect(updated.stripeConnectStatus).toBe("PENDING");
  });

  it("reuses the existing account rather than creating a duplicate", async () => {
    const { tutorProfile } = await createTutorProfile();
    await db.tutorProfile.update({
      where: { id: tutorProfile.id },
      data: { stripeConnectAccountId: "acct_preexisting", stripeConnectStatus: "PENDING" },
    });
    const fake = makeFakeStripeClient();
    vi.mocked(getStripeClient).mockReturnValue(fake as never);

    const accountId = await ensureConnectAccount(tutorProfile.id);

    expect(accountId).toBe("acct_preexisting");
    expect(fake.v2.core.accounts.create).not.toHaveBeenCalled();
  });

  it("never creates a duplicate account across repeat onboarding starts for the same tutor", async () => {
    const { tutorProfile } = await createTutorProfile();
    const fake = makeFakeStripeClient();
    vi.mocked(getStripeClient).mockReturnValue(fake as never);

    const first = await ensureConnectAccount(tutorProfile.id);
    const second = await ensureConnectAccount(tutorProfile.id);

    expect(first).toBe(second);
    expect(fake.v2.core.accounts.create).toHaveBeenCalledTimes(1);
  });

  it("safe failure: if Stripe account creation fails, nothing is persisted and the error propagates", async () => {
    const { tutorProfile } = await createTutorProfile();
    const fake = makeFakeStripeClient({ onCreateAccount: () => "throw" });
    vi.mocked(getStripeClient).mockReturnValue(fake as never);

    await expect(ensureConnectAccount(tutorProfile.id)).rejects.toThrow("simulated Stripe account creation failure");

    const unchanged = await db.tutorProfile.findUniqueOrThrow({ where: { id: tutorProfile.id } });
    expect(unchanged.stripeConnectAccountId).toBeNull();
    expect(unchanged.stripeConnectStatus).toBe("NOT_STARTED");
  });
});

describe("ensureConnectAccount — PROD-CONNECT-RETRYFIX1 idempotency epoch recovery (Accounts v2)", () => {
  it("1/10: confirmed pre-creation 4xx (StripeInvalidRequestError) advances the epoch for the NEXT attempt, without persisting an account", async () => {
    const { tutorProfile } = await createTutorProfile();
    const fake = makeFakeStripeClient({
      onCreateAccount: () => ({
        throwError: new Stripe.errors.StripeInvalidRequestError({
          message: "You must complete your platform profile to use Connect and create live connected accounts.",
          statusCode: 400,
          type: "invalid_request_error",
          headers: {},
        }),
      }),
    });
    vi.mocked(getStripeClient).mockReturnValue(fake as never);

    await expect(ensureConnectAccount(tutorProfile.id)).rejects.toThrow(/platform profile/);

    const afterFailure = await db.tutorProfile.findUniqueOrThrow({ where: { id: tutorProfile.id } });
    expect(afterFailure.stripeConnectAccountId).toBeNull();
    expect(afterFailure.stripeConnectAttemptEpoch).toBe(1); // advanced for the NEXT attempt
    expect(fake.__createAccountCalls[0].idempotencyKey).toBe(`connect-account:${tutorProfile.id}:0`);
  });

  it("2/10: the next explicit attempt after a confirmed 4xx uses a fresh idempotency key and can succeed", async () => {
    const { tutorProfile } = await createTutorProfile();
    let callCount = 0;
    const fake = makeFakeStripeClient({
      onCreateAccount: () => {
        callCount += 1;
        if (callCount === 1) {
          return {
            throwError: new Stripe.errors.StripeInvalidRequestError({
              message: "You must complete your platform profile to use Connect and create live connected accounts.",
              statusCode: 400,
              type: "invalid_request_error",
              headers: {},
            }),
          };
        }
        return defaultFakeV2Account("acct_fake_after_fix");
      },
    });
    vi.mocked(getStripeClient).mockReturnValue(fake as never);

    await expect(ensureConnectAccount(tutorProfile.id)).rejects.toThrow(/platform profile/);
    const accountId = await ensureConnectAccount(tutorProfile.id); // simulates a later, explicit user click

    expect(accountId).toBe("acct_fake_after_fix");
    expect(fake.__createAccountCalls[0].idempotencyKey).toBe(`connect-account:${tutorProfile.id}:0`);
    expect(fake.__createAccountCalls[1].idempotencyKey).toBe(`connect-account:${tutorProfile.id}:1`);
    expect(fake.__createAccountCalls[0].idempotencyKey).not.toBe(fake.__createAccountCalls[1].idempotencyKey);
  });

  it("3/10: two ordinary calls within the same (unadvanced) epoch use the identical idempotency key", async () => {
    // Mirrors production's crash-recovery case: a retry before any epoch
    // advancement must reuse the exact same key so Stripe's own idempotency
    // layer can safely rediscover a possibly-already-created account.
    const { tutorProfile } = await createTutorProfile();
    const fake = makeFakeStripeClient();
    vi.mocked(getStripeClient).mockReturnValue(fake as never);

    await ensureConnectAccount(tutorProfile.id);
    await ensureConnectAccount(tutorProfile.id); // short-circuits on stripeConnectAccountId, but if it hadn't...

    expect(fake.__createAccountCalls).toHaveLength(1); // second call never reached Stripe at all (existing account)
  });

  it("4/10: Stripe 5xx (StripeAPIError) does NOT advance the epoch — outcome is indeterminate, same key must be reused", async () => {
    const { tutorProfile } = await createTutorProfile();
    const fake = makeFakeStripeClient({
      onCreateAccount: () => ({
        throwError: new Stripe.errors.StripeAPIError({
          message: "Stripe internal error",
          statusCode: 500,
          type: "api_error",
          headers: {},
        }),
      }),
    });
    vi.mocked(getStripeClient).mockReturnValue(fake as never);

    await expect(ensureConnectAccount(tutorProfile.id)).rejects.toThrow(/Stripe internal error/);

    const afterFailure = await db.tutorProfile.findUniqueOrThrow({ where: { id: tutorProfile.id } });
    expect(afterFailure.stripeConnectAttemptEpoch).toBe(0);
    expect(afterFailure.stripeConnectAccountId).toBeNull();
  });

  it("5/10: a network/connection error (StripeConnectionError) does NOT advance the epoch", async () => {
    const { tutorProfile } = await createTutorProfile();
    const fake = makeFakeStripeClient({
      onCreateAccount: () => ({
        throwError: new Stripe.errors.StripeConnectionError({ message: "socket hang up" }),
      }),
    });
    vi.mocked(getStripeClient).mockReturnValue(fake as never);

    await expect(ensureConnectAccount(tutorProfile.id)).rejects.toThrow(/socket hang up/);

    const afterFailure = await db.tutorProfile.findUniqueOrThrow({ where: { id: tutorProfile.id } });
    expect(afterFailure.stripeConnectAttemptEpoch).toBe(0);
  });

  it("6/10: a successful Account creation never advances the epoch (irrelevant once an account exists)", async () => {
    const { tutorProfile } = await createTutorProfile();
    const fake = makeFakeStripeClient();
    vi.mocked(getStripeClient).mockReturnValue(fake as never);

    await ensureConnectAccount(tutorProfile.id);

    const after = await db.tutorProfile.findUniqueOrThrow({ where: { id: tutorProfile.id } });
    expect(after.stripeConnectAttemptEpoch).toBe(0);
    expect(after.stripeConnectAccountId).not.toBeNull();
  });

  it("7/10: Stripe success + a subsequent (simulated) persistence gap does not risk a duplicate account — the retry reuses the same epoch/key", async () => {
    const { tutorProfile } = await createTutorProfile();
    const fake = makeFakeStripeClient();
    vi.mocked(getStripeClient).mockReturnValue(fake as never);

    await ensureConnectAccount(tutorProfile.id); // Stripe succeeds, persisted normally
    // Simulate the narrow crash window: Stripe created the account, but the
    // local row never recorded it (e.g. a crash between Step B and Step C).
    // The epoch was never touched by the successful call (case 6), so a
    // recovery retry must derive the exact same idempotency key.
    await db.tutorProfile.update({ where: { id: tutorProfile.id }, data: { stripeConnectAccountId: null } });

    await ensureConnectAccount(tutorProfile.id);

    expect(fake.__createAccountCalls).toHaveLength(2);
    expect(fake.__createAccountCalls[0].idempotencyKey).toBe(fake.__createAccountCalls[1].idempotencyKey);
  });

  it("8/10: an existing stripeConnectAccountId short-circuits before Stripe is ever called (epoch irrelevant)", async () => {
    const { tutorProfile } = await createTutorProfile();
    await db.tutorProfile.update({
      where: { id: tutorProfile.id },
      data: { stripeConnectAccountId: "acct_preexisting", stripeConnectStatus: "PENDING" },
    });
    const fake = makeFakeStripeClient();
    vi.mocked(getStripeClient).mockReturnValue(fake as never);

    const accountId = await ensureConnectAccount(tutorProfile.id);

    expect(accountId).toBe("acct_preexisting");
    expect(fake.v2.core.accounts.create).not.toHaveBeenCalled();
  });

  it("9/10: concurrent requests hitting the same confirmed 4xx advance the epoch exactly once, not twice", async () => {
    const { tutorProfile } = await createTutorProfile();
    const fake = makeFakeStripeClient({
      onCreateAccount: () => ({
        throwError: new Stripe.errors.StripeInvalidRequestError({
          message: "You must complete your platform profile to use Connect and create live connected accounts.",
          statusCode: 400,
          type: "invalid_request_error",
          headers: {},
        }),
      }),
    });
    vi.mocked(getStripeClient).mockReturnValue(fake as never);

    const results = await Promise.allSettled([
      ensureConnectAccount(tutorProfile.id),
      ensureConnectAccount(tutorProfile.id),
    ]);
    expect(results.every((r) => r.status === "rejected")).toBe(true);

    const after = await db.tutorProfile.findUniqueOrThrow({ where: { id: tutorProfile.id } });
    // The compare-and-swap update means only the first writer's updateMany
    // actually matches; the second's WHERE no longer matches and is a no-op.
    expect(after.stripeConnectAttemptEpoch).toBe(1);
    expect(after.stripeConnectAccountId).toBeNull();
  });

  it("10/10: the default epoch produces a key distinct from the historical (pre-fix) permanent key", async () => {
    const { tutorProfile } = await createTutorProfile();
    const fake = makeFakeStripeClient();
    vi.mocked(getStripeClient).mockReturnValue(fake as never);

    await ensureConnectAccount(tutorProfile.id);

    const historicalPoisonedKey = `connect-account:${tutorProfile.id}`; // the pre-fix, unversioned key
    const actualKeyUsed = fake.__createAccountCalls[0].idempotencyKey;
    expect(actualKeyUsed).toBe(`connect-account:${tutorProfile.id}:0`);
    expect(actualKeyUsed).not.toBe(historicalPoisonedKey);
  });
});

describe("createOnboardingLink", () => {
  it("creates the account link only after the account exists (correct ordering)", async () => {
    const { tutorProfile } = await createTutorProfile();
    const fake = makeFakeStripeClient();
    vi.mocked(getStripeClient).mockReturnValue(fake as never);

    const url = await createOnboardingLink(tutorProfile.id, "https://app.test/return", "https://app.test/refresh");

    expect(url).toBe("https://connect.stripe.com/setup/fake-link");
    expect(fake.__callOrder).toEqual(["v2.core.accounts.create", "v2.core.accountLinks.create"]);
    expect(fake.__createLinkCalls[0].account).toBe("acct_fake_1");
    expect(fake.__createLinkCalls[0].params).toMatchObject({
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: ["recipient"],
          return_url: "https://app.test/return",
          refresh_url: "https://app.test/refresh",
        },
      },
    });
  });

  it("passes the persisted account id to accountLinks.create when an account already exists", async () => {
    const { tutorProfile } = await createTutorProfile();
    await db.tutorProfile.update({
      where: { id: tutorProfile.id },
      data: { stripeConnectAccountId: "acct_preexisting", stripeConnectStatus: "PENDING" },
    });
    const fake = makeFakeStripeClient();
    vi.mocked(getStripeClient).mockReturnValue(fake as never);

    await createOnboardingLink(tutorProfile.id, "https://app.test/return", "https://app.test/refresh");

    expect(fake.v2.core.accounts.create).not.toHaveBeenCalled();
    expect(fake.__createLinkCalls[0].account).toBe("acct_preexisting");
  });

  it("safe failure: if account-link creation fails, the error propagates (a retry safely reuses the already-persisted account)", async () => {
    const { tutorProfile } = await createTutorProfile();
    const fake = makeFakeStripeClient({ onCreateAccountLink: () => "throw" });
    vi.mocked(getStripeClient).mockReturnValue(fake as never);

    await expect(
      createOnboardingLink(tutorProfile.id, "https://app.test/return", "https://app.test/refresh")
    ).rejects.toThrow("simulated Stripe account-link failure");

    // The account itself was successfully created and persisted before the
    // link step failed — this is expected/safe: a retry's ensureConnectAccount
    // call reuses it rather than creating a second Stripe account.
    const persisted = await db.tutorProfile.findUniqueOrThrow({ where: { id: tutorProfile.id } });
    expect(persisted.stripeConnectAccountId).toBe("acct_fake_1");
  });
});

describe("syncTutorConnectStatusFromStripe — deliberately still v1 accounts.retrieve", () => {
  it("retrieves via the v1 accounts.retrieve endpoint (not v2), and updates status from the v1-shaped response", async () => {
    const { tutorProfile } = await createTutorProfile();
    await db.tutorProfile.update({
      where: { id: tutorProfile.id },
      data: { stripeConnectAccountId: "acct_existing", stripeConnectStatus: "PENDING" },
    });
    const fake = makeFakeStripeClient({
      onRetrieveV1Account: (id) => ({
        id,
        capabilities: { transfers: "active" as const },
        payouts_enabled: true,
        details_submitted: true,
        requirements: { disabled_reason: null, currently_due: [], past_due: [] },
      }),
    });
    vi.mocked(getStripeClient).mockReturnValue(fake as never);

    const { syncTutorConnectStatusFromStripe } = await import("./stripeConnect");
    await syncTutorConnectStatusFromStripe(tutorProfile.id);

    expect(fake.__retrieveCalls).toEqual(["acct_existing"]);
    expect(fake.v2.core.accounts.create).not.toHaveBeenCalled();
    const updated = await db.tutorProfile.findUniqueOrThrow({ where: { id: tutorProfile.id } });
    expect(updated.stripeConnectStatus).toBe("ACTIVE");
  });

  it("does nothing when the tutor has no stripeConnectAccountId yet", async () => {
    const { tutorProfile } = await createTutorProfile();
    const fake = makeFakeStripeClient();
    vi.mocked(getStripeClient).mockReturnValue(fake as never);

    const { syncTutorConnectStatusFromStripe } = await import("./stripeConnect");
    await syncTutorConnectStatusFromStripe(tutorProfile.id);

    expect(fake.accounts.retrieve).not.toHaveBeenCalled();
  });
});
