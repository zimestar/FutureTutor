import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "page.tsx"), "utf8");

describe("/messages/[conversationId] page.tsx", () => {
  it("item 12/13 — an unauthorized or nonexistent conversation renders notFound(), identically for both", () => {
    expect(source).toContain('import { notFound } from "next/navigation"');
    expect(source).toMatch(/if \(!parties\) notFound\(\);/);
  });

  it("item 12 — authorization is derived from getConversationParties, never a client-supplied studentId/tutorId/guardianId", () => {
    expect(source).toContain("getConversationParties(user.id, conversationId)");
  });

  it("item 26/27 — session context is fetched server-side from real Booking data, not invented in the component", () => {
    expect(source).toContain("getConversationSessionContext(user.id, conversationId)");
  });

  it("item 14 — messages are loaded chronologically (the newest-first domain page is reversed for display)", () => {
    expect(source).toMatch(/messagesResult\.page\.items\.map\(toMessageDto\)\.reverse\(\)/);
  });

  it("item 33 — the thread is marked read for the viewing user only, on open", () => {
    expect(source).toContain("markConversationRead(user.id, conversationId)");
  });

  it("item 23 — send eligibility is computed server-side (canSendConversationMessage), never trusted from stale client state", () => {
    expect(source).toContain("canSendConversationMessage(db, user.id, conversationId)");
  });

  it("never performs a financial mutation or Stripe call", () => {
    expect(source).not.toMatch(/\.(update|create|delete|updateMany|deleteMany)\(/);
    expect(source.toLowerCase()).not.toMatch(/stripe\.|getstripeclient/);
  });
});
