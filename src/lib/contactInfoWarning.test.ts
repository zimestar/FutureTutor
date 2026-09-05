import { describe, expect, it } from "vitest";
import { containsPossibleContactInfo } from "./contactInfoWarning";

describe("containsPossibleContactInfo", () => {
  it("item 35 — detects an email-like string", () => {
    expect(containsPossibleContactInfo("email me at jane.doe@example.com please")).toBe(true);
  });

  it("item 35 — detects a phone-number-like string", () => {
    expect(containsPossibleContactInfo("call me at 555-123-4567")).toBe(true);
  });

  it("item 35 — detects the keyword WhatsApp (case-insensitive)", () => {
    expect(containsPossibleContactInfo("message me on WhatsApp instead")).toBe(true);
  });

  it("item 35 — detects the keyword Telegram", () => {
    expect(containsPossibleContactInfo("let's chat on telegram")).toBe(true);
  });

  it("item 35 — detects 'my number'", () => {
    expect(containsPossibleContactInfo("here's my number for emergencies")).toBe(true);
  });

  it("does not flag an ordinary tutoring message", () => {
    expect(containsPossibleContactInfo("Great work today! Let's review chapter 5 next time.")).toBe(false);
  });

  it("does not flag an empty string", () => {
    expect(containsPossibleContactInfo("")).toBe(false);
  });
});
