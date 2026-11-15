import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// LIFECYCLE-ACTIVATION-1 — the cron route's two-key gating contract
// (secret AND mode). Services mocked: this file never touches a database
// and never constructs an email sender that could reach Resend.

const mocks = vi.hoisted(() => ({
  discoverAndClaimDueReminders: vi.fn(),
  processPendingReminder: vi.fn(),
  findResumableReminderIds: vi.fn(),
  resolveSendLifecycleReminderEmail: vi.fn(),
}));

vi.mock("@/services/lifecycleReminders", () => ({
  discoverAndClaimDueReminders: mocks.discoverAndClaimDueReminders,
  processPendingReminder: mocks.processPendingReminder,
  findResumableReminderIds: mocks.findResumableReminderIds,
}));
vi.mock("@/lib/email/sendLifecycleReminderEmail", () => ({
  resolveSendLifecycleReminderEmail: mocks.resolveSendLifecycleReminderEmail,
}));

const SECRET = "test-cron-secret";

function tick(secret?: string): Request {
  return new Request("https://futuretutor.ca/api/cron/lifecycle-reminders-tick", {
    method: "POST",
    headers: secret ? { "x-cron-secret": secret } : {},
  });
}

describe("POST /api/cron/lifecycle-reminders-tick", () => {
  const original = {
    secret: process.env.LIFECYCLE_REMINDERS_CRON_SECRET,
    mode: process.env.LIFECYCLE_REMINDERS_MODE,
    canary: process.env.LIFECYCLE_REMINDERS_CANARY_EMAILS,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LIFECYCLE_REMINDERS_CRON_SECRET = SECRET;
    delete process.env.LIFECYCLE_REMINDERS_MODE;
    delete process.env.LIFECYCLE_REMINDERS_CANARY_EMAILS;
    mocks.discoverAndClaimDueReminders.mockResolvedValue([]);
    mocks.findResumableReminderIds.mockResolvedValue([]);
    mocks.resolveSendLifecycleReminderEmail.mockReturnValue(vi.fn());
  });

  afterEach(() => {
    for (const [key, value] of [
      ["LIFECYCLE_REMINDERS_CRON_SECRET", original.secret],
      ["LIFECYCLE_REMINDERS_MODE", original.mode],
      ["LIFECYCLE_REMINDERS_CANARY_EMAILS", original.canary],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("fails closed with 500 when the cron secret is not configured", async () => {
    delete process.env.LIFECYCLE_REMINDERS_CRON_SECRET;
    const { POST } = await import("./route");
    const response = await POST(tick(SECRET));
    expect(response.status).toBe(500);
    expect(mocks.discoverAndClaimDueReminders).not.toHaveBeenCalled();
  });

  it("rejects a wrong or missing secret with 401", async () => {
    const { POST } = await import("./route");
    expect((await POST(tick("wrong"))).status).toBe(401);
    expect((await POST(tick())).status).toBe(401);
    expect(mocks.discoverAndClaimDueReminders).not.toHaveBeenCalled();
  });

  it("with a valid secret but no mode set, does nothing at all (disabled is the default)", async () => {
    const { POST } = await import("./route");
    const response = await POST(tick(SECRET));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ mode: "disabled", claimed: 0 });
    expect(mocks.discoverAndClaimDueReminders).not.toHaveBeenCalled();
    expect(mocks.findResumableReminderIds).not.toHaveBeenCalled();
    expect(mocks.processPendingReminder).not.toHaveBeenCalled();
    expect(mocks.resolveSendLifecycleReminderEmail).not.toHaveBeenCalled();
  });

  it("a mistyped mode is treated as disabled", async () => {
    process.env.LIFECYCLE_REMINDERS_MODE = "LIVE";
    const { POST } = await import("./route");
    const response = await POST(tick(SECRET));
    expect(await response.json()).toMatchObject({ mode: "disabled" });
    expect(mocks.discoverAndClaimDueReminders).not.toHaveBeenCalled();
  });

  it("in canary mode, passes a policy that only permits allowlisted emails", async () => {
    process.env.LIFECYCLE_REMINDERS_MODE = "canary";
    process.env.LIFECYCLE_REMINDERS_CANARY_EMAILS = "owner@example.com";
    const { POST } = await import("./route");
    await POST(tick(SECRET));
    const { policy } = mocks.discoverAndClaimDueReminders.mock.calls[0][0];
    expect(policy.mode).toBe("canary");
    expect(policy.isRecipientPermitted("owner@example.com")).toBe(true);
    expect(policy.isRecipientPermitted("real.user@example.com")).toBe(false);
  });

  it("processes fresh claims then the retry sweep, passing the same policy, and aggregates outcomes", async () => {
    process.env.LIFECYCLE_REMINDERS_MODE = "canary";
    process.env.LIFECYCLE_REMINDERS_CANARY_EMAILS = "owner@example.com";
    mocks.discoverAndClaimDueReminders.mockResolvedValue([{ id: "fresh-1" }]);
    mocks.findResumableReminderIds.mockResolvedValue(["retry-1"]);
    mocks.processPendingReminder.mockResolvedValueOnce("SENT").mockResolvedValueOnce("SKIPPED");
    const { POST } = await import("./route");
    const body = await (await POST(tick(SECRET))).json();
    expect(mocks.processPendingReminder.mock.calls.map((c) => c[0])).toEqual(["fresh-1", "retry-1"]);
    expect(mocks.processPendingReminder.mock.calls[0][2].mode).toBe("canary");
    expect(body).toMatchObject({ mode: "canary", claimed: 1, resumed: 1, outcomes: { SENT: 1, SKIPPED: 1 } });
  });

  it("one reminder throwing never aborts the rest of the batch", async () => {
    process.env.LIFECYCLE_REMINDERS_MODE = "live";
    mocks.discoverAndClaimDueReminders.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    mocks.processPendingReminder.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("SENT");
    const { POST } = await import("./route");
    const body = await (await POST(tick(SECRET))).json();
    expect(mocks.processPendingReminder).toHaveBeenCalledTimes(2);
    expect(body.outcomes.SENT).toBe(1);
  });
});
