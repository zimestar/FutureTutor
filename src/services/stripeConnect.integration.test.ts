import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
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

vi.mock("@/lib/stripe", () => ({ getStripeClient: vi.fn() }));

import { getStripeClient } from "@/lib/stripe";

let db: PrismaClient;
let ensureConnectAccount: typeof import("./stripeConnect").ensureConnectAccount;
let createOnboardingLink: typeof import("./stripeConnect").createOnboardingLink;

const createdUserIds: string[] = [];
const createdTutorProfileIds: string[] = [];

interface FakeStripeAccount {
  id: string;
  capabilities: { transfers?: "active" | "inactive" };
  payouts_enabled: boolean;
  details_submitted: boolean;
  requirements: { disabled_reason: string | null; currently_due: string[]; past_due: string[] };
}

/** Small, controllable, in-memory Stripe fake for accounts.create/retrieve
 * and accountLinks.create — mirrors cancellationRefund.integration.test.ts's
 * own makeFakeStripeClient style (call-tracking arrays, scripted throw
 * paths, deterministic fake ids). */
function makeFakeStripeClient(
  opts: {
    onCreateAccount?: () => FakeStripeAccount | "throw";
    onCreateAccountLink?: () => { url: string } | "throw";
  } = {}
) {
  let nextId = 1;
  const createAccountCalls: Array<{ params: unknown; idempotencyKey: string }> = [];
  const createLinkCalls: Array<{ account: string }> = [];
  const callOrder: string[] = [];

  return {
    accounts: {
      create: vi.fn(async (params: unknown, options: { idempotencyKey: string }) => {
        callOrder.push("accounts.create");
        createAccountCalls.push({ params, idempotencyKey: options.idempotencyKey });
        if (opts.onCreateAccount) {
          const result = opts.onCreateAccount();
          if (result === "throw") throw new Error("simulated Stripe account creation failure");
          return result;
        }
        return {
          id: `acct_fake_${nextId++}`,
          capabilities: { transfers: "inactive" as const },
          payouts_enabled: false,
          details_submitted: false,
          requirements: { disabled_reason: null, currently_due: [], past_due: [] },
        };
      }),
      retrieve: vi.fn(async (id: string) => ({
        id,
        capabilities: { transfers: "inactive" as const },
        payouts_enabled: false,
        details_submitted: false,
        requirements: { disabled_reason: null, currently_due: [], past_due: [] },
      })),
    },
    accountLinks: {
      create: vi.fn(async (params: { account: string }) => {
        callOrder.push("accountLinks.create");
        createLinkCalls.push(params);
        if (opts.onCreateAccountLink) {
          const result = opts.onCreateAccountLink();
          if (result === "throw") throw new Error("simulated Stripe account-link failure");
          return result;
        }
        return { url: "https://connect.stripe.com/setup/fake-link" };
      }),
    },
    __createAccountCalls: createAccountCalls,
    __createLinkCalls: createLinkCalls,
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
  it("creates an Express connected account when none exists", async () => {
    const { tutorProfile } = await createTutorProfile();
    const fake = makeFakeStripeClient();
    vi.mocked(getStripeClient).mockReturnValue(fake as never);

    const accountId = await ensureConnectAccount(tutorProfile.id);

    expect(fake.accounts.create).toHaveBeenCalledTimes(1);
    expect(fake.__createAccountCalls[0].params).toMatchObject({
      type: "express",
      capabilities: { transfers: { requested: true } },
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
    // Fake account has no active transfers/payouts and no outstanding
    // requirements/details_submitted -> deriveTutorStripeConnectStatus's
    // fallthrough case.
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
    expect(fake.accounts.create).not.toHaveBeenCalled();
  });

  it("never creates a duplicate account across repeat onboarding starts for the same tutor", async () => {
    const { tutorProfile } = await createTutorProfile();
    const fake = makeFakeStripeClient();
    vi.mocked(getStripeClient).mockReturnValue(fake as never);

    const first = await ensureConnectAccount(tutorProfile.id);
    const second = await ensureConnectAccount(tutorProfile.id);

    expect(first).toBe(second);
    expect(fake.accounts.create).toHaveBeenCalledTimes(1);
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

describe("createOnboardingLink", () => {
  it("creates the account link only after the account exists (correct ordering)", async () => {
    const { tutorProfile } = await createTutorProfile();
    const fake = makeFakeStripeClient();
    vi.mocked(getStripeClient).mockReturnValue(fake as never);

    const url = await createOnboardingLink(tutorProfile.id, "https://app.test/return", "https://app.test/refresh");

    expect(url).toBe("https://connect.stripe.com/setup/fake-link");
    expect(fake.__callOrder).toEqual(["accounts.create", "accountLinks.create"]);
    expect(fake.__createLinkCalls[0].account).toBe("acct_fake_1");
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

    expect(fake.accounts.create).not.toHaveBeenCalled();
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
