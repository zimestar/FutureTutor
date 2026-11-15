import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";
import { resolveReminderActivationPolicy } from "@/lib/lifecycle/reminders/activationMode";
import { LIFECYCLE_REMINDER_RETRY_BACKOFF_MINUTES } from "@/lib/lifecycle/reminders/retryPolicy";

// LIFECYCLE-ACTIVATION-1 — real-Postgres proof of: the canary gate applied
// BEFORE claim (no row ever created for a non-allowlisted recipient), the
// atomic PROCESSING claim under real concurrency (exactly one send), the
// disabled-mode no-op, and the retry sweep's backoff/eligibility rules.
// Same ambient-db redirection technique as sessionNotifications.integration
// .test.ts. Every email "send" here is an injected fake — no Resend call.

// Discovery evaluates every scanned subject serially (by design — bounded by
// `limit` per role), and the shared local test database accumulates
// fixtures from other suites, so a single call can legitimately exceed the
// default 5s budget.
vi.setConfig({ testTimeout: 60_000 });

let discoverAndClaimDueReminders: typeof import("./lifecycleReminders").discoverAndClaimDueReminders;
let processPendingReminder: typeof import("./lifecycleReminders").processPendingReminder;
let findResumableReminderIds: typeof import("./lifecycleReminders").findResumableReminderIds;

let db: PrismaClient;
const createdUserIds: string[] = [];
const createdTutorProfileIds: string[] = [];

const LIVE = resolveReminderActivationPolicy({ LIFECYCLE_REMINDERS_MODE: "live" });
const DISABLED = resolveReminderActivationPolicy({});
const canary = (email: string) =>
  resolveReminderActivationPolicy({ LIFECYCLE_REMINDERS_MODE: "canary", LIFECYCLE_REMINDERS_CANARY_EMAILS: email });

beforeAll(async () => {
  const target = resolveVerifiedTestDatabase();
  const devDatabaseUrlForSafetyCheckOnly = process.env.DATABASE_URL;
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: target.connectionString }) });
  process.env.DATABASE_URL = target.connectionString;

  ({ discoverAndClaimDueReminders, processPendingReminder, findResumableReminderIds } = await import("./lifecycleReminders"));

  const { db: ambientDb } = await import("@/lib/db");
  const [{ current_database: ambientName }] = await ambientDb.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
  if (ambientName !== target.databaseName) {
    throw new Error(`FAIL CLOSED: ambient @/lib/db is "${ambientName}", expected test database "${target.databaseName}".`);
  }
  const devName = devDatabaseUrlForSafetyCheckOnly ? new URL(devDatabaseUrlForSafetyCheckOnly).pathname.replace(/^\//, "") : null;
  if (devName && ambientName === devName) {
    throw new Error(`FAIL CLOSED: ambient @/lib/db equals the development database "${devName}".`);
  }
});

afterAll(async () => {
  await db?.$disconnect();
});

