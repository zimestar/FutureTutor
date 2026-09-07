import { describe, expect, it } from "vitest";
import {
  ALL_KNOWN_AUDIT_ACTIONS,
  AUDIT_ACTION_CATEGORIES,
  redactAuditMetadata,
  resolveAuditActionCategory,
} from "./auditLogPresentation";

describe("resolveAuditActionCategory", () => {
  it("resolves a real, known action to its category (built from the actual codebase inventory, not invented)", () => {
    expect(resolveAuditActionCategory("tutor.suspended")).toBe("TUTOR_APPLICATION");
    expect(resolveAuditActionCategory("payment.captured")).toBe("FINANCIAL");
    expect(resolveAuditActionCategory("message_report.status_changed")).toBe("MESSAGING_SAFETY");
    expect(resolveAuditActionCategory("admin.conversation_viewed")).toBe("MESSAGING_SAFETY");
    expect(resolveAuditActionCategory("booking.cancelled_by_admin")).toBe("BOOKING_SESSION");
    expect(resolveAuditActionCategory("login")).toBe("AUTH_USER");
    expect(resolveAuditActionCategory("admin.suspended")).toBe("ADMIN");
  });

  it("resolves every dynamic quickmatch.request.* outcome (quickMatchDispatch.ts's template-literal action)", () => {
    expect(resolveAuditActionCategory("quickmatch.request.cancelled")).toBe("BOOKING_SESSION");
    expect(resolveAuditActionCategory("quickmatch.request.noTutorFound")).toBe("BOOKING_SESSION");
    expect(resolveAuditActionCategory("quickmatch.request.failed")).toBe("BOOKING_SESSION");
  });

  it("a future/unknown action falls safely into OTHER rather than throwing or being hidden", () => {
    expect(resolveAuditActionCategory("some.brand.new.action.from.a.future.mission")).toBe("OTHER");
  });

  it("categories never alter the stored action string itself — the same string is used as both the map key and the filter value", () => {
    for (const actions of Object.values(AUDIT_ACTION_CATEGORIES)) {
      for (const action of actions) {
        expect(ALL_KNOWN_AUDIT_ACTIONS).toContain(action);
      }
    }
  });

  it("no action string appears in more than one category", () => {
    const seen = new Set<string>();
    for (const actions of Object.values(AUDIT_ACTION_CATEGORIES)) {
      for (const action of actions) {
        expect(seen.has(action), `"${action}" appears in more than one category`).toBe(false);
        seen.add(action);
      }
    }
  });
});

describe("redactAuditMetadata", () => {
  it("returns an empty list for null/undefined/non-object metadata (defensive against the nullable Json column)", () => {
    expect(redactAuditMetadata(null)).toEqual([]);
    expect(redactAuditMetadata(undefined)).toEqual([]);
    expect(redactAuditMetadata("a string")).toEqual([]);
    expect(redactAuditMetadata(42)).toEqual([]);
    expect(redactAuditMetadata(["array", "not", "object"])).toEqual([]);
  });

  it("renders safe identifier fields as plain visible values", () => {
    const result = redactAuditMetadata({ bookingId: "booking-1", amountCents: 3200, status: "CONFIRMED" });
    expect(result).toEqual([
      { key: "bookingId", value: "booking-1", redacted: false },
      { key: "amountCents", value: "3200", redacted: false },
      { key: "status", value: "CONFIRMED", redacted: false },
    ]);
  });

  it("redacts keys matching a secret-shaped pattern, case-insensitively, never exposing the real value", () => {
    const result = redactAuditMetadata({ token: "abc123", SECRET: "xyz", apiKey: "sk_live_real", password: "hunter2", credential: "c" });
    expect(result.every((f) => f.redacted && f.value === "[redacted]")).toBe(true);
  });

  it("redacts fields that could carry private message content, per the explicit 'no private message body' instruction — even though no current writer stores one", () => {
    const result = redactAuditMetadata({ body: "hi there", content: "hi", text: "hi", message: "hi" });
    expect(result.every((f) => f.redacted && f.value === "[redacted]")).toBe(true);
  });

  it("does NOT over-redact a safe key that merely contains a substring like 'message' as part of a longer, safe identifier", () => {
    // messageReportId is a real, safe identifier shape — the redaction
    // pattern anchors ^message$ exactly, not a bare substring match, so
    // this must render normally.
    const result = redactAuditMetadata({ messageReportId: "report-1" });
    expect(result).toEqual([{ key: "messageReportId", value: "report-1", redacted: false }]);
  });

  it("the real admin.conversation_viewed metadata shape ({ conversationId }) renders fully, safely, unredacted", () => {
    const result = redactAuditMetadata({ conversationId: "conv-1" });
    expect(result).toEqual([{ key: "conversationId", value: "conv-1", redacted: false }]);
  });

  it("collapses a nested object/array value to a bounded placeholder rather than deep-dumping it", () => {
    const result = redactAuditMetadata({ nested: { a: 1, b: 2 }, list: [1, 2, 3] });
    expect(result).toEqual([
      { key: "nested", value: "[object]", redacted: false },
      { key: "list", value: "[array]", redacted: false },
    ]);
  });

  it("caps a long string value rather than rendering it unbounded", () => {
    const longValue = "a".repeat(1000);
    const result = redactAuditMetadata({ reason: longValue });
    expect(result[0]!.value.length).toBeLessThan(400);
    expect(result[0]!.value.endsWith("…")).toBe(true);
  });

  it("bounds the number of rendered keys even for a metadata object with many fields", () => {
    const many: Record<string, number> = {};
    for (let i = 0; i < 50; i++) many[`field${i}`] = i;
    const result = redactAuditMetadata(many);
    expect(result.length).toBeLessThanOrEqual(20);
  });

  it("null and undefined field values render as safe placeholders, never crash", () => {
    const result = redactAuditMetadata({ a: null, b: undefined });
    expect(result).toEqual([
      { key: "a", value: "null", redacted: false },
      { key: "b", value: "—", redacted: false },
    ]);
  });
});
