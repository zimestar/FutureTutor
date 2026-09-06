import { describe, expect, it } from "vitest";
import { MESSAGE_MAX_LENGTH, clientMessageIdSchema, messageBodySchema, sendMessageSchema } from "./messaging";

const VALID_UUID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

describe("messageBodySchema", () => {
  it("accepts a normal message", () => {
    expect(messageBodySchema.safeParse("Hello, see you Tuesday!").success).toBe(true);
  });

  it("trims leading/trailing whitespace", () => {
    const result = messageBodySchema.safeParse("  hello  ");
    expect(result.success && result.data).toBe("hello");
  });

  it("preserves internal newlines", () => {
    const result = messageBodySchema.safeParse("line one\nline two");
    expect(result.success && result.data).toBe("line one\nline two");
  });

  it("rejects an empty string", () => {
    expect(messageBodySchema.safeParse("").success).toBe(false);
  });

  it("rejects a whitespace-only string", () => {
    expect(messageBodySchema.safeParse("   \n\t  ").success).toBe(false);
  });

  it(`accepts exactly ${MESSAGE_MAX_LENGTH} characters`, () => {
    expect(messageBodySchema.safeParse("a".repeat(MESSAGE_MAX_LENGTH)).success).toBe(true);
  });

  it(`rejects ${MESSAGE_MAX_LENGTH + 1} characters`, () => {
    expect(messageBodySchema.safeParse("a".repeat(MESSAGE_MAX_LENGTH + 1)).success).toBe(false);
  });
});

describe("sendMessageSchema", () => {
  it("requires a non-empty conversationId", () => {
    expect(sendMessageSchema.safeParse({ conversationId: "", body: "hi", clientMessageId: VALID_UUID }).success).toBe(false);
  });

  it("accepts a valid payload", () => {
    expect(sendMessageSchema.safeParse({ conversationId: "conv-1", body: "hi", clientMessageId: VALID_UUID }).success).toBe(true);
  });

  it("MESSAGING-DUPLICATE-SEND-FIX1 — rejects a payload with a malformed clientMessageId", () => {
    expect(sendMessageSchema.safeParse({ conversationId: "conv-1", body: "hi", clientMessageId: "not-a-uuid" }).success).toBe(false);
  });
});

describe("MESSAGING-DUPLICATE-SEND-FIX1 — clientMessageIdSchema", () => {
  it("accepts a well-formed UUID", () => {
    expect(clientMessageIdSchema.safeParse(VALID_UUID).success).toBe(true);
  });

  it("rejects a malformed UUID", () => {
    expect(clientMessageIdSchema.safeParse("not-a-uuid").success).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(clientMessageIdSchema.safeParse("").success).toBe(false);
  });

  it("rejects a non-UUID-shaped string that merely looks close (wrong segment lengths)", () => {
    expect(clientMessageIdSchema.safeParse("3fa85f64-5717-4562-b3fc-2c963f66af").success).toBe(false);
  });
});