afterEach(async () => {
  if (createdTutorProfileIds.length > 0) {
    await db.lifecycleReminder.deleteMany({ where: { subjectId: { in: createdTutorProfileIds } } });
    createdTutorProfileIds.length = 0;
  }
  if (createdUserIds.length > 0) {
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
});

/** A DRAFT tutor, inactive 48h — genuinely R1-eligible per LIFECYCLE-1A. */
async function createEligibleTutor() {
  const email = `lc-activation-it-${randomUUID()}@futuretutor.test`;
  const backdated = new Date(Date.now() - 48 * 3600 * 1000);
  const user = await db.user.create({ data: { email, name: "Canary Tester", role: "TUTOR" } });
  createdUserIds.push(user.id);
  const tutorProfile = await db.tutorProfile.create({
    data: { userId: user.id, slug: `lc-activation-${randomUUID()}`, applicationStatus: "DRAFT", createdAt: backdated },
  });
  createdTutorProfileIds.push(tutorProfile.id);
  return { user, tutorProfile, email };
}

function fakeSender() {
  return vi.fn(async () => ({ providerMessageId: `fake_${randomUUID()}` }));
}

describe("canary gate is applied before claim", () => {
  it("claims only the allowlisted recipient; a non-allowlisted eligible recipient gets no row at all", async () => {
    const allowed = await createEligibleTutor();
    const notAllowed = await createEligibleTutor();

    await discoverAndClaimDueReminders({ policy: canary(allowed.email), limit: 50 });

    expect(await db.lifecycleReminder.count({ where: { subjectId: allowed.tutorProfile.id } })).toBe(1);
    expect(await db.lifecycleReminder.count({ where: { subjectId: notAllowed.tutorProfile.id } })).toBe(0);
  });

  it("disabled mode scans nothing and creates no row", async () => {
    const tutor = await createEligibleTutor();
    const claimed = await discoverAndClaimDueReminders({ policy: DISABLED, limit: 50 });
    expect(claimed).toEqual([]);
    expect(await db.lifecycleReminder.count({ where: { subjectId: tutor.tutorProfile.id } })).toBe(0);
  });
});

describe("processPendingReminder", () => {
  it("two concurrent workers on the same row produce exactly one send (atomic PROCESSING claim)", async () => {
    const tutor = await createEligibleTutor();
    const [claimed] = await discoverAndClaimDueReminders({ policy: canary(tutor.email), limit: 50 });
    const send = fakeSender();

    const outcomes = await Promise.all([
      processPendingReminder(claimed.id, send, LIVE),
      processPendingReminder(claimed.id, send, LIVE),
    ]);

    expect(send).toHaveBeenCalledTimes(1);
    expect(outcomes.sort()).toEqual(["SENT", "SKIPPED"]);
    expect((await db.lifecycleReminder.findUniqueOrThrow({ where: { id: claimed.id } })).status).toBe("SENT");
  });

  it("disabled mode at send time sends nothing and leaves the row untouched", async () => {
    const tutor = await createEligibleTutor();
    const [claimed] = await discoverAndClaimDueReminders({ policy: canary(tutor.email), limit: 50 });
    const send = fakeSender();

    expect(await processPendingReminder(claimed.id, send, DISABLED)).toBe("SKIPPED");
    expect(send).not.toHaveBeenCalled();
    const row = await db.lifecycleReminder.findUniqueOrThrow({ where: { id: claimed.id } });
    expect(row.status).toBe("PENDING");
    expect(row.attemptCount).toBe(0);
  });

  it("an address removed from the canary list between claim and send is not sent to", async () => {
    const tutor = await createEligibleTutor();
    const [claimed] = await discoverAndClaimDueReminders({ policy: canary(tutor.email), limit: 50 });
    const send = fakeSender();
    expect(await processPendingReminder(claimed.id, send, canary("someone.else@futuretutor.test"))).toBe("SKIPPED");
    expect(send).not.toHaveBeenCalled();
  });
});

describe("retry sweep", () => {
  it("a FAILED_RETRYABLE row is resumable only after the backoff, then sends successfully", async () => {
    const tutor = await createEligibleTutor();
    const [claimed] = await discoverAndClaimDueReminders({ policy: canary(tutor.email), limit: 50 });
    const failingSend = vi.fn(async () => {
      throw new Error("provider temporarily unavailable");
    });

    const failedAt = new Date();
    expect(await processPendingReminder(claimed.id, failingSend, LIVE, failedAt)).toBe("FAILED_RETRYABLE");

    expect(await findResumableReminderIds(10_000, failedAt)).not.toContain(claimed.id);
    const afterBackoff = new Date(failedAt.getTime() + (LIFECYCLE_REMINDER_RETRY_BACKOFF_MINUTES + 1) * 60_000);
    expect(await findResumableReminderIds(10_000, afterBackoff)).toContain(claimed.id);

    const send = fakeSender();
    expect(await processPendingReminder(claimed.id, send, LIVE, afterBackoff)).toBe("SENT");
    const row = await db.lifecycleReminder.findUniqueOrThrow({ where: { id: claimed.id } });
    expect(row.status).toBe("SENT");
    expect(row.attemptCount).toBe(2);
  });

  it("an orphaned PENDING row from a previous tick is resumable; one claimed this tick is not", async () => {
    const tutor = await createEligibleTutor();
    const now = new Date();
    const [claimed] = await discoverAndClaimDueReminders({ policy: canary(tutor.email), limit: 50, now });
    expect(await findResumableReminderIds(10_000, now)).not.toContain(claimed.id);
    const nextTick = new Date(now.getTime() + (LIFECYCLE_REMINDER_RETRY_BACKOFF_MINUTES + 1) * 60_000);
    expect(await findResumableReminderIds(10_000, nextTick)).toContain(claimed.id);
  });

  it("a PROCESSING row (crash mid-send — provider outcome unknown) is never auto-resumed", async () => {
    const tutor = await createEligibleTutor();
    const [claimed] = await discoverAndClaimDueReminders({ policy: canary(tutor.email), limit: 50 });
    await db.lifecycleReminder.update({ where: { id: claimed.id }, data: { status: "PROCESSING" } });
    const farFuture = new Date(Date.now() + 365 * 24 * 3600 * 1000);
    expect(await findResumableReminderIds(10_000, farFuture)).not.toContain(claimed.id);
  });

  it("a FAILED_RETRYABLE R1 being retried no longer blocks the sequence — after it sends, R2 becomes claimable", async () => {
    const tutor = await createEligibleTutor();
    const [r1] = await discoverAndClaimDueReminders({ policy: canary(tutor.email), limit: 50 });
    await processPendingReminder(r1.id, vi.fn(async () => { throw new Error("transient"); }), LIVE);
    const later = new Date(Date.now() + (LIFECYCLE_REMINDER_RETRY_BACKOFF_MINUTES + 1) * 60_000);
    expect(await processPendingReminder(r1.id, fakeSender(), LIVE, later)).toBe("SENT");

    // 48h inactive is below the 72h R2 threshold — move the clock past it.
    const pastR2 = new Date(Date.now() + 30 * 3600 * 1000);
    const next = await discoverAndClaimDueReminders({ policy: canary(tutor.email), limit: 50, now: pastR2 });
    expect(next).toHaveLength(1);
    expect(next[0].candidate.reminderNumber).toBe(2);
  });
});
