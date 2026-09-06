import { describe, expect, it } from "vitest";
import { mergeByMessageId } from "./messagingMerge";
import type { MessageDto } from "./messagingPresentation";

// MESSAGING-DUPLICATE-SEND-FIX1 — real behavioral coverage of the UI-level
// dedupe helper (extracted to its own dependency-free module specifically
// so it CAN be unit-tested directly, unlike MessageThread.tsx itself, whose
// next-intl/Server Action import chain cannot load under this codebase's
// Node-environment Vitest setup — see messagingMerge.ts's own doc comment).

function msg(id: string, body: string, senderUserId = "user-1", createdAt = "2026-09-05T00:00:00.000Z"): MessageDto {
  return { id, body, senderUserId, createdAt };
}

describe("mergeByMessageId", () => {
  it("appends items from `second` that aren't already present in `first`", () => {
    const result = mergeByMessageId([msg("m1", "hi")], [msg("m2", "there")]);
    expect(result.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("a duplicate poll item id (already in `first`) appears exactly once, not twice", () => {
    const prev = [msg("m1", "hi")];
    const newer = [msg("m1", "hi"), msg("m2", "there")];
    const result = mergeByMessageId(prev, newer);
    expect(result.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("the named send/poll race: send response appends its own message, then a poll independently returns the same id — it still appears exactly once", () => {
    const afterSend = mergeByMessageId([msg("m1", "hi")], [msg("m2", "sent by me")]);
    // The next poll tick redundantly re-returns m2 (the just-sent message).
    const afterPoll = mergeByMessageId(afterSend, [msg("m2", "sent by me")]);
    expect(afterPoll.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("a duplicate id from older pagination appears exactly once, not twice", () => {
    const prev = [msg("m5", "five"), msg("m6", "six")];
    const older = [msg("m4", "four"), msg("m5", "five")]; // m5 already in prev
    const result = mergeByMessageId(older, prev);
    expect(result.map((m) => m.id)).toEqual(["m4", "m5", "m6"]);
  });

  it("older-pagination prepend keeps older messages BEFORE newer ones", () => {
    const prev = [msg("m3", "three")];
    const older = [msg("m1", "one"), msg("m2", "two")];
    const result = mergeByMessageId(older, prev);
    expect(result.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("two legitimate messages with IDENTICAL body but DIFFERENT ids both render — never deduped by content", () => {
    const result = mergeByMessageId([msg("m1", "OK")], [msg("m2", "OK")]);
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("identical body, identical sender, and near-identical timestamps never cause a false-positive dedupe — only Message.id does", () => {
    const result = mergeByMessageId(
      [msg("m1", "OK", "same-sender", "2026-09-05T00:00:00.000Z")],
      [msg("m2", "OK", "same-sender", "2026-09-05T00:00:00.001Z")]
    );
    expect(result).toHaveLength(2);
  });

  it("an empty `second` array is a no-op — returns `first` unchanged", () => {
    const first = [msg("m1", "hi")];
    expect(mergeByMessageId(first, [])).toBe(first);
  });

  it("an empty `first` array simply returns all of `second`", () => {
    const result = mergeByMessageId([], [msg("m1", "hi"), msg("m2", "there")]);
    expect(result.map((m) => m.id)).toEqual(["m1", "m2"]);
  });
});
