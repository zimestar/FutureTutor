import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// PROD-SESSION-NOTIFICATIONS1 — item 31 (cron authorization). No existing
// cron route in this codebase has its own test file (payments-tick,
// quick-match-tick, session-noshow-tick are all verified via disposable
// production scripts instead) — this is the first, kept intentionally
// small: just the auth contract and that a successful call delegates to
// the sweep + dispatch functions, mirroring the auth pattern already
// established by the other three routes exactly.

const mocks = vi.hoisted(() => ({
  sweepDueSessionReminders: vi.fn(),
  dispatchSessionNotificationsAfterCommit: vi.fn(),
}));

vi.mock("@/services/sessionNotifications", () => ({
  sweepDueSessionReminders: mocks.sweepDueSessionReminders,
  dispatchSessionNotificationsAfterCommit: mocks.dispatchSessionNotificationsAfterCommit,
}));

import { POST } from "./route";

function makeRequest(secretHeader?: string) {
  const headers = new Headers();
  if (secretHeader !== undefined) headers.set("x-cron-secret", secretHeader);
  return new Request("https://internal/api/cron/session-notifications-tick", { method: "POST", headers });
}

describe("POST /api/cron/session-notifications-tick", () => {
  const originalSecret = process.env.SESSION_NOTIFICATIONS_CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SESSION_NOTIFICATIONS_CRON_SECRET = "test-secret";
    mocks.sweepDueSessionReminders.mockResolvedValue({ bookingIds: [] });
    mocks.dispatchSessionNotificationsAfterCommit.mockResolvedValue(undefined);
  });

  afterAll(() => {
    process.env.SESSION_NOTIFICATIONS_CRON_SECRET = originalSecret;
  });

  it("500s when the secret is not configured", async () => {
    delete process.env.SESSION_NOTIFICATIONS_CRON_SECRET;
    const response = await POST(makeRequest("anything"));
    expect(response.status).toBe(500);
    expect(mocks.sweepDueSessionReminders).not.toHaveBeenCalled();
  });

  it("401s when the header is missing", async () => {
    const response = await POST(makeRequest());
    expect(response.status).toBe(401);
    expect(mocks.sweepDueSessionReminders).not.toHaveBeenCalled();
  });

  it("401s when the header does not match the configured secret", async () => {
    const response = await POST(makeRequest("wrong-secret"));
    expect(response.status).toBe(401);
    expect(mocks.sweepDueSessionReminders).not.toHaveBeenCalled();
  });

  it("200s and runs the sweep + per-booking dispatch when the secret matches", async () => {
    mocks.sweepDueSessionReminders.mockResolvedValue({ bookingIds: ["booking-1", "booking-2"] });

    const response = await POST(makeRequest("test-secret"));

    expect(response.status).toBe(200);
    expect(mocks.sweepDueSessionReminders).toHaveBeenCalledTimes(1);
    expect(mocks.dispatchSessionNotificationsAfterCommit).toHaveBeenCalledWith("booking-1");
    expect(mocks.dispatchSessionNotificationsAfterCommit).toHaveBeenCalledWith("booking-2");
    const body = await response.json();
    expect(body).toEqual({ ok: true, reminders: { bookingsTouched: 2 } });
  });

  it("dispatches for zero bookings without error when nothing is due", async () => {
    const response = await POST(makeRequest("test-secret"));
    expect(response.status).toBe(200);
    expect(mocks.dispatchSessionNotificationsAfterCommit).not.toHaveBeenCalled();
  });
});
