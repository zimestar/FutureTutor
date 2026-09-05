import { describe, expect, it } from "vitest";
import { MESSAGE_MAX_LENGTH, messageBodySchema, sendMessageSchema } from "./messaging";

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
    expect(sendMessageSchema.safeParse({ conversationId: "", body: "hi" }).success).toBe(false);
  });

  it("accepts a valid payload", () => {
    expect(sendMessageSchema.safeParse({ conversationId: "conv-1", body: "hi" }).success).toBe(true);
  });
});
