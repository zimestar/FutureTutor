import { describe, it, expect } from "vitest";
import { getClientIp } from "./rateLimit";

// BETA-OPS1 — pure unit coverage for the best-effort client-IP extraction
// used as the secondary (never sole) rate-limit dimension. See
// accountSuspension.integration.test.ts for the DB-backed checkRateLimit/
// checkActionRateLimit coverage.

describe("getClientIp", () => {
  it("reads the leftmost x-forwarded-for entry as the client-reported IP", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1, 10.0.0.2" });
    expect(getClientIp(headers)).toBe("203.0.113.5");
  });

  it("trims whitespace around the leftmost entry", () => {
    const headers = new Headers({ "x-forwarded-for": "  203.0.113.5  , 10.0.0.1" });
    expect(getClientIp(headers)).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const headers = new Headers({ "x-real-ip": "198.51.100.7" });
    expect(getClientIp(headers)).toBe("198.51.100.7");
  });

  it("returns null when neither header is present", () => {
    expect(getClientIp(new Headers())).toBeNull();
  });
});
