import { describe, it, expect } from "vitest";
import { resolveBookingEmailBaseUrl } from "./resolveBookingEmailBaseUrl";

// PROD-BOOKING-NOTIFICATIONS1-BASEURLFIX1 — this is the sole source of the
// base URL used to build booking-confirmation email CTA links. It must
// never depend on a request (no next/headers import anywhere in this
// module) and must fail closed (null) rather than guess on any invalid
// input, in either the default or explicit-override path.

describe("resolveBookingEmailBaseUrl", () => {
  it("defaults to the canonical production site.url when no explicit override is given", () => {
    expect(resolveBookingEmailBaseUrl()).toBe("https://www.futuretutor.ca");
  });

  it("defaults to site.url when explicitly passed null/undefined", () => {
    expect(resolveBookingEmailBaseUrl(null)).toBe("https://www.futuretutor.ca");
    expect(resolveBookingEmailBaseUrl(undefined)).toBe("https://www.futuretutor.ca");
  });

  it("accepts a valid explicit HTTPS baseUrl override, normalized to its origin", () => {
    expect(resolveBookingEmailBaseUrl("https://staging.futuretutor.ca/some/path")).toBe("https://staging.futuretutor.ca");
  });

  it("rejects a malformed explicit baseUrl (fails closed, returns null)", () => {
    expect(resolveBookingEmailBaseUrl("not a url")).toBeNull();
    expect(resolveBookingEmailBaseUrl("")).toBeNull();
  });

  it("rejects a non-HTTPS explicit baseUrl", () => {
    expect(resolveBookingEmailBaseUrl("http://futuretutor.ca")).toBeNull();
    expect(resolveBookingEmailBaseUrl("ftp://futuretutor.ca")).toBeNull();
  });

  it("rejects localhost/loopback explicit baseUrls — never a local link in a real email", () => {
    expect(resolveBookingEmailBaseUrl("https://localhost:3000")).toBeNull();
    expect(resolveBookingEmailBaseUrl("https://127.0.0.1")).toBeNull();
    expect(resolveBookingEmailBaseUrl("https://[::1]")).toBeNull();
    expect(resolveBookingEmailBaseUrl("https://0.0.0.0")).toBeNull();
  });

  it("hostname check is case-insensitive", () => {
    expect(resolveBookingEmailBaseUrl("https://LOCALHOST")).toBeNull();
  });
});
