import { describe, it, expect } from "vitest";
import { getLifecycleReminderMode, getCanaryEmailAllowlist, resolveReminderActivationPolicy } from "./activationMode";

describe("getLifecycleReminderMode", () => {
  it("defaults to disabled when unset", () => {
    expect(getLifecycleReminderMode({})).toBe("disabled");
  });

  it("fails closed to disabled on any value other than the exact strings canary/live", () => {
    for (const raw of ["", "LIVE", "Live", "canary ", "true", "1", "on", "enabled", "prod"]) {
      expect(getLifecycleReminderMode({ LIFECYCLE_REMINDERS_MODE: raw }), raw).toBe("disabled");
    }
  });

  it("accepts exactly canary and live", () => {
    expect(getLifecycleReminderMode({ LIFECYCLE_REMINDERS_MODE: "canary" })).toBe("canary");
    expect(getLifecycleReminderMode({ LIFECYCLE_REMINDERS_MODE: "live" })).toBe("live");
  });
});

describe("getCanaryEmailAllowlist", () => {
  it("parses a comma-separated list, trimming and lowercasing, dropping empties", () => {
    const allowlist = getCanaryEmailAllowlist({ LIFECYCLE_REMINDERS_CANARY_EMAILS: " Owner@Example.com, ,test+canary@example.com ," });
    expect([...allowlist].sort()).toEqual(["owner@example.com", "test+canary@example.com"]);
  });

  it("is empty when unset", () => {
    expect(getCanaryEmailAllowlist({}).size).toBe(0);
  });
});

describe("resolveReminderActivationPolicy", () => {
  it("disabled permits no one", () => {
    const policy = resolveReminderActivationPolicy({ LIFECYCLE_REMINDERS_CANARY_EMAILS: "owner@example.com" });
    expect(policy.mode).toBe("disabled");
    expect(policy.isRecipientPermitted("owner@example.com")).toBe(false);
  });

  it("canary permits only allowlisted emails, case-insensitively", () => {
    const policy = resolveReminderActivationPolicy({ LIFECYCLE_REMINDERS_MODE: "canary", LIFECYCLE_REMINDERS_CANARY_EMAILS: "owner@example.com" });
    expect(policy.isRecipientPermitted("OWNER@example.com")).toBe(true);
    expect(policy.isRecipientPermitted("real.user@example.com")).toBe(false);
  });

  it("canary with an empty allowlist permits no one (never degrades to live)", () => {
    const policy = resolveReminderActivationPolicy({ LIFECYCLE_REMINDERS_MODE: "canary" });
    expect(policy.isRecipientPermitted("anyone@example.com")).toBe(false);
  });

  it("canary never matches on a substring or domain — exact address only", () => {
    const policy = resolveReminderActivationPolicy({ LIFECYCLE_REMINDERS_MODE: "canary", LIFECYCLE_REMINDERS_CANARY_EMAILS: "owner@example.com" });
    expect(policy.isRecipientPermitted("someone@example.com")).toBe(false);
    expect(policy.isRecipientPermitted("xowner@example.com")).toBe(false);
  });

  it("live permits every recipient", () => {
    const policy = resolveReminderActivationPolicy({ LIFECYCLE_REMINDERS_MODE: "live" });
    expect(policy.isRecipientPermitted("anyone@example.com")).toBe(true);
  });
});
