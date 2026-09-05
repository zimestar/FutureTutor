import { beforeEach, describe, expect, it, vi } from "vitest";

// MESSAGING-MVP1B — every Server Action resolves the authenticated user via
// auth() and passes it as the actor to the domain service (mocked here,
// already covered by its own test suite). No function accepts a userId/
// senderId from the caller.

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  listNewerMessages: vi.fn(),
  listConversationMessages: vi.fn(),
  markConversationRead: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/services/messaging", () => ({
  listNewerMessages: mocks.listNewerMessages,
  listConversationMessages: mocks.listConversationMessages,
  markConversationRead: mocks.markConversationRead,
  sendMessage: mocks.sendMessage,
}));

import { getNewerMessagesAction, getOlderMessagesAction, markConversationReadAction, sendMessageAction } from "./messaging";

const USER_ID = "user-1";
const CONVERSATION_ID = "conv-1";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: USER_ID } });
});

describe("sendMessageAction", () => {
  it("item 21 — passes the authenticated user as the actor, never a client-supplied sender", async () => {
    mocks.sendMessage.mockResolvedValue({ ok: true, message: { id: "m1", conversationId: CONVERSATION_ID, senderUserId: USER_ID, body: "hi", createdAt: new Date() } });
    await sendMessageAction(CONVERSATION_ID, "hi");
    expect(mocks.sendMessage).toHaveBeenCalledWith(USER_ID, CONVERSATION_ID, "hi");
  });

  it("item 22 — a failed send surfaces a reason without leaking internal account-state detail", async () => {
    mocks.sendMessage.mockResolvedValue({ ok: false, reason: "ACTOR_SUSPENDED" });
    const result = await sendMessageAction(CONVERSATION_ID, "hi");
    expect(result).toEqual({ ok: false, reason: "UNAVAILABLE" });
  });

  it("maps OUTSIDE_COMMUNICATION_WINDOW to a stable READ_ONLY reason for the UI", async () => {
    mocks.sendMessage.mockResolvedValue({ ok: false, reason: "OUTSIDE_COMMUNICATION_WINDOW" });
    const result = await sendMessageAction(CONVERSATION_ID, "hi");
    expect(result).toEqual({ ok: false, reason: "READ_ONLY" });
  });

  it("an unauthenticated caller cannot send", async () => {
    mocks.auth.mockResolvedValue(null);
    const result = await sendMessageAction(CONVERSATION_ID, "hi");
    expect(result).toEqual({ ok: false, reason: "NOT_AUTHORIZED" });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });
});

describe("getNewerMessagesAction (polling)", () => {
  it("item 29 — passes through the authenticated actor and cursor timestamp", async () => {
    mocks.listNewerMessages.mockResolvedValue({ ok: true, items: [] });
    await getNewerMessagesAction(CONVERSATION_ID, "2026-09-05T12:00:00.000Z");
    expect(mocks.listNewerMessages).toHaveBeenCalledWith(USER_ID, CONVERSATION_ID, expect.any(Date));
  });

  it("an invalid timestamp returns an empty array rather than throwing", async () => {
    const result = await getNewerMessagesAction(CONVERSATION_ID, "not-a-date");
    expect(result).toEqual([]);
    expect(mocks.listNewerMessages).not.toHaveBeenCalled();
  });

  it("an unauthenticated caller gets nothing", async () => {
    mocks.auth.mockResolvedValue(null);
    const result = await getNewerMessagesAction(CONVERSATION_ID, "2026-09-05T12:00:00.000Z");
    expect(result).toEqual([]);
  });
});

describe("getOlderMessagesAction (load earlier)", () => {
  it("item 32 — delegates to the bounded cursor-paginated domain query", async () => {
    mocks.listConversationMessages.mockResolvedValue({ ok: true, page: { items: [], nextCursor: null } });
    await getOlderMessagesAction(CONVERSATION_ID, "cursor-1");
    expect(mocks.listConversationMessages).toHaveBeenCalledWith(USER_ID, CONVERSATION_ID, "cursor-1");
  });

  it("an unauthorized result yields an empty page, never an error", async () => {
    mocks.listConversationMessages.mockResolvedValue({ ok: false, reason: "NOT_AUTHORIZED" });
    const result = await getOlderMessagesAction(CONVERSATION_ID, null);
    expect(result).toEqual({ items: [], nextCursor: null });
  });
});

describe("markConversationReadAction", () => {
  it("item 33 — delegates to the domain function scoped to the authenticated actor", async () => {
    mocks.markConversationRead.mockResolvedValue({ ok: true });
    const result = await markConversationReadAction(CONVERSATION_ID);
    expect(result).toEqual({ ok: true });
    expect(mocks.markConversationRead).toHaveBeenCalledWith(USER_ID, CONVERSATION_ID);
  });

  it("an unauthenticated caller cannot mark anything read", async () => {
    mocks.auth.mockResolvedValue(null);
    const result = await markConversationReadAction(CONVERSATION_ID);
    expect(result).toEqual({ ok: false });
    expect(mocks.markConversationRead).not.toHaveBeenCalled();
  });
});

describe("item 40/41/42 — no Notification/email/financial side effects exist in this module", () => {
  it("never imports notification/email/financial code", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(new URL("./messaging.ts", import.meta.url), "utf-8");
    expect(source).not.toMatch(/notifyUser|notification\.create|resend|stripe|payment\.|refund\.|tutorEarning\.|tutorTransfer\./i);
  });
});
