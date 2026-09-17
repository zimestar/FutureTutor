import { describe, it, expect } from "vitest";
import { mapResendEventType, buildEventMetadata } from "./emailEventCorrelation";
import type { WebhookEventPayload } from "resend";

// LIFECYCLE-1C — pure-logic tests (no DB) for event-type mapping and the
// metadata allowlist. DB-dependent correlation/idempotency behavior is
// covered in emailEventCorrelation.integration.test.ts and was additionally
// verified live via this project's disposable-fixture-script convention
// (same as LIFECYCLE-1B) — see the mission's final certification report.

function baseEventData(overrides: Record<string, unknown> = {}) {
  return {
    created_at: "2026-09-17T10:00:00.000Z",
    email_id: "email_abc123",
    message_id: "<abc@resend>",
    from: "noreply@futuretutor.ca",
    to: ["someone@example.com"],
    subject: "Test",
    ...overrides,
  };
}

describe("mapResendEventType", () => {
  it("maps all six supported Resend event types to the internal bounded taxonomy", () => {
    expect(mapResendEventType("email.sent")).toBe("SENT");
    expect(mapResendEventType("email.delivered")).toBe("DELIVERED");
    expect(mapResendEventType("email.opened")).toBe("OPENED");
    expect(mapResendEventType("email.clicked")).toBe("CLICKED");
    expect(mapResendEventType("email.bounced")).toBe("BOUNCED");
    expect(mapResendEventType("email.complained")).toBe("COMPLAINED");
  });

  it("§7/§46 out-of-scope Resend event types (including future/unknown ones) map to null — recognized but ignored, never thrown on", () => {
    expect(mapResendEventType("email.scheduled")).toBeNull();
    expect(mapResendEventType("email.delivery_delayed")).toBeNull();
    expect(mapResendEventType("email.received")).toBeNull();
    expect(mapResendEventType("email.failed")).toBeNull();
    expect(mapResendEventType("email.suppressed")).toBeNull();
    expect(mapResendEventType("contact.created")).toBeNull();
    expect(mapResendEventType("domain.updated")).toBeNull();
    expect(mapResendEventType("suppression.added")).toBeNull();
  });
});

describe("buildEventMetadata — §8 metadata allowlist", () => {
  it("§29 a valid futuretutor.ca clicked link is stored", () => {
    const payload = { type: "email.clicked", created_at: "2026-09-17T10:00:00.000Z", data: { ...baseEventData(), click: { link: "https://futuretutor.ca/en/tutor/training", ipAddress: "1.2.3.4", userAgent: "Mozilla/5", timestamp: "2026-09-17T10:00:00.000Z" } } } as unknown as WebhookEventPayload;
    const metadata = buildEventMetadata("CLICKED", payload);
    expect(metadata).toEqual({ link: "https://futuretutor.ca/en/tutor/training" });
  });

  it("§30 an arbitrary external clicked link is not stored — CLICKED metadata omits `link` entirely rather than storing the unsafe value", () => {
    const payload = { type: "email.clicked", created_at: "2026-09-17T10:00:00.000Z", data: { ...baseEventData(), click: { link: "https://attacker.example/phish", ipAddress: "1.2.3.4", userAgent: "Mozilla/5", timestamp: "2026-09-17T10:00:00.000Z" } } } as unknown as WebhookEventPayload;
    const metadata = buildEventMetadata("CLICKED", payload);
    expect(metadata).toBeUndefined();
  });

  it("§16/§41 CLICKED metadata never includes ipAddress or userAgent even though Resend's payload carries them", () => {
    const payload = { type: "email.clicked", created_at: "2026-09-17T10:00:00.000Z", data: { ...baseEventData(), click: { link: "https://futuretutor.ca/en", ipAddress: "1.2.3.4", userAgent: "Mozilla/5", timestamp: "2026-09-17T10:00:00.000Z" } } } as unknown as WebhookEventPayload;
    const metadata = buildEventMetadata("CLICKED", payload) as Record<string, unknown>;
    expect(metadata).not.toHaveProperty("ipAddress");
    expect(metadata).not.toHaveProperty("userAgent");
    expect(Object.keys(metadata)).toEqual(["link"]);
  });

  it("BOUNCED metadata keeps only bounceType/bounceSubType, never the free-text message", () => {
    const payload = { type: "email.bounced", created_at: "2026-09-17T10:00:00.000Z", data: { ...baseEventData(), bounce: { type: "Permanent", subType: "General", message: "550 mailbox not found for user@example.com" } } } as unknown as WebhookEventPayload;
    const metadata = buildEventMetadata("BOUNCED", payload);
    expect(metadata).toEqual({ bounceType: "Permanent", bounceSubType: "General" });
  });

  it("§41/§42 SENT/DELIVERED/OPENED/COMPLAINED carry no metadata at all (no email/name/subject leakage even indirectly)", () => {
    const sent = { type: "email.sent", created_at: "2026-09-17T10:00:00.000Z", data: baseEventData() } as unknown as WebhookEventPayload;
    const delivered = { type: "email.delivered", created_at: "2026-09-17T10:00:00.000Z", data: baseEventData() } as unknown as WebhookEventPayload;
    const opened = { type: "email.opened", created_at: "2026-09-17T10:00:00.000Z", data: baseEventData() } as unknown as WebhookEventPayload;
    const complained = { type: "email.complained", created_at: "2026-09-17T10:00:00.000Z", data: baseEventData() } as unknown as WebhookEventPayload;
    expect(buildEventMetadata("SENT", sent)).toBeUndefined();
    expect(buildEventMetadata("DELIVERED", delivered)).toBeUndefined();
    expect(buildEventMetadata("OPENED", opened)).toBeUndefined();
    expect(buildEventMetadata("COMPLAINED", complained)).toBeUndefined();
  });
});
