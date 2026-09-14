import { describe, expect, it } from "vitest";
import { canonicalWwwRedirectUrl } from "./canonicalHost";

// SEO-INFRA-WWW1 — Railway has no native domain-redirect feature, so the
// www -> apex canonical-host redirect is enforced in proxy.ts. This is the
// pure, directly-testable core of that check: given the incoming request
// URL, it returns the exact apex destination, or null when the request
// should be left alone. Exact hostname match only — never endsWith or
// substring — so an unrelated host can never be accidentally caught.

describe("canonicalWwwRedirectUrl", () => {
  it("redirects the www root to the exact apex root", () => {
    const result = canonicalWwwRedirectUrl(new URL("https://www.futuretutor.ca/"));
    expect(result?.toString()).toBe("https://futuretutor.ca/");
  });

  it("preserves an EN locale path", () => {
    const result = canonicalWwwRedirectUrl(new URL("https://www.futuretutor.ca/en/find-tutors"));
    expect(result?.toString()).toBe("https://futuretutor.ca/en/find-tutors");
  });

  it("preserves an FR locale path", () => {
    const result = canonicalWwwRedirectUrl(new URL("https://www.futuretutor.ca/fr/resources"));
    expect(result?.toString()).toBe("https://futuretutor.ca/fr/resources");
  });

  it("preserves a deeply nested path", () => {
    const result = canonicalWwwRedirectUrl(new URL("https://www.futuretutor.ca/en/tutoring/edmonton"));
    expect(result?.toString()).toBe("https://futuretutor.ca/en/tutoring/edmonton");
  });

  it("preserves the query string", () => {
    const result = canonicalWwwRedirectUrl(new URL("https://www.futuretutor.ca/en/find-tutors?mode=online"));
    expect(result?.toString()).toBe("https://futuretutor.ca/en/find-tutors?mode=online");
  });

  it("preserves multiple query parameters exactly", () => {
    const result = canonicalWwwRedirectUrl(new URL("https://www.futuretutor.ca/fr/subjects/math?a=1&b=2"));
    expect(result?.search).toBe("?a=1&b=2");
  });

  it("never redirects the apex itself", () => {
    expect(canonicalWwwRedirectUrl(new URL("https://futuretutor.ca/en/find-tutors"))).toBeNull();
  });

  it("never redirects localhost", () => {
    expect(canonicalWwwRedirectUrl(new URL("http://localhost:3000/en"))).toBeNull();
  });

  it("never redirects a Railway-generated domain", () => {
    expect(canonicalWwwRedirectUrl(new URL("https://futuretutor-production.up.railway.app/en"))).toBeNull();
    expect(canonicalWwwRedirectUrl(new URL("https://q2vwb12u.up.railway.app/en"))).toBeNull();
  });

  it("never redirects staging or any other subdomain — exact hostname match only, never endsWith/substring", () => {
    expect(canonicalWwwRedirectUrl(new URL("https://staging.futuretutor.ca/en"))).toBeNull();
    expect(canonicalWwwRedirectUrl(new URL("https://notwww.futuretutor.ca/en"))).toBeNull();
    expect(canonicalWwwRedirectUrl(new URL("https://evilwww.futuretutor.ca.attacker.com/en"))).toBeNull();
    expect(canonicalWwwRedirectUrl(new URL("https://www.futuretutor.ca.attacker.com/en"))).toBeNull();
  });

  it("the redirect destination can never itself be www.futuretutor.ca (no redirect loop possible)", () => {
    const result = canonicalWwwRedirectUrl(new URL("https://www.futuretutor.ca/en/find-tutors?mode=online"));
    expect(result?.hostname).toBe("futuretutor.ca");
    expect(result?.hostname).not.toBe("www.futuretutor.ca");
    // Re-running the check against the redirect's own destination confirms
    // it is a fixed point: applying the rule again never redirects again.
    expect(canonicalWwwRedirectUrl(result!)).toBeNull();
  });

  it("the destination always uses the https protocol, regardless of the incoming request's protocol", () => {
    const result = canonicalWwwRedirectUrl(new URL("http://www.futuretutor.ca/en"));
    expect(result?.protocol).toBe("https:");
  });

  it("the destination never carries an explicit port", () => {
    const result = canonicalWwwRedirectUrl(new URL("https://www.futuretutor.ca:443/en"));
    expect(result?.port).toBe("");
  });
});
