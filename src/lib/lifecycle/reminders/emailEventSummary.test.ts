import { describe, it, expect } from "vitest";
import { summarizeEmailEvents } from "./emailEventSummary";

describe("summarizeEmailEvents", () => {
  it("§23 repeated OPENED events preserve first/last without destroying the underlying count — summary is a derived view, not a replacement for history", () => {
    const events = [
      { type: "OPENED" as const, occurredAt: new Date("2026-09-17T10:00:00Z") },
      { type: "OPENED" as const, occurredAt: new Date("2026-09-17T12:00:00Z") },
      { type: "OPENED" as const, occurredAt: new Date("2026-09-17T09:00:00Z") },
    ];
    const summary = summarizeEmailEvents(events);
    expect(summary.firstOpenedAt).toEqual(new Date("2026-09-17T09:00:00Z"));
    expect(summary.lastOpenedAt).toEqual(new Date("2026-09-17T12:00:00Z"));
  });

  it("repeated CLICKED events derive first/last independently of OPENED", () => {
    const events = [
      { type: "CLICKED" as const, occurredAt: new Date("2026-09-17T11:00:00Z") },
      { type: "CLICKED" as const, occurredAt: new Date("2026-09-17T15:00:00Z") },
    ];
    const summary = summarizeEmailEvents(events);
    expect(summary.firstClickedAt).toEqual(new Date("2026-09-17T11:00:00Z"));
    expect(summary.lastClickedAt).toEqual(new Date("2026-09-17T15:00:00Z"));
    expect(summary.firstOpenedAt).toBeNull();
  });

  it("DELIVERED/BOUNCED/COMPLAINED each derive their own earliest timestamp", () => {
    const events = [
      { type: "DELIVERED" as const, occurredAt: new Date("2026-09-17T08:00:00Z") },
      { type: "BOUNCED" as const, occurredAt: new Date("2026-09-17T08:30:00Z") },
      { type: "COMPLAINED" as const, occurredAt: new Date("2026-09-17T09:00:00Z") },
    ];
    const summary = summarizeEmailEvents(events);
    expect(summary.deliveredAt).toEqual(new Date("2026-09-17T08:00:00Z"));
    expect(summary.bouncedAt).toEqual(new Date("2026-09-17T08:30:00Z"));
    expect(summary.complainedAt).toEqual(new Date("2026-09-17T09:00:00Z"));
  });

  it("an empty event list produces an all-null summary, never throws", () => {
    const summary = summarizeEmailEvents([]);
    expect(Object.values(summary).every((v) => v === null)).toBe(true);
  });

  it("SENT events are ignored (already represented by LifecycleReminder.sentAt)", () => {
    const summary = summarizeEmailEvents([{ type: "SENT", occurredAt: new Date() }]);
    expect(Object.values(summary).every((v) => v === null)).toBe(true);
  });

  it("§22 nothing in the summary shape or this module ever labels OPENED as 'read'", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("./emailEventSummary.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/\bread\b/i);
  });
});
