import { describe, it, expect } from "vitest";
import { validateClickLink } from "./clickLinkValidation";

// LIFECYCLE-1C schema decision §9 / §21 — click-link validation. Test
// numbering matches the mission's own required additions where applicable.

describe("validateClickLink", () => {
  it("§28 accepts a valid https://futuretutor.ca destination", () => {
    expect(validateClickLink("https://futuretutor.ca/en/tutor/training")).toBe("https://futuretutor.ca/en/tutor/training");
  });

  it("§27 rejects an arbitrary external domain", () => {
    expect(validateClickLink("https://attacker.example/phish")).toBeNull();
  });

  it("rejects plain http (non-TLS)", () => {
    expect(validateClickLink("http://futuretutor.ca/en/tutor/training")).toBeNull();
  });

  it("rejects a javascript: URL", () => {
    expect(validateClickLink("javascript:alert(1)")).toBeNull();
  });

  it("rejects a data: URL", () => {
    expect(validateClickLink("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("rejects a file: URL", () => {
    expect(validateClickLink("file:///etc/passwd")).toBeNull();
  });

  it("rejects a subdomain-confusion host (futuretutor.ca.attacker.example) — exact hostname match only, never a suffix/substring check", () => {
    expect(validateClickLink("https://futuretutor.ca.attacker.example/")).toBeNull();
  });

  it("rejects a prefix-confusion host (attacker-futuretutor.ca)", () => {
    expect(validateClickLink("https://attacker-futuretutor.ca/")).toBeNull();
  });

  it("rejects userinfo-host confusion (https://futuretutor.ca@attacker.example/)", () => {
    expect(validateClickLink("https://futuretutor.ca@attacker.example/")).toBeNull();
  });

  it("rejects a URL carrying credentials even when the host itself is otherwise allowlisted", () => {
    expect(validateClickLink("https://user:pass@futuretutor.ca/")).toBeNull();
  });

  it("rejects a completely invalid/unparseable URL string", () => {
    expect(validateClickLink("not a url at all")).toBeNull();
    expect(validateClickLink("")).toBeNull();
  });

  it("rejects www.futuretutor.ca — not in the allowlist (this application's own deep links only ever generate the apex origin)", () => {
    expect(validateClickLink("https://www.futuretutor.ca/en/tutor/training")).toBeNull();
  });

  it("hostname matching is case-insensitive but still exact", () => {
    expect(validateClickLink("https://FutureTutor.ca/en")).toBe("https://futuretutor.ca/en");
  });
});
